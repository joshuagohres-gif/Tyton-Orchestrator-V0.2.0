import { CheckCircle, Clock, AlertCircle, Play, Pause, SkipForward, Loader2, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { StageDefinition as SchemaStageDefinition, StageRun as SchemaStageRun } from "@shared/schema";

// Extended types to include UI-specific fields
export interface StageDefinition extends SchemaStageDefinition {
  retryPolicy: {
    maxAttempts?: number;
    backoffStrategy?: 'linear' | 'exponential';
    baseDelay?: number;
  } | Record<string, any> | unknown; // Handle database jsonb flexibility
}

export interface StageRun extends SchemaStageRun {
  progress?: number; // 0-100 for UI progress tracking
}

interface PipelineStageProps {
  definition: StageDefinition;
  run?: StageRun;
  isActive?: boolean;
  isConnected?: boolean;
  showDependencies?: boolean;
  onStageClick?: (stage: StageDefinition) => void;
  onActionClick?: (action: 'retry' | 'skip' | 'configure', stage: StageDefinition) => void;
}

const getCategoryColor = (category: StageDefinition['category']) => {
  switch (category) {
    case 'ai_generation': return 'bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-300';
    case 'validation': return 'bg-green-500/10 text-green-700 border-green-200 dark:text-green-300';
    case 'export': return 'bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-300';
    case 'user_input': return 'bg-orange-500/10 text-orange-700 border-orange-200 dark:text-orange-300';
    default: return 'bg-gray-500/10 text-gray-700 border-gray-200 dark:text-gray-300';
  }
};

const getStatusColor = (status: StageRun['status']) => {
  switch (status) {
    case 'pending': return 'text-gray-500';
    case 'running': return 'text-blue-500';
    case 'completed': return 'text-green-500';
    case 'error': return 'text-red-500';
    case 'skipped': return 'text-yellow-500';
    default: return 'text-gray-500';
  }
};

const getStatusIcon = (status: StageRun['status']) => {
  switch (status) {
    case 'pending': return Clock;
    case 'running': return Loader2;
    case 'completed': return CheckCircle;
    case 'error': return AlertCircle;
    case 'skipped': return SkipForward;
    default: return Clock;
  }
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

export default function PipelineStage({
  definition,
  run,
  isActive = false,
  isConnected = false,
  showDependencies = false,
  onStageClick,
  onActionClick,
}: PipelineStageProps) {
  const StatusIcon = getStatusIcon(run?.status || 'pending');
  const isRunning = run?.status === 'running';
  const hasError = run?.status === 'error';
  const isCompleted = run?.status === 'completed';

  return (
    <TooltipProvider>
      <Card 
        className={cn(
          "relative transition-all duration-200 cursor-pointer hover:shadow-md",
          isActive && "ring-2 ring-primary ring-offset-2",
          isConnected && "border-primary/50",
          hasError && "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20",
          isCompleted && "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
        )}
        onClick={() => onStageClick?.(definition)}
        data-testid={`pipeline-stage-${definition.name}`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <StatusIcon 
                className={cn(
                  "w-4 h-4",
                  getStatusColor(run?.status || 'pending'),
                  isRunning && "animate-spin"
                )} 
              />
              <CardTitle className="text-sm font-medium">{definition.displayName}</CardTitle>
            </div>
            
            <div className="flex items-center space-x-1">
              {definition.isOptional && (
                <Badge variant="outline" className="text-xs">
                  Optional
                </Badge>
              )}
              
              {definition.isParallel && (
                <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  Parallel
                </Badge>
              )}
              
              <Badge className={cn("text-xs", getCategoryColor(definition.category))}>
                {definition.category.replace('_', ' ')}
              </Badge>
            </div>
          </div>
          
          {definition.description && (
            <p className="text-xs text-muted-foreground mt-1">{definition.description}</p>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          {/* Progress bar for running stages */}
          {run && isRunning && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Progress</span>
                <span>{run.progress || 0}%</span>
              </div>
              <Progress value={run.progress || 0} className="h-2" />
            </div>
          )}

          {/* Stage metadata */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Order</span>
              <Badge variant="outline" className="text-xs">
                #{definition.order}
              </Badge>
            </div>
            
            {definition.estimatedDuration && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Est. Duration</span>
                <span className="text-xs">{formatDuration(definition.estimatedDuration)}</span>
              </div>
            )}
            
            {run?.attempts && run.attempts > 1 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Attempts</span>
                <span className="text-xs">{run.attempts}/{(definition.retryPolicy as any)?.maxAttempts || 3}</span>
              </div>
            )}
          </div>

          {/* Dependencies */}
          {showDependencies && definition.dependencies && definition.dependencies.length > 0 && (
            <div className="mt-3 pt-2 border-t border-border">
              <div className="text-xs text-muted-foreground mb-1">Depends on:</div>
              <div className="flex flex-wrap gap-1">
                {definition.dependencies.map((dep) => (
                  <Badge key={dep} variant="outline" className="text-xs">
                    {dep}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {run?.errorMessage && (
            <div className="mt-3 pt-2 border-t border-red-200">
              <div className="text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                {run.errorMessage}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {run && (hasError || run.status === 'pending') && (
            <div className="mt-3 pt-2 border-t border-border">
              <div className="flex space-x-2">
                {hasError && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      onActionClick?.('retry', definition);
                    }}
                    data-testid={`button-retry-${definition.name}`}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Retry
                  </Button>
                )}
                
                {definition.isOptional && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      onActionClick?.('skip', definition);
                    }}
                    data-testid={`button-skip-${definition.name}`}
                  >
                    <SkipForward className="w-3 h-3 mr-1" />
                    Skip
                  </Button>
                )}
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onActionClick?.('configure', definition);
                      }}
                      data-testid={`button-configure-${definition.name}`}
                    >
                      <Settings className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Configure stage</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}