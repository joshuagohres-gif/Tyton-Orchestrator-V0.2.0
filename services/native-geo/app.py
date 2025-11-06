"""
FastAPI Inference Service for Native Geometry Model

POST /refine endpoint that takes (mesh, uv, proposal) and returns
(mask vertexIds, params, confidence)
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
import torch
import numpy as np
from pathlib import Path
import logging

from ml.uvnet.models.unet import UVUNet

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Native Geometry Model Inference")

# Load model (lazy loading)
_model = None
_device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

def load_model(model_path: str):
    """Load UNet model"""
    global _model
    if _model is None:
        _model = UVUNet(in_channels=4, num_params=5)
        _model.load_state_dict(torch.load(model_path, map_location=_device))
        _model.to(_device)
        _model.eval()
        logger.info(f"Loaded model from {model_path}")
    return _model

class MeshInput(BaseModel):
    """Mesh input"""
    vertices: List[List[float]]  # (N, 3) xyz
    faces: List[List[int]]  # (F, 3) triangle indices
    uv: Optional[List[List[float]]] = None  # (N, 2) UV coordinates

class ProposalInput(BaseModel):
    """LLM proposal"""
    uv_box: Dict[str, float]  # {uMin, uMax, vMin, vMax}
    op_type: str
    rough_params: Optional[Dict] = None

class RefineRequest(BaseModel):
    """Refine request"""
    mesh: MeshInput
    proposal: ProposalInput

class RefineResponse(BaseModel):
    """Refine response"""
    mask_vertex_ids: List[int]
    params: Dict[str, float]
    confidence: float
    mask_rasterized: Optional[List[List[float]]] = None  # (H, W) for visualization

def rasterize_uv_grid(mesh: MeshInput, resolution: int = 256) -> np.ndarray:
    """Rasterize mesh to UV occupancy grid"""
    grid = np.zeros((resolution, resolution), dtype=np.float32)
    
    if mesh.uv is None:
        # Simple projection if UV not provided
        vertices = np.array(mesh.vertices)
        uv = vertices[:, :2] / (vertices[:, :2].max() + 1e-6)
    else:
        uv = np.array(mesh.uv)
    
    # Rasterize triangles
    for face in mesh.faces:
        v0, v1, v2 = uv[face[0]], uv[face[1]], uv[face[2]]
        
        # Bounding box
        u_min = max(0, int(np.floor(min(v0[0], v1[0], v2[0]) * resolution)))
        u_max = min(resolution, int(np.ceil(max(v0[0], v1[0], v2[0]) * resolution)))
        v_min = max(0, int(np.floor(min(v0[1], v1[1], v2[1]) * resolution)))
        v_max = min(resolution, int(np.ceil(max(v0[1], v1[1], v2[1]) * resolution)))
        
        # Rasterize
        for v in range(v_min, v_max):
            for u in range(u_min, u_max):
                u_norm = u / resolution
                v_norm = v / resolution
                
                if point_in_triangle([u_norm, v_norm], v0, v1, v2):
                    grid[v, u] = 1.0
    
    return grid

def point_in_triangle(p: List[float], v0: np.ndarray, v1: np.ndarray, v2: np.ndarray) -> bool:
    """Barycentric test"""
    v0v1 = v1 - v0
    v0v2 = v2 - v0
    v0p = np.array(p) - v0
    
    dot00 = np.dot(v0v2, v0v2)
    dot01 = np.dot(v0v2, v0v1)
    dot02 = np.dot(v0v2, v0p)
    dot11 = np.dot(v0v1, v0v1)
    dot12 = np.dot(v0v1, v0p)
    
    inv_denom = 1 / (dot00 * dot11 - dot01 * dot01)
    u = (dot11 * dot02 - dot01 * dot12) * inv_denom
    v = (dot00 * dot12 - dot01 * dot02) * inv_denom
    
    return (u >= 0) and (v >= 0) and (u + v <= 1)

def create_input_channels(
    uv_grid: np.ndarray,
    proposal: ProposalInput,
    resolution: int = 256
) -> np.ndarray:
    """Create input channels for UNet"""
    channels = []
    
    # Occupancy
    channels.append(uv_grid)
    
    # Rough box mask (from LLM proposal)
    rough_box = np.zeros((resolution, resolution), dtype=np.float32)
    u_min = int(proposal.uv_box['uMin'] * resolution)
    u_max = int(proposal.uv_box['uMax'] * resolution)
    v_min = int(proposal.uv_box['vMin'] * resolution)
    v_max = int(proposal.uv_box['vMax'] * resolution)
    rough_box[v_min:v_max, u_min:u_max] = 1.0
    channels.append(rough_box)
    
    # Operation type one-hot (simplified - just add_hole vs extrude)
    op_channel = np.zeros((resolution, resolution), dtype=np.float32)
    if proposal.op_type == "add_hole":
        op_channel.fill(1.0)
    channels.append(op_channel)
    
    # Thickness (placeholder - would come from mesh analysis)
    thickness = np.ones((resolution, resolution), dtype=np.float32) * 0.5
    channels.append(thickness)
    
    return np.stack(channels, axis=0)

def postprocess_mask(mask: np.ndarray, threshold: float = 0.5) -> np.ndarray:
    """Postprocess mask: threshold, connected components, largest CC"""
    binary = (mask > threshold).astype(np.float32)
    
    # Find largest connected component
    from scipy import ndimage
    labeled, num_features = ndimage.label(binary)
    if num_features == 0:
        return binary
    
    # Get largest component
    component_sizes = ndimage.sum(binary, labeled, range(1, num_features + 1))
    largest_component = np.argmax(component_sizes) + 1
    largest_mask = (labeled == largest_component).astype(np.float32)
    
    return largest_mask

def compute_confidence(mask: np.ndarray, params: np.ndarray) -> float:
    """Compute confidence from mask entropy and param uncertainty"""
    # Mask entropy (lower = more confident)
    mask_entropy = -np.sum(
        mask * np.log(mask + 1e-7) + (1 - mask) * np.log(1 - mask + 1e-7)
    ) / (mask.shape[0] * mask.shape[1])
    
    # Normalize to [0, 1]
    mask_conf = 1.0 - np.clip(mask_entropy / 10.0, 0, 1)
    
    # Param confidence (simpler - based on magnitude)
    param_conf = 1.0 - np.clip(np.std(params) / 2.0, 0, 1)
    
    return (mask_conf + param_conf) / 2.0

@app.post("/refine", response_model=RefineResponse)
async def refine(request: RefineRequest):
    """Refine LLM proposal with native model"""
    try:
        # Load model if needed
        model_path = Path("ml/uvnet/models/final_model.pt")
        if not model_path.exists():
            raise HTTPException(
                status_code=503,
                detail="Model not found. Please train the model first."
            )
        
        model = load_model(str(model_path))
        
        # Rasterize mesh
        uv_grid = rasterize_uv_grid(request.mesh, resolution=256)
        
        # Create input channels
        input_channels = create_input_channels(uv_grid, request.proposal, resolution=256)
        
        # Run inference
        with torch.no_grad():
            input_tensor = torch.FloatTensor(input_channels).unsqueeze(0).to(_device)
            mask_pred, params_pred = model(input_tensor)
            
            mask_pred = mask_pred.squeeze().cpu().numpy()
            params_pred = params_pred.squeeze().cpu().numpy()
        
        # Postprocess mask
        mask_processed = postprocess_mask(mask_pred)
        
        # Find vertex IDs in mask
        mesh_uv = np.array(request.mesh.uv) if request.mesh.uv else None
        if mesh_uv is None:
            vertices = np.array(request.mesh.vertices)
            mesh_uv = vertices[:, :2] / (vertices[:, :2].max() + 1e-6)
        
        mask_vertex_ids = []
        for i, uv in enumerate(mesh_uv):
            u_idx = int(uv[0] * 256)
            v_idx = int(uv[1] * 256)
            if 0 <= u_idx < 256 and 0 <= v_idx < 256:
                if mask_processed[v_idx, u_idx] > 0.5:
                    mask_vertex_ids.append(i)
        
        # Extract params
        if request.proposal.op_type == "add_hole":
            params_dict = {
                "diameterMm": float(params_pred[0] * 100.0),  # Denormalize
            }
        elif request.proposal.op_type == "extrude_region":
            params_dict = {
                "heightMm": float(params_pred[1] * 100.0),
                "taperAngleDegrees": float(params_pred[2] * 90.0),
            }
        else:
            params_dict = {}
        
        # Compute confidence
        confidence = compute_confidence(mask_pred, params_pred)
        
        return RefineResponse(
            mask_vertex_ids=mask_vertex_ids,
            params=params_dict,
            confidence=float(confidence),
            mask_rasterized=mask_processed.tolist()
        )
    
    except Exception as e:
        logger.error(f"Refine error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    """Health check"""
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
