import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ArrowDown, ArrowRight, GitBranch, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import PipelineStage, { type StageDefinition, type StageRun } from "./PipelineStage";
import { cn } from "@/lib/utils";
import type { PipelineTemplate as SchemaPipelineTemplate, PipelineRun as SchemaPipelineRun, StageDefinition as SchemaStageDefinition } from "@shared/schema";

// Extended type to include stage definitions from relations and typed metadata
export interface PipelineTemplate extends Omit<SchemaPipelineTemplate, 'metadata'> {
  stageDefinitions?: SchemaStageDefinition[];
  metadata: {
    tags?: string[];
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    estimatedTime?: number; // in minutes
    description?: string;
  } & Record<string, any>; // Allow additional properties
}

// Extended type to include UI-specific typing for metrics
export interface PipelineRun extends Omit<SchemaPipelineRun, 'metrics'> {
  metrics: {
    totalDuration?: number;
    stageMetrics?: Record<string, { duration: number; attempts: number }>;
  } & Record<string, any>; // Allow additional properties
}

interface PipelineVisualizationProps {
  template: PipelineTemplate;
  run?: PipelineRun;
  stageRuns?: StageRun[];
  layout?: 'vertical' | 'horizontal';
  showDependencies?: boolean;
  showMetrics?: boolean;
  onStageClick?: (stage: StageDefinition) => void;
  onStageAction?: (action: 'retry' | 'skip' | 'configure', stage: StageDefinition) => void;
  onPipelineAction?: (action: 'start' | 'pause' | 'resume' | 'cancel') => void;
}

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'beginner': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'intermediate': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'advanced': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  }
};

const formatTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins > 0 ? `${mins}m` : ''}`;
};

const getOverallStatus = (stageRuns: StageRun[] = []) => {
  if (stageRuns.length === 0) return { status: 'pending', icon: Clock, color: 'text-gray-500' };
  
  const hasError = stageRuns.some(run => run.status === 'error');
  const hasRunning = stageRuns.some(run => run.status === 'running');
  const allCompleted = stageRuns.every(run => run.status === 'completed' || run.status === 'skipped');
  
  if (hasError) return { status: 'error', icon: AlertTriangle, color: 'text-red-500' };
  if (hasRunning) return { status: 'running', icon: Clock, color: 'text-blue-500' };
  if (allCompleted) return { status: 'completed', icon: CheckCircle, color: 'text-green-500' };
  
  return { status: 'pending', icon: Clock, color: 'text-gray-500' };
};

export default function PipelineVisualization({
  template,
  run,
  stageRuns = [],
  layout = 'vertical',
  showDependencies = true,
  showMetrics = true,
  onStageClick,
  onStageAction,
  onPipelineAction,
}: PipelineVisualizationProps) {
  const sortedStages = useMemo(() => {
    return [...(template.stageDefinitions || [])].sort((a, b) => a.order - b.order);
  }, [template.stageDefinitions]);

  const stageRunsMap = useMemo(() => {
    return stageRuns.reduce((map, run) => {
      map[run.stageName] = run;
      return map;
    }, {} as Record<string, StageRun>);
  }, [stageRuns]);

  const parallelGroups = useMemo(() => {
    const groups: StageDefinition[][] = [];
    const processed = new Set<string>();
    
    for (const stage of sortedStages) {
      if (processed.has(stage.name)) continue;
      
      if (stage.isParallel) {
        // Find all stages that can run in parallel at this order
        const parallelGroup = sortedStages.filter(s => 
          s.order === stage.order && s.isParallel && !processed.has(s.name)
        );
        groups.push(parallelGroup);
        parallelGroup.forEach(s => processed.add(s.name));
      } else {
        groups.push([stage]);
        processed.add(stage.name);
      }
    }
    
    return groups;
  }, [sortedStages]);

  const overallStatus = getOverallStatus(stageRuns);
  const StatusIcon = overallStatus.icon;

  const isRunning = run?.status === 'running';
  const canStart = !run || run.status === 'pending' || run.status === 'cancelled' || run.status === 'error';
  const canPause = run?.status === 'running';
  const canResume = run?.status === 'paused';
  const canCancel = run?.status === 'running' || run?.status === 'paused';

  return (
    <div className="space-y-4" data-testid="pipeline-visualization">
      {/* Pipeline Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <StatusIcon className={cn("w-5 h-5", overallStatus.color)} />
                <CardTitle className="text-lg">{template.name}</CardTitle>
                <Badge variant="outline">{template.version}</Badge>
              </div>
              {template.description && (
                <p className="text-sm text-muted-foreground">{template.description}</p>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              {template.metadata.difficulty && (
                <Badge className={getDifficultyColor(template.metadata.difficulty)}>
                  {template.metadata.difficulty}
                </Badge>
              )}
              
              {template.metadata.estimatedTime && (
                <Badge variant="outline" className="space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{formatTime(template.metadata.estimatedTime)}</span>
                </Badge>
              )}
            </div>
          </div>
          
          {/* Pipeline Actions */}
          <div className="flex items-center space-x-2 pt-2">
            {canStart && (
              <Button
                size="sm"
                onClick={() => onPipelineAction?.('start')}
                data-testid="button-start-pipeline"
              >
                Start Pipeline
              </Button>
            )}
            
            {canPause && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onPipelineAction?.('pause')}
                data-testid="button-pause-pipeline"
              >
                Pause
              </Button>
            )}
            
            {canResume && (
              <Button
                size="sm"
                onClick={() => onPipelineAction?.('resume')}
                data-testid="button-resume-pipeline"
              >
                Resume
              </Button>
            )}
            
            {canCancel && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onPipelineAction?.('cancel')}
                data-testid="button-cancel-pipeline"
              >
                Cancel
              </Button>
            )}
          </div>
        </CardHeader>
        
        {/* Pipeline Metrics */}
        {showMetrics && run && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Status</div>
                <div className="font-medium capitalize">{run.status}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Current Stage</div>
                <div className="font-medium">
                  {(run.currentStageOrder ?? 0) + 1} of {sortedStages.length}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Duration</div>
                <div className="font-medium">
                  {run.metrics?.totalDuration 
                    ? formatTime(Math.floor(run.metrics.totalDuration / 60))
                    : 'N/A'
                  }
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Pipeline Stages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline Stages</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className={cn(
              "space-y-4",
              layout === 'horizontal' && "flex space-x-4 space-y-0 overflow-x-auto pb-2"
            )}>
              {parallelGroups.map((group, groupIndex) => (
                <div key={groupIndex} className="relative">
                  {/* Parallel Group Container */}
                  {group.length > 1 ? (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <GitBranch className="w-4 h-4" />
                        <span>Parallel Execution</span>
                      </div>
                      <div className={cn(
                        "grid gap-3",
                        group.length === 2 && "grid-cols-2",
                        group.length === 3 && "grid-cols-3",
                        group.length > 3 && "grid-cols-2"
                      )}>
                        {group.map((stage) => (
                          <PipelineStage
                            key={stage.id}
                            definition={stage}
                            run={stageRunsMap[stage.name]}
                            isActive={(run?.currentStageOrder ?? 0) === stage.order}
                            isConnected={Boolean(stageRunsMap[stage.name])}
                            showDependencies={showDependencies}
                            onStageClick={onStageClick}
                            onActionClick={onStageAction}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <PipelineStage
                      definition={group[0]}
                      run={stageRunsMap[group[0].name]}
                      isActive={(run?.currentStageOrder ?? 0) === group[0].order}
                      isConnected={Boolean(stageRunsMap[group[0].name])}
                      showDependencies={showDependencies}
                      onStageClick={onStageClick}
                      onActionClick={onStageAction}
                    />
                  )}
                  
                  {/* Connection Arrow */}
                  {groupIndex < parallelGroups.length - 1 && (
                    <div className="flex justify-center my-2">
                      {layout === 'vertical' ? (
                        <ArrowDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Tags */}
      {template.metadata.tags && template.metadata.tags.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-2">
              {template.metadata.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}