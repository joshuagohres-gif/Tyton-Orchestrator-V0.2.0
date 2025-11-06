# Native Geometry Model - UV-grid UNet

This directory contains the implementation for Phase 1 of the native geometry model: a UV-grid UNet that predicts operation regions and parameters.

## Structure

```
ml/uvnet/
├── data/
│   └── synth.py          # Dataset synthesis (parametric meshes, UV rendering)
├── models/
│   └── unet.py          # UNet architecture with dual heads
├── train/
│   ├── train.py         # Training loop with constraint-aware loss
│   └── losses.py        # BCE+Dice, Huber, constraint penalties
└── eval/
    └── (evaluation scripts)

services/native-geo/
├── app.py               # FastAPI inference service
├── schemas.py           # Pydantic models
└── requirements.txt     # Python dependencies
```

## Setup

### 1. Install Dependencies

```bash
cd services/native-geo
pip install -r requirements.txt
```

### 2. Generate Training Data

```bash
cd ml/uvnet/data
python synth.py
```

This generates HDF5 shards in `ml/uvnet/data/`:
- `train_shard_*.h5` - Training samples
- `val_shard.h5` - Validation samples

### 3. Train Model

```bash
cd ml/uvnet/train
python train.py \
  --train_shards ../data/train_shard_*.h5 \
  --val_shard ../data/val_shard.h5 \
  --model_dir ../models \
  --num_epochs 50 \
  --batch_size 8 \
  --lr 1e-4
```

### 4. Start Inference Service

```bash
cd services/native-geo
python app.py
```

Service runs on `http://localhost:8001`

## Integration

The native model is integrated into the shape operations planner via feature flag:

```bash
# Enable native model
export NATIVE_GEOM_MODEL=true
export NATIVE_GEOM_SERVICE_URL=http://localhost:8001
export NATIVE_CONFIDENCE_THRESHOLD=0.7
```

When enabled, the planner:
1. Gets LLM proposal
2. Calls native model `/refine` endpoint for each operation
3. Merges refined params if confidence > threshold
4. Falls back to LLM params if confidence too low

## Model Architecture

- **Input**: (4, 256, 256) channels:
  - `occ`: UV occupancy
  - `rough_box`: LLM proposal box mask
  - `op_type`: Operation type one-hot
  - `thickness`: Wall thickness estimate

- **Output**:
  - `mask`: (1, 256, 256) segmentation mask
  - `params`: (5,) operation parameters

## Loss Function

- **Segmentation**: BCE + Dice loss
- **Parameters**: Huber loss
- **Constraints**: Penalties from executor feedback (wall thickness, diameter errors, non-manifold edges)

## Data Format

Each HDF5 shard contains:
- `uv_grids`: (N, C, H, W) input channels
- `masks`: (N, H, W) ground truth masks
- `params`: (N, P) operation parameters
- `envelopes`: JSON strings of operation envelopes

## Evaluation

Metrics tracked:
- IoU (mask)
- Parameter MAE/relative error
- Violation rate (%)
- Flip fraction in UV

## Future Work

- Phase 2: Graph model (PyTorch Geometric) for topology-aware refinement
- Multi-operation support (vents, ribs)
- Real mesh dataset integration
