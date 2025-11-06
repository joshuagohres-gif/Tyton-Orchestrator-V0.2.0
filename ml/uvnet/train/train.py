"""
Training Loop for UV-grid UNet

Includes:
- Data loading from HDF5 shards
- Training loop with constraint-aware loss
- Periodic executor feedback for constraint penalties
- Checkpointing and logging
"""

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import h5py
import numpy as np
from pathlib import Path
import json
from typing import Dict, Optional
import logging

from ml.uvnet.models.unet import UVUNet
from ml.uvnet.train.losses import TotalLoss

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UVGridDataset(Dataset):
    """Dataset for loading HDF5 shards"""
    
    def __init__(self, shard_paths: list, transform=None):
        self.shard_paths = shard_paths
        self.transform = transform
        self._load_shards()
    
    def _load_shards(self):
        """Load all shards into memory"""
        self.uv_grids = []
        self.masks = []
        self.params = []
        self.envelopes = []
        
        for shard_path in self.shard_paths:
            with h5py.File(shard_path, 'r') as f:
                self.uv_grids.append(f['uv_grids'][:])
                self.masks.append(f['masks'][:])
                self.params.append(f['params'][:])
                
                # Decode envelopes
                envelopes = [json.loads(e.decode()) for e in f['envelopes'][:]]
                self.envelopes.extend(envelopes)
        
        self.uv_grids = np.concatenate(self.uv_grids, axis=0)
        self.masks = np.concatenate(self.masks, axis=0)
        self.params = np.concatenate(self.params, axis=0)
        
        logger.info(f"Loaded {len(self.uv_grids)} samples")
    
    def __len__(self):
        return len(self.uv_grids)
    
    def __getitem__(self, idx):
        uv_grid = torch.FloatTensor(self.uv_grids[idx])
        mask = torch.FloatTensor(self.masks[idx])
        params = torch.FloatTensor(self.params[idx])
        envelope = self.envelopes[idx]
        
        if self.transform:
            uv_grid = self.transform(uv_grid)
            mask = self.transform(mask)
        
        return {
            'uv_grid': uv_grid,
            'mask': mask.unsqueeze(0),  # Add channel dimension
            'params': params,
            'envelope': envelope
        }

def train_epoch(
    model: nn.Module,
    dataloader: DataLoader,
    criterion: nn.Module,
    optimizer: optim.Optimizer,
    device: torch.device,
    executor_bridge: Optional[callable] = None,
    executor_feedback_interval: int = 100
):
    """Train for one epoch"""
    model.train()
    total_loss = 0.0
    seg_loss = 0.0
    param_loss = 0.0
    constraint_loss = 0.0
    
    for batch_idx, batch in enumerate(dataloader):
        uv_grid = batch['uv_grid'].to(device)
        mask_gt = batch['mask'].to(device)
        params_gt = batch['params'].to(device)
        
        # Forward pass
        optimizer.zero_grad()
        mask_pred, params_pred = model(uv_grid)
        
        # Get constraint feedback (periodically)
        violation_metrics = None
        if executor_bridge and batch_idx % executor_feedback_interval == 0:
            violation_metrics = executor_bridge(
                batch['envelope'],
                mask_pred.detach().cpu().numpy(),
                params_pred.detach().cpu().numpy()
            )
        
        # Compute loss
        loss_dict = criterion(
            mask_pred,
            params_pred,
            mask_gt,
            params_gt,
            violation_metrics
        )
        
        loss = loss_dict['total']
        
        # Backward pass
        loss.backward()
        optimizer.step()
        
        # Accumulate losses
        total_loss += loss.item()
        seg_loss += loss_dict['seg'].item()
        param_loss += loss_dict['param'].item()
        constraint_loss += loss_dict['constraint'].item()
    
    num_batches = len(dataloader)
    return {
        'total': total_loss / num_batches,
        'seg': seg_loss / num_batches,
        'param': param_loss / num_batches,
        'constraint': constraint_loss / num_batches
    }

def validate(
    model: nn.Module,
    dataloader: DataLoader,
    criterion: nn.Module,
    device: torch.device
):
    """Validate model"""
    model.eval()
    total_loss = 0.0
    
    with torch.no_grad():
        for batch in dataloader:
            uv_grid = batch['uv_grid'].to(device)
            mask_gt = batch['mask'].to(device)
            params_gt = batch['params'].to(device)
            
            mask_pred, params_pred = model(uv_grid)
            
            loss_dict = criterion(
                mask_pred,
                params_pred,
                mask_gt,
                params_gt,
                None  # No constraint feedback during validation
            )
            
            total_loss += loss_dict['total'].item()
    
    return total_loss / len(dataloader)

def train(
    train_shards: list,
    val_shard: str,
    model_dir: Path,
    num_epochs: int = 50,
    batch_size: int = 8,
    learning_rate: float = 1e-4,
    device: str = 'cuda' if torch.cuda.is_available() else 'cpu',
    executor_bridge: Optional[callable] = None
):
    """Main training function"""
    device = torch.device(device)
    
    # Create datasets
    train_dataset = UVGridDataset(train_shards)
    val_dataset = UVGridDataset([val_shard])
    
    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=2
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=2
    )
    
    # Create model
    model = UVUNet(in_channels=4, num_params=5).to(device)
    
    # Loss and optimizer
    criterion = TotalLoss()
    optimizer = optim.Adam(model.parameters(), lr=learning_rate)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='min', factor=0.5, patience=5
    )
    
    # Training loop
    best_val_loss = float('inf')
    
    for epoch in range(num_epochs):
        logger.info(f"Epoch {epoch+1}/{num_epochs}")
        
        # Train
        train_losses = train_epoch(
            model,
            train_loader,
            criterion,
            optimizer,
            device,
            executor_bridge
        )
        
        logger.info(
            f"Train Loss: {train_losses['total']:.4f} "
            f"(seg: {train_losses['seg']:.4f}, "
            f"param: {train_losses['param']:.4f}, "
            f"constraint: {train_losses['constraint']:.4f})"
        )
        
        # Validate
        val_loss = validate(model, val_loader, criterion, device)
        logger.info(f"Val Loss: {val_loss:.4f}")
        
        scheduler.step(val_loss)
        
        # Save checkpoint
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            checkpoint_path = model_dir / f"checkpoint_epoch_{epoch+1}.pt"
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'val_loss': val_loss,
            }, checkpoint_path)
            logger.info(f"Saved checkpoint: {checkpoint_path}")
    
    # Save final model
    final_path = model_dir / "final_model.pt"
    torch.save(model.state_dict(), final_path)
    logger.info(f"Saved final model: {final_path}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument('--train_shards', nargs='+', required=True)
    parser.add_argument('--val_shard', required=True)
    parser.add_argument('--model_dir', default='ml/uvnet/models')
    parser.add_argument('--num_epochs', type=int, default=50)
    parser.add_argument('--batch_size', type=int, default=8)
    parser.add_argument('--lr', type=float, default=1e-4)
    
    args = parser.parse_args()
    
    train(
        train_shards=args.train_shards,
        val_shard=args.val_shard,
        model_dir=Path(args.model_dir),
        num_epochs=args.num_epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr
    )
