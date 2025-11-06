"""
Training Losses

Includes:
- BCE + Dice loss for segmentation
- Huber loss for parameter regression
- Constraint penalties (from executor feedback)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

class DiceLoss(nn.Module):
    """Dice loss for segmentation"""
    
    def __init__(self, smooth=1.0):
        super().__init__()
        self.smooth = smooth
    
    def forward(self, pred, target):
        pred_flat = pred.view(-1)
        target_flat = target.view(-1)
        
        intersection = (pred_flat * target_flat).sum()
        dice = (2.0 * intersection + self.smooth) / (
            pred_flat.sum() + target_flat.sum() + self.smooth
        )
        
        return 1 - dice

class CombinedSegLoss(nn.Module):
    """BCE + Dice loss"""
    
    def __init__(self, bce_weight=0.5, dice_weight=0.5):
        super().__init__()
        self.bce = nn.BCEWithLogitsLoss()
        self.dice = DiceLoss()
        self.bce_weight = bce_weight
        self.dice_weight = dice_weight
    
    def forward(self, pred_mask, target_mask):
        # pred_mask is already sigmoid, so we need to apply logit for BCE
        pred_logit = torch.logit(pred_mask.clamp(1e-7, 1 - 1e-7))
        bce_loss = self.bce(pred_logit, target_mask)
        dice_loss = self.dice(pred_mask, target_mask)
        
        return self.bce_weight * bce_loss + self.dice_weight * dice_loss

class ParamLoss(nn.Module):
    """Huber loss for parameter regression"""
    
    def __init__(self, delta=1.0):
        super().__init__()
        self.delta = delta
    
    def forward(self, pred, target):
        return F.huber_loss(pred, target, delta=self.delta, reduction='mean')

class ConstraintLoss(nn.Module):
    """
    Constraint penalties from executor feedback
    
    Penalizes violations like:
    - Wall thickness < min_thickness
    - Hole diameter errors
    - Non-manifold geometry
    """
    
    def __init__(self, min_wall_thickness=1.0):
        super().__init__()
        self.min_wall_thickness = min_wall_thickness
    
    def forward(self, pred_params, target_params, violation_metrics=None):
        """
        Args:
            pred_params: (B, P) predicted parameters
            target_params: (B, P) target parameters
            violation_metrics: Dict with violation counts (optional)
        """
        loss = torch.tensor(0.0, device=pred_params.device)
        
        if violation_metrics is not None:
            # Penalize violations
            if 'wall_thickness_violations' in violation_metrics:
                loss += violation_metrics['wall_thickness_violations'] * 10.0
            if 'diameter_errors' in violation_metrics:
                loss += violation_metrics['diameter_errors'] * 5.0
            if 'non_manifold_edges' in violation_metrics:
                loss += violation_metrics['non_manifold_edges'] * 20.0
        
        return loss

class TotalLoss(nn.Module):
    """Combined loss for training"""
    
    def __init__(
        self,
        seg_weight=1.0,
        param_weight=0.5,
        constraint_weight=0.1,
        min_wall_thickness=1.0
    ):
        super().__init__()
        self.seg_loss = CombinedSegLoss()
        self.param_loss = ParamLoss()
        self.constraint_loss = ConstraintLoss(min_wall_thickness)
        self.seg_weight = seg_weight
        self.param_weight = param_weight
        self.constraint_weight = constraint_weight
    
    def forward(
        self,
        pred_mask,
        pred_params,
        target_mask,
        target_params,
        violation_metrics=None
    ):
        seg = self.seg_loss(pred_mask, target_mask)
        param = self.param_loss(pred_params, target_params)
        constraint = self.constraint_loss(pred_params, target_params, violation_metrics)
        
        total = (
            self.seg_weight * seg +
            self.param_weight * param +
            self.constraint_weight * constraint
        )
        
        return {
            'total': total,
            'seg': seg,
            'param': param,
            'constraint': constraint
        }
