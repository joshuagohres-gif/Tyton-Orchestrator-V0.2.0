import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  Pause, 
  RotateCcw,
  SkipForward,
  Settings,
  Timer,
  Zap,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageDefinition, StageRun } from "@shared/schema";

interface StageProgressIndicatorProps {
  definition: StageDefinition;
  run?: StageRun;
  isActive?: boolean;
  showDetailedMetrics?: boolean;
  showActions?: boolean;
  onActionClick?: (action: 'retry' | 'skip' | 'configure', stage: StageDefinition) => void;
  onStageClick?: (stage: StageDefinition) => void;
  className?: string;
}

// Enhanced status mapping with more detailed states
const getStageStatus = (run?: StageRun) => {
  if (!run) return { status: 'pending', label: 'Pending', icon: Clock, color: 'text-gray-500', bgColor: 'bg-gray-100', animated: false };
  
  switch (run.status) {
    case 'running':
      return { 
        status: 'running', 
        label: 'Running', 
        icon: Activity, 
        color: 'text-blue-600', 
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
        animated: true 
      };
    case 'completed':
      return { 
        status: 'completed', 
        label: 'Completed', 
        icon: CheckCircle, 
        color: 'text-green-600', 
        bgColor: 'bg-green-100 dark:bg-green-900/30',
        animated: false 
      };
    case 'error':
      return { 
        status: 'error', 
        label: 'Failed', 
        icon: XCircle, 
        color: 'text-red-600', 
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        animated: false 
      };
    case 'paused':
      return { 
        status: 'paused', 
        label: 'Paused', 
        icon: Pause, 
        color: 'text-orange-600', 
        bgColor: 'bg-orange-100 dark:bg-orange-900/30',
        animated: false 
      };
    case 'skipped':
      return { 
        status: 'skipped', 
        label: 'Skipped', 
        icon: SkipForward, 
        color: 'text-gray-600', 
        bgColor: 'bg-gray-100 dark:bg-gray-900/30',
        animated: false 
      };
    case 'pending':
    default:
      return { 
        status: 'pending', 
        label: 'Pending', 
        icon: Clock, 
        color: 'text-gray-500', 
        bgColor: 'bg-gray-100 dark:bg-gray-900/30',
        animated: false 
      };
  }
};

const formatDuration = (seconds?: number): string => {
  if (!seconds) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${Math.round(remainingSeconds)}s`;
};

const getRetryIndicator = (run?: StageRun) => {
  if (!run || !run.attempts || run.attempts <= 1) return null;
  
  const isCurrentAttempt = run.status === 'running' || run.status === 'error';
  return (
    <Badge 
      variant={isCurrentAttempt ? "destructive" : "secondary"} 
      className="text-xs font-mono"
    >
      Attempt {run.attempts}
    </Badge>
  );
};

const AnimatedProgress = ({ value, isAnimated }: { value: number; isAnimated: boolean }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (isAnimated) {
      const interval = setInterval(() => {
        setDisplayValue(prev => {
          const diff = value - prev;
          if (Math.abs(diff) < 1) return value;
          return prev + diff * 0.1;
        });
      }, 50);
      return () => clearInterval(interval);
    } else {
      setDisplayValue(value);
    }
  }, [value, isAnimated]);

  return (
    <Progress 
      value={displayValue} 
      className={cn(
        "h-2 transition-all duration-300",
        isAnimated && "animate-pulse"
      )}
    />
  );
};

export default function StageProgressIndicator({
  definition,
  run,
  isActive = false,
  showDetailedMetrics = true,
  showActions = true,
  onActionClick,
  onStageClick,
  className,
}: StageProgressIndicatorProps) {
  const stageStatus = getStageStatus(run);
  const StatusIcon = stageStatus.icon;
  // Calculate progress based on stage status since progress is not in StageRun schema
  const progress = run?.status === 'completed' ? 100 : run?.status === 'running' ? 50 : 0;
  const isRunning = run?.status === 'running';
  const hasError = run?.status === 'error';
  // Fix retry policy typing - retryPolicy is jsonb, need to properly type it
  const retryPolicy = definition.retryPolicy as { maxAttempts?: number } || {};
  const canRetry = hasError && run?.attempts && run.attempts < (retryPolicy.maxAttempts || 3);
  const canSkip = definition.isOptional && (run?.status === 'error' || run?.status === 'pending');

  const handleStageClick = () => {
    onStageClick?.(definition);
  };

  const handleActionClick = (action: 'retry' | 'skip' | 'configure', e: React.MouseEvent) => {
    e.stopPropagation();
    onActionClick?.(action, definition);
  };

  return (
    <Card 
      className={cn(
        "transition-all duration-300 hover:shadow-md cursor-pointer border-2",
        isActive && "ring-2 ring-primary ring-offset-2",
        stageStatus.bgColor,
        hasError && "border-red-300 dark:border-red-700",
        isRunning && "border-blue-300 dark:border-blue-700",
        className
      )}
      onClick={handleStageClick}
      data-testid={`stage-progress-${definition.id}`}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Stage Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <StatusIcon 
                className={cn(
                  "w-5 h-5 transition-all duration-300",
                  stageStatus.color,
                  stageStatus.animated && "animate-spin"
                )} 
              />
              <div>
                <h4 className="font-medium text-sm">{definition.displayName}</h4>
                <p className="text-xs text-muted-foreground">
                  Stage #{definition.order + 1}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-1">
              {getRetryIndicator(run)}
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs font-medium",
                  stageStatus.color
                )}
              >
                {stageStatus.label}
              </Badge>
            </div>
          </div>

          {/* Progress Bar */}
          {isRunning && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-mono font-medium">{Math.round(progress)}%</span>
              </div>
              <AnimatedProgress value={progress} isAnimated={isRunning} />
            </div>
          )}

          {/* Stage Description */}
          {definition.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {definition.description}
            </p>
          )}

          {/* Detailed Metrics */}
          {showDetailedMetrics && run && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Duration */}
                {run.startedAt && (
                  <div className="flex items-center space-x-1">
                    <Timer className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="font-mono">
                      {formatDuration(
                        run.completedAt 
                          ? (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000
                          : (Date.now() - new Date(run.startedAt).getTime()) / 1000
                      )}
                    </span>
                  </div>
                )}

                {/* Estimated Time Remaining */}
                {isRunning && definition.estimatedDuration && progress > 0 && (
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">ETA:</span>
                    <span className="font-mono">
                      {formatDuration(
                        Math.round((definition.estimatedDuration * (100 - progress)) / 100)
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {hasError && run.errorMessage && (
                <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                  <div className="flex items-center space-x-1 mb-1">
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                    <span className="text-xs font-medium text-red-700 dark:text-red-300">
                      Error
                    </span>
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2">
                    {run.errorMessage || 'An error occurred during stage execution'}
                  </p>
                </div>
              )}

              {/* Stage Configuration Hints */}
              {definition.isOptional && (
                <Badge variant="outline" className="text-xs">
                  Optional
                </Badge>
              )}
              {definition.isParallel && (
                <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30">
                  Parallel
                </Badge>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {showActions && (canRetry || canSkip || hasError) && (
            <div className="flex space-x-1 pt-2">
              {canRetry && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => handleActionClick('retry', e)}
                  data-testid={`button-retry-${definition.id}`}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Retry
                </Button>
              )}
              
              {canSkip && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => handleActionClick('skip', e)}
                  data-testid={`button-skip-${definition.id}`}
                >
                  <SkipForward className="w-3 h-3 mr-1" />
                  Skip
                </Button>
              )}
              
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={(e) => handleActionClick('configure', e)}
                data-testid={`button-configure-${definition.id}`}
              >
                <Settings className="w-3 h-3" />
              </Button>
            </div>
          )}

          {/* Performance Indicator for Fast Stages */}
          {run?.status === 'completed' && run.startedAt && run.completedAt && (
            (() => {
              const actualDuration = (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000;
              const expectedDuration = definition.estimatedDuration || 60;
              const isPerformant = actualDuration < expectedDuration * 0.8;
              
              return isPerformant ? (
                <div className="flex items-center space-x-1 pt-1">
                  <Zap className="w-3 h-3 text-green-500" />
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                    Fast execution
                  </span>
                </div>
              ) : null;
            })()
          )}
        </div>
      </CardContent>
    </Card>
  );
}