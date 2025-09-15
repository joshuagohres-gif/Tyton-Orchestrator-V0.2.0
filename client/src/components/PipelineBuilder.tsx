import { useState, useCallback, useMemo } from "react";
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay, 
  DragStartEvent,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Plus, Trash2, Save, Eye, Settings, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { PipelineTemplate, StageDefinition } from "@shared/schema";

interface PipelineBuilderProps {
  template?: PipelineTemplate;
  onSave?: (template: Partial<PipelineTemplate>) => void;
  onPreview?: (template: PipelineTemplate) => void;
  isLoading?: boolean;
  readOnly?: boolean;
}

interface BuilderStageDefinition extends Omit<StageDefinition, 'id' | 'templateId' | 'createdAt'> {
  id: string; // temporary local ID for building
  tempId?: string;
}

const STAGE_CATEGORIES = [
  { value: 'ai_generation', label: 'AI Generation', color: 'bg-purple-100 text-purple-800' },
  { value: 'validation', label: 'Validation', color: 'bg-green-100 text-green-800' },
  { value: 'export', label: 'Export', color: 'bg-blue-100 text-blue-800' },
  { value: 'user_input', label: 'User Input', color: 'bg-orange-100 text-orange-800' },
] as const;

const DEFAULT_STAGE: BuilderStageDefinition = {
  id: '',
  name: '',
  displayName: '',
  description: '',
  category: 'ai_generation',
  order: 0,
  isOptional: false,
  isParallel: false,
  estimatedDuration: 60,
  dependencies: [],
  configuration: {},
  inputSchema: {},
  outputSchema: {},
  retryPolicy: {
    maxAttempts: 3,
    backoffStrategy: 'exponential',
    baseDelay: 2000,
  },
};

function SortableStageCard({ stage, index, onEdit, onDelete }: {
  stage: BuilderStageDefinition;
  index: number;
  onEdit: (stage: BuilderStageDefinition) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const categoryConfig = STAGE_CATEGORIES.find(cat => cat.value === stage.category);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="border-2 border-dashed border-border hover:border-primary/50 transition-colors"
      data-testid={`sortable-stage-${stage.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab hover:cursor-grabbing p-1 rounded hover:bg-muted"
              data-testid={`drag-handle-${stage.id}`}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
            <Badge variant="outline" className="text-xs">
              #{stage.order + 1}
            </Badge>
            <CardTitle className="text-sm font-medium">{stage.displayName}</CardTitle>
          </div>
          
          <div className="flex items-center space-x-1">
            {stage.isOptional && (
              <Badge variant="outline" className="text-xs">Optional</Badge>
            )}
            {stage.isParallel && (
              <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700">
                Parallel
              </Badge>
            )}
            <Badge className={`text-xs ${categoryConfig?.color}`}>
              {categoryConfig?.label}
            </Badge>
          </div>
        </div>
        
        {stage.description && (
          <p className="text-xs text-muted-foreground mt-1">{stage.description}</p>
        )}
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {stage.estimatedDuration && `~${Math.floor(stage.estimatedDuration / 60)}m`}
            {stage.dependencies && stage.dependencies.length > 0 && (
              <span className="ml-2">• {stage.dependencies.length} dependencies</span>
            )}
          </div>
          
          <div className="flex space-x-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => onEdit(stage)}
              data-testid={`edit-stage-${stage.id}`}
            >
              <Settings className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
              onClick={() => onDelete(stage.id)}
              data-testid={`delete-stage-${stage.id}`}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StageEditDialog({ 
  stage, 
  open, 
  onOpenChange, 
  onSave,
  availableStages 
}: {
  stage: BuilderStageDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (stage: BuilderStageDefinition) => void;
  availableStages: BuilderStageDefinition[];
}) {
  const [editingStage, setEditingStage] = useState<BuilderStageDefinition>(
    stage || { ...DEFAULT_STAGE, id: `stage_${Date.now()}` }
  );

  const handleSave = () => {
    if (!editingStage.name || !editingStage.displayName) {
      return;
    }
    onSave(editingStage);
    onOpenChange(false);
  };

  const availableDependencies = availableStages.filter(s => 
    s.id !== editingStage.id && s.order < editingStage.order
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {stage ? 'Edit Stage' : 'Add New Stage'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stage-name">Stage Name</Label>
              <Input
                id="stage-name"
                value={editingStage.name}
                onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                placeholder="e.g., circuit_generation"
                data-testid="input-stage-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="stage-display-name">Display Name</Label>
              <Input
                id="stage-display-name"
                value={editingStage.displayName}
                onChange={(e) => setEditingStage({ ...editingStage, displayName: e.target.value })}
                placeholder="e.g., Circuit Generation"
                data-testid="input-stage-display-name"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="stage-description">Description</Label>
            <Textarea
              id="stage-description"
              value={editingStage.description || ''}
              onChange={(e) => setEditingStage({ ...editingStage, description: e.target.value })}
              placeholder="Brief description of what this stage does..."
              rows={2}
              data-testid="textarea-stage-description"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stage-category">Category</Label>
              <Select
                value={editingStage.category}
                onValueChange={(value: any) => setEditingStage({ ...editingStage, category: value })}
              >
                <SelectTrigger data-testid="select-stage-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="stage-duration">Estimated Duration (seconds)</Label>
              <Input
                id="stage-duration"
                type="number"
                value={editingStage.estimatedDuration || ''}
                onChange={(e) => setEditingStage({ 
                  ...editingStage, 
                  estimatedDuration: parseInt(e.target.value) || null 
                })}
                placeholder="60"
                data-testid="input-stage-duration"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <Switch
                id="stage-optional"
                checked={editingStage.isOptional}
                onCheckedChange={(checked) => setEditingStage({ ...editingStage, isOptional: checked })}
                data-testid="switch-stage-optional"
              />
              <Label htmlFor="stage-optional">Optional Stage</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="stage-parallel"
                checked={editingStage.isParallel}
                onCheckedChange={(checked) => setEditingStage({ ...editingStage, isParallel: checked })}
                data-testid="switch-stage-parallel"
              />
              <Label htmlFor="stage-parallel">Parallel Execution</Label>
            </div>
          </div>
          
          {availableDependencies.length > 0 && (
            <div className="space-y-2">
              <Label>Dependencies</Label>
              <div className="space-y-2">
                {availableDependencies.map((dep) => (
                  <div key={dep.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`dep-${dep.id}`}
                      checked={editingStage.dependencies?.includes(dep.name) || false}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditingStage({
                            ...editingStage,
                            dependencies: [...(editingStage.dependencies || []), dep.name]
                          });
                        } else {
                          setEditingStage({
                            ...editingStage,
                            dependencies: (editingStage.dependencies || []).filter(d => d !== dep.name)
                          });
                        }
                      }}
                      data-testid={`checkbox-dependency-${dep.id}`}
                    />
                    <Label htmlFor={`dep-${dep.id}`} className="text-sm">
                      {dep.displayName}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!editingStage.name || !editingStage.displayName}
            data-testid="button-save-stage"
          >
            Save Stage
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PipelineBuilder({
  template,
  onSave,
  onPreview,
  isLoading = false,
  readOnly = false,
}: PipelineBuilderProps) {
  const { toast } = useToast();
  const [pipelineName, setPipelineName] = useState(template?.name || '');
  const [pipelineDescription, setPipelineDescription] = useState(template?.description || '');
  const [pipelineCategory, setPipelineCategory] = useState<string>(template?.category || 'hardware_design');
  const [stages, setStages] = useState<BuilderStageDefinition[]>(() => {
    // Initialize stages from template if available
    // Note: PipelineTemplate has stageDefinitions as a relation, not a direct property
    // This would be populated by the parent component if editing an existing template
    if (template && 'stageDefinitions' in template && Array.isArray(template.stageDefinitions)) {
      return template.stageDefinitions.map((stage, index) => ({
        ...stage,
        id: stage.id || `stage_${index}`,
        order: index,
        tempId: `temp_${stage.id || index}`,
      }));
    }
    return [];
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingStage, setEditingStage] = useState<BuilderStageDefinition | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const stageIds = useMemo(() => stages.map(stage => stage.id), [stages]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setStages((stages) => {
        const oldIndex = stages.findIndex(stage => stage.id === active.id);
        const newIndex = stages.findIndex(stage => stage.id === over.id);
        
        const reorderedStages = arrayMove(stages, oldIndex, newIndex).map((stage, index) => ({
          ...stage,
          order: index,
        }));
        
        return reorderedStages;
      });
    }
    
    setActiveId(null);
  }, []);

  const addNewStage = useCallback(() => {
    const newStage: BuilderStageDefinition = {
      ...DEFAULT_STAGE,
      id: `stage_${Date.now()}`,
      name: `stage_${stages.length + 1}`,
      displayName: `Stage ${stages.length + 1}`,
      order: stages.length,
    };
    setEditingStage(newStage);
    setIsEditDialogOpen(true);
  }, [stages.length]);

  const handleEditStage = useCallback((stage: BuilderStageDefinition) => {
    setEditingStage(stage);
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveStage = useCallback((updatedStage: BuilderStageDefinition) => {
    setStages(current => {
      const existingIndex = current.findIndex(s => s.id === updatedStage.id);
      if (existingIndex >= 0) {
        // Update existing stage
        const updated = [...current];
        updated[existingIndex] = updatedStage;
        return updated;
      } else {
        // Add new stage
        return [...current, { ...updatedStage, order: current.length }];
      }
    });
    toast({
      title: "Stage saved",
      description: `${updatedStage.displayName} has been updated.`,
    });
  }, [toast]);

  const handleDeleteStage = useCallback((stageId: string) => {
    setStages(current => {
      const filtered = current.filter(s => s.id !== stageId);
      // Reorder remaining stages
      return filtered.map((stage, index) => ({
        ...stage,
        order: index,
      }));
    });
    toast({
      title: "Stage deleted",
      description: "The stage has been removed from the pipeline.",
    });
  }, [toast]);

  const handleSavePipeline = useCallback(() => {
    if (!pipelineName) {
      toast({
        title: "Pipeline name required",
        description: "Please enter a name for your pipeline.",
        variant: "destructive",
      });
      return;
    }

    const pipelineData: Partial<PipelineTemplate> = {
      name: pipelineName,
      description: pipelineDescription,
      category: pipelineCategory as any,
      version: template?.version || '1.0.0',
      isPublic: template?.isPublic || false,
      metadata: {
        estimatedTime: Math.floor(stages.reduce((total, stage) => total + (stage.estimatedDuration || 60), 0) / 60),
      },
    };

    onSave?.(pipelineData);
  }, [pipelineName, pipelineDescription, pipelineCategory, stages, template, onSave, toast]);

  const handlePreview = useCallback(() => {
    if (stages.length === 0) {
      toast({
        title: "No stages to preview",
        description: "Add some stages to preview your pipeline.",
        variant: "destructive",
      });
      return;
    }

    const previewTemplate: PipelineTemplate = {
      id: template?.id || 'preview',
      name: pipelineName || 'Untitled Pipeline',
      description: pipelineDescription,
      category: pipelineCategory as any,
      version: '1.0.0',
      isPublic: false,
      userId: template?.userId || null,
      metadata: {
        estimatedTime: Math.floor(stages.reduce((total, stage) => total + (stage.estimatedDuration || 60), 0) / 60),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    onPreview?.(previewTemplate);
  }, [stages, pipelineName, pipelineDescription, pipelineCategory, template, onPreview, toast]);

  const activeStage = activeId ? stages.find(stage => stage.id === activeId) : null;

  return (
    <div className="space-y-6" data-testid="pipeline-builder">
      {/* Pipeline Header */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pipeline-name">Pipeline Name</Label>
              <Input
                id="pipeline-name"
                value={pipelineName}
                onChange={(e) => setPipelineName(e.target.value)}
                placeholder="My Hardware Design Pipeline"
                disabled={readOnly}
                data-testid="input-pipeline-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="pipeline-category">Category</Label>
              <Select
                value={pipelineCategory}
                onValueChange={setPipelineCategory}
                disabled={readOnly}
              >
                <SelectTrigger data-testid="select-pipeline-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hardware_design">Hardware Design</SelectItem>
                  <SelectItem value="firmware_dev">Firmware Development</SelectItem>
                  <SelectItem value="validation">Validation</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="pipeline-description">Description</Label>
            <Textarea
              id="pipeline-description"
              value={pipelineDescription}
              onChange={(e) => setPipelineDescription(e.target.value)}
              placeholder="Describe what this pipeline does..."
              rows={2}
              disabled={readOnly}
              data-testid="textarea-pipeline-description"
            />
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Stages */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Pipeline Stages ({stages.length})</CardTitle>
            {!readOnly && (
              <Button
                size="sm"
                onClick={addNewStage}
                data-testid="button-add-stage"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Stage
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {stages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <div className="text-lg mb-2">No stages yet</div>
              <p className="text-sm">Add your first stage to start building your pipeline.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {stages.map((stage, index) => (
                    <SortableStageCard
                      key={stage.id}
                      stage={stage}
                      index={index}
                      onEdit={handleEditStage}
                      onDelete={handleDeleteStage}
                    />
                  ))}
                </div>
              </SortableContext>
              
              <DragOverlay>
                {activeStage && (
                  <SortableStageCard
                    stage={activeStage}
                    index={0}
                    onEdit={() => {}}
                    onDelete={() => {}}
                  />
                )}
              </DragOverlay>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handlePreview}
          disabled={stages.length === 0 || isLoading}
          data-testid="button-preview-pipeline"
        >
          <Eye className="w-4 h-4 mr-2" />
          Preview Pipeline
        </Button>
        
        {!readOnly && (
          <Button
            onClick={handleSavePipeline}
            disabled={!pipelineName || isLoading}
            data-testid="button-save-pipeline"
          >
            <Save className="w-4 h-4 mr-2" />
            {isLoading ? 'Saving...' : 'Save Pipeline'}
          </Button>
        )}
      </div>

      {/* Stage Edit Dialog */}
      <StageEditDialog
        stage={editingStage}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSave={handleSaveStage}
        availableStages={stages}
      />
    </div>
  );
}