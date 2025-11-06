"""
UV-grid UNet Model - Dataset Synthesis

Generates synthetic training data:
1. Parametric base meshes (boxes, filleted boxes, extruded plates)
2. Tutte UV computation (via TypeScript service or Python reimplementation)
3. UV occupancy grid rendering (256x256)
4. Ground-truth operations (holes, extrusions, vents) with constraints
5. HDF5 shard storage
"""

import numpy as np
import h5py
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import json

@dataclass
class MeshData:
    """Mesh representation"""
    vertices: np.ndarray  # (N, 3) xyz coordinates
    faces: np.ndarray    # (F, 3) triangle indices
    uv: np.ndarray       # (N, 2) UV coordinates
    
@dataclass
class OperationGT:
    """Ground truth operation"""
    op_type: str  # "add_hole", "extrude_region", etc.
    uv_box: Tuple[float, float, float, float]  # (uMin, uMax, vMin, vMax)
    params: Dict
    mask: np.ndarray  # (H, W) binary mask
    vertex_ids: List[int]  # Vertex IDs in region

@dataclass
class Sample:
    """Training sample"""
    mesh_id: str
    uv_grid: np.ndarray  # (C, H, W) input channels
    mask_gt: np.ndarray  # (H, W) ground truth mask
    params_gt: np.ndarray  # (P,) operation parameters
    envelope_gt: Dict  # Full operation envelope

class MeshGenerator:
    """Generates parametric base meshes"""
    
    @staticmethod
    def box(length: float, width: float, height: float) -> MeshData:
        """Generate a box mesh"""
        vertices = np.array([
            [0, 0, 0],
            [length, 0, 0],
            [length, width, 0],
            [0, width, 0],
            [0, 0, height],
            [length, 0, height],
            [length, width, height],
            [0, width, height],
        ], dtype=np.float32)
        
        faces = np.array([
            [0, 1, 2], [0, 2, 3],  # bottom
            [4, 7, 6], [4, 6, 5],  # top
            [0, 4, 5], [0, 5, 1],  # front
            [2, 6, 7], [2, 7, 3],  # back
            [0, 3, 7], [0, 7, 4],  # left
            [1, 5, 6], [1, 6, 2],  # right
        ], dtype=np.int32)
        
        # Simple UV mapping (project to XY plane)
        uv = vertices[:, :2] / max(length, width)
        
        return MeshData(vertices=vertices, faces=faces, uv=uv)
    
    @staticmethod
    def plate(length: float, width: float, thickness: float) -> MeshData:
        """Generate a flat plate mesh"""
        vertices = np.array([
            [0, 0, 0],
            [length, 0, 0],
            [length, width, 0],
            [0, width, 0],
        ], dtype=np.float32)
        
        faces = np.array([
            [0, 1, 2],
            [0, 2, 3],
        ], dtype=np.int32)
        
        uv = vertices[:, :2] / max(length, width)
        
        return MeshData(vertices=vertices, faces=faces, uv=uv)

class UVGridRenderer:
    """Renders UV occupancy grid from mesh"""
    
    def __init__(self, resolution: int = 256):
        self.resolution = resolution
    
    def render(self, mesh: MeshData, tags: Optional[Dict[str, np.ndarray]] = None) -> np.ndarray:
        """
        Render UV occupancy grid
        
        Returns:
            channels: (C, H, W) where C includes:
                - occ: occupancy (1 if UV pixel belongs to surface)
                - tags: one-hot per tag
                - thickness: estimated wall thickness (optional)
        """
        H, W = self.resolution, self.resolution
        channels = []
        
        # Occupancy channel
        occ = np.zeros((H, W), dtype=np.float32)
        
        # Rasterize triangles
        for face in mesh.faces:
            v0, v1, v2 = mesh.uv[face[0]], mesh.uv[face[1]], mesh.uv[face[2]]
            
            # Bounding box in UV
            u_min = max(0, int(np.floor(min(v0[0], v1[0], v2[0]) * W)))
            u_max = min(W, int(np.ceil(max(v0[0], v1[0], v2[0]) * W)))
            v_min = max(0, int(np.floor(min(v0[1], v1[1], v2[1]) * H)))
            v_max = min(H, int(np.ceil(max(v0[1], v1[1], v2[1]) * H)))
            
            # Rasterize triangle
            for v in range(v_min, v_max):
                for u in range(u_min, u_max):
                    u_norm = u / W
                    v_norm = v / H
                    
                    if self._point_in_triangle([u_norm, v_norm], v0, v1, v2):
                        occ[v, u] = 1.0
        
        channels.append(occ)
        
        # Tag channels (if provided)
        if tags:
            for tag_name, tag_mask in tags.items():
                channels.append(tag_mask)
        
        return np.stack(channels, axis=0)
    
    def _point_in_triangle(self, p: List[float], v0: np.ndarray, v1: np.ndarray, v2: np.ndarray) -> bool:
        """Barycentric test for point in triangle"""
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

class OperationSampler:
    """Samples ground-truth operations within constraints"""
    
    def __init__(self, min_wall_thickness: float = 1.0, min_feature_size: float = 0.5):
        self.min_wall_thickness = min_wall_thickness
        self.min_feature_size = min_feature_size
    
    def sample_hole(
        self,
        mesh: MeshData,
        uv_grid: np.ndarray,
        resolution: int = 256
    ) -> Optional[OperationGT]:
        """Sample a hole operation"""
        # Find valid region (away from edges, respecting wall thickness)
        occ = uv_grid[0]  # Occupancy channel
        
        # Sample center in valid region
        valid_y, valid_x = np.where(occ > 0.5)
        if len(valid_y) == 0:
            return None
        
        idx = np.random.randint(len(valid_y))
        center_u = valid_x[idx] / resolution
        center_v = valid_y[idx] / resolution
        
        # Sample diameter (respecting constraints)
        max_diameter = min(0.2, 1.0 - 2 * self.min_wall_thickness / 100.0)
        diameter = np.random.uniform(self.min_feature_size / 100.0, max_diameter)
        
        # Create UV box
        radius_uv = diameter / 2.0
        u_min = max(0, center_u - radius_uv)
        u_max = min(1, center_u + radius_uv)
        v_min = max(0, center_v - radius_uv)
        v_max = min(1, center_v + radius_uv)
        
        # Create mask
        mask = np.zeros((resolution, resolution), dtype=np.float32)
        y_coords, x_coords = np.meshgrid(
            np.linspace(0, 1, resolution),
            np.linspace(0, 1, resolution),
            indexing='ij'
        )
        dist = np.sqrt((x_coords - center_u)**2 + (y_coords - center_v)**2)
        mask[dist <= radius_uv] = 1.0
        
        # Find vertex IDs in region
        vertex_ids = []
        for i, uv in enumerate(mesh.uv):
            if (u_min <= uv[0] <= u_max and v_min <= uv[1] <= v_max):
                vertex_ids.append(i)
        
        return OperationGT(
            op_type="add_hole",
            uv_box=(u_min, u_max, v_min, v_max),
            params={
                "shape": "circular",
                "diameterMm": diameter * 100.0,  # Convert to mm
                "throughAll": True,
            },
            mask=mask,
            vertex_ids=vertex_ids
        )
    
    def sample_extrude(
        self,
        mesh: MeshData,
        uv_grid: np.ndarray,
        resolution: int = 256
    ) -> Optional[OperationGT]:
        """Sample an extrusion operation"""
        occ = uv_grid[0]
        valid_y, valid_x = np.where(occ > 0.5)
        if len(valid_y) == 0:
            return None
        
        # Sample rectangular region
        idx = np.random.randint(len(valid_y))
        center_u = valid_x[idx] / resolution
        center_v = valid_y[idx] / resolution
        
        size_u = np.random.uniform(0.05, 0.2)
        size_v = np.random.uniform(0.05, 0.2)
        
        u_min = max(0, center_u - size_u / 2)
        u_max = min(1, center_u + size_u / 2)
        v_min = max(0, center_v - size_v / 2)
        v_max = min(1, center_v + size_v / 2)
        
        # Create mask
        mask = np.zeros((resolution, resolution), dtype=np.float32)
        y_coords, x_coords = np.meshgrid(
            np.linspace(0, 1, resolution),
            np.linspace(0, 1, resolution),
            indexing='ij'
        )
        mask[
            (x_coords >= u_min) & (x_coords <= u_max) &
            (y_coords >= v_min) & (y_coords <= v_max)
        ] = 1.0
        
        vertex_ids = []
        for i, uv in enumerate(mesh.uv):
            if (u_min <= uv[0] <= u_max and v_min <= uv[1] <= v_max):
                vertex_ids.append(i)
        
        return OperationGT(
            op_type="extrude_region",
            uv_box=(u_min, u_max, v_min, v_max),
            params={
                "mode": "solid",
                "direction": np.random.choice(["outward_surface_normal", "axis_z"]),
                "heightMm": np.random.uniform(1.0, 10.0),
                "taperAngleDegrees": np.random.uniform(0, 10),
                "capType": "flat",
            },
            mask=mask,
            vertex_ids=vertex_ids
        )

class DatasetSynthesizer:
    """Main synthesizer class"""
    
    def __init__(self, resolution: int = 256):
        self.mesh_gen = MeshGenerator()
        self.renderer = UVGridRenderer(resolution)
        self.sampler = OperationSampler()
        self.resolution = resolution
    
    def generate_sample(self, op_type: str = "add_hole") -> Optional[Sample]:
        """Generate a single training sample"""
        # Generate base mesh
        if np.random.rand() < 0.5:
            mesh = self.mesh_gen.box(
                length=np.random.uniform(50, 200),
                width=np.random.uniform(50, 200),
                height=np.random.uniform(10, 50)
            )
        else:
            mesh = self.mesh_gen.plate(
                length=np.random.uniform(100, 300),
                width=np.random.uniform(100, 300),
                thickness=np.random.uniform(2, 10)
            )
        
        # Render UV grid
        uv_grid = self.renderer.render(mesh)
        
        # Sample operation
        if op_type == "add_hole":
            op_gt = self.sampler.sample_hole(mesh, uv_grid, self.resolution)
        elif op_type == "extrude_region":
            op_gt = self.sampler.sample_extrude(mesh, uv_grid, self.resolution)
        else:
            return None
        
        if op_gt is None:
            return None
        
        # Build envelope
        envelope = {
            "schemaVersion": 1,
            "operations": [{
                "opId": f"op_{np.random.randint(10000)}",
                "type": op_gt.op_type,
                "description": f"Generated {op_gt.op_type}",
                "target": {
                    "kind": "uv_region",
                    "uvBox": {
                        "uMin": op_gt.uv_box[0],
                        "uMax": op_gt.uv_box[1],
                        "vMin": op_gt.uv_box[2],
                        "vMax": op_gt.uv_box[3],
                    }
                },
                "params": op_gt.params,
                "priority": 1,
                "dependsOn": [],
                "notes": ""
            }]
        }
        
        # Extract params vector (diameter, height, taper, etc.)
        params_gt = self._extract_params_vector(op_gt)
        
        return Sample(
            mesh_id=f"mesh_{np.random.randint(100000)}",
            uv_grid=uv_grid,
            mask_gt=op_gt.mask,
            params_gt=params_gt,
            envelope_gt=envelope
        )
    
    def _extract_params_vector(self, op_gt: OperationGT) -> np.ndarray:
        """Extract parameter vector from operation"""
        if op_gt.op_type == "add_hole":
            return np.array([
                op_gt.params.get("diameterMm", 0) / 100.0,  # Normalize
                0, 0, 0, 0  # Placeholder for other params
            ], dtype=np.float32)
        elif op_gt.op_type == "extrude_region":
            return np.array([
                0,  # No diameter
                op_gt.params.get("heightMm", 0) / 100.0,  # Normalize
                op_gt.params.get("taperAngleDegrees", 0) / 90.0,  # Normalize
                0, 0  # Placeholder
            ], dtype=np.float32)
        return np.zeros(5, dtype=np.float32)
    
    def generate_shard(self, num_samples: int, output_path: str, op_type: str = "add_hole"):
        """Generate a shard of training data"""
        samples = []
        for _ in range(num_samples):
            sample = self.generate_sample(op_type)
            if sample:
                samples.append(sample)
        
        # Save to HDF5
        with h5py.File(output_path, 'w') as f:
            f.create_dataset('uv_grids', data=np.stack([s.uv_grid for s in samples]))
            f.create_dataset('masks', data=np.stack([s.mask_gt for s in samples]))
            f.create_dataset('params', data=np.stack([s.params_gt for s in samples]))
            f.create_dataset('mesh_ids', data=[s.mesh_id.encode() for s in samples])
            
            # Store envelopes as JSON strings
            envelopes_json = [json.dumps(s.envelope_gt) for s in samples]
            f.create_dataset('envelopes', data=[e.encode() for e in envelopes_json])

if __name__ == "__main__":
    synth = DatasetSynthesizer(resolution=256)
    
    # Generate training shards
    print("Generating training shards...")
    for i in range(10):
        synth.generate_shard(
            num_samples=100,
            output_path=f"ml/uvnet/data/train_shard_{i:03d}.h5",
            op_type="add_hole"
        )
        print(f"Generated shard {i}")
    
    # Generate validation shard
    print("Generating validation shard...")
    synth.generate_shard(
        num_samples=50,
        output_path="ml/uvnet/data/val_shard.h5",
        op_type="add_hole"
    )
    print("Done!")
