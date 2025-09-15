import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  PlayCircle,
  PauseCircle,
  Target,
  TrendingUp,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import StageProgressIndicator from "./StageProgressIndicator";
import type { PipelineTemplateWithStages, PipelineRun, StageDefinition, StageRun } from "@shared/schema";

interface PipelineProgressDashboardProps {
  template: PipelineTemplateWithStages;
  run?: PipelineRun;
  stageRuns?: StageRun[];
  onStageAction?: (action: 'retry' | 'skip' | 'configure', stage: StageDefinition) => void;
  onStageClick?: (stage: StageDefinition) => void;
  className?: string;
}

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m ${Math.round(seconds % 60)}s`;
};

const getOverallProgress = (stageRuns: StageRun[], totalStages: number) => {
  if (totalStages === 0) return 0;
  
  const completedStages = stageRuns.filter(run => 
    run.status === 'completed' || run.status === 'skipped'
  ).length;
  
  const runningStages = stageRuns.filter(run => run.status === 'running');
  // Calculate progress based on stage status since progress is not in StageRun schema
  const runningProgress = runningStages.length * 50; // Assume 50% progress for running stages
  
  return Math.round(((completedStages * 100) + runningProgress) / totalStages);
};

const getPipelineMetrics = (stageRuns: StageRun[]) => {
  const completed = stageRuns.filter(run => run.status === 'completed').length;
  const failed = stageRuns.filter(run => run.status === 'error').length;
  const running = stageRuns.filter(run => run.status === 'running').length;
  const skipped = stageRuns.filter(run => run.status === 'skipped').length;
  const pending = stageRuns.filter(run => run.status === 'pending').length;
  
  return { completed, failed, running, skipped, pending };
};

const getEstimatedTimeRemaining = (
  stageRuns: StageRun[], 
  template: PipelineTemplateWithStages
): number | null => {
  const stages = template.stageDefinitions || [];
  const runningStage = stageRuns.find(run => run.status === 'running');
  
  if (!runningStage) return null;
  
  const currentStage = stages.find((stage: StageDefinition) => stage.name === runningStage.stageName);
  if (!currentStage || !currentStage.estimatedDuration) return null;
  
  // Estimate remaining time for current stage (assume 50% progress for running stage)
  const assumedProgress = 50;
  const currentStageRemaining = (currentStage.estimatedDuration * (100 - assumedProgress)) / 100;
  
  // Add estimated time for remaining stages
  const currentStageOrder = currentStage.order;
  const remainingStages = stages.filter((stage: StageDefinition) => stage.order > currentStageOrder);
  const remainingStagesTime = remainingStages.reduce((total: number, stage: StageDefinition) => 
    total + (stage.estimatedDuration || 60), 0
  );
  
  return currentStageRemaining + remainingStagesTime;
};

export default function PipelineProgressDashboard({
  template,
  run,
  stageRuns = [],
  onStageAction,
  onStageClick,
  className,
}: PipelineProgressDashboardProps) {
  const stages = useMemo(() => {
    return [...(template.stageDefinitions || [])].sort((a, b) => a.order - b.order);
  }, [template.stageDefinitions]);

  const stageRunsMap = useMemo(() => {
    return stageRuns.reduce((map, run) => {
      map[run.stageName] = run;
      return map;
    }, {} as Record<string, StageRun>);
  }, [stageRuns]);

  const overallProgress = getOverallProgress(stageRuns, stages.length);
  const metrics = getPipelineMetrics(stageRuns);
  const estimatedTimeRemaining = getEstimatedTimeRemaining(stageRuns, template);
  
  const totalElapsedTime = useMemo(() => {
    if (!run?.startedAt) return 0;
    const startTime = new Date(run.startedAt).getTime();
    const endTime = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
    return (endTime - startTime) / 1000;
  }, [run?.startedAt, run?.completedAt]);

  const isRunning = run?.status === 'running';
  const isCompleted = run?.status === 'completed';
  const hasErrors = metrics.failed > 0;

  return (
    <div className={cn("space-y-6", className)} data-testid="pipeline-progress-dashboard">
      {/* Overall Progress Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                {isRunning && <Activity className="w-5 h-5 text-blue-500 animate-pulse" />}
                {isCompleted && <CheckCircle className="w-5 h-5 text-green-500" />}
                {hasErrors && <AlertTriangle className="w-5 h-5 text-red-500" />}
                <span>{template.name}</span>
              </CardTitle>
              <CardDescription>Pipeline execution progress</CardDescription>
            </div>
            
            <div className="text-right">
              <div className="text-2xl font-bold">{overallProgress}%</div>
              <div className="text-sm text-muted-foreground">Complete</div>
            </div>
          </div>
          
          <Progress value={overallProgress} className="h-3" />
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Completed Stages */}
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <div>
                <div className="text-lg font-semibold">{metrics.completed}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
            </div>
            
            {/* Failed Stages */}
            <div className="flex items-center space-x-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <div>
                <div className="text-lg font-semibold">{metrics.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </div>
            
            {/* Running Stages */}
            <div className="flex items-center space-x-2">
              <PlayCircle className="w-4 h-4 text-blue-500" />
              <div>
                <div className="text-lg font-semibold">{metrics.running}</div>
                <div className="text-xs text-muted-foreground">Running</div>
              </div>
            </div>
            
            {/* Pending Stages */}
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <div>
                <div className="text-lg font-semibold">{metrics.pending}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
            </div>
          </div>
          
          <Separator className="my-4" />
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            {/* Elapsed Time */}
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="font-medium">Elapsed Time</div>
                <div className="text-muted-foreground">
                  {formatDuration(totalElapsedTime)}
                </div>
              </div>
            </div>
            
            {/* Estimated Time Remaining */}
            {estimatedTimeRemaining && isRunning && (
              <div className="flex items-center space-x-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">Time Remaining</div>
                  <div className="text-muted-foreground">
                    {formatDuration(estimatedTimeRemaining)}
                  </div>
                </div>
              </div>
            )}
            
            {/* Average Stage Duration */}
            {metrics.completed > 0 && (
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">Avg Stage Duration</div>
                  <div className="text-muted-foreground">
                    {formatDuration(
                      stageRuns
                        .filter(run => run.status === 'completed' && run.startedAt && run.completedAt)
                        .reduce((total, run) => {
                          const duration = (new Date(run.completedAt!).getTime() - new Date(run.startedAt!).getTime()) / 1000;
                          return total + duration;
                        }, 0) / metrics.completed
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Individual Stage Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Stage Progress</CardTitle>
          <CardDescription>
            Detailed progress for each pipeline stage
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-3">
              {stages.map((stage, index) => (
                <div key={stage.id}>
                  <StageProgressIndicator
                    definition={stage}
                    run={stageRunsMap[stage.name]}
                    isActive={(run?.currentStageOrder ?? -1) === stage.order}
                    showDetailedMetrics={true}
                    showActions={true}
                    onActionClick={onStageAction}
                    onStageClick={onStageClick}
                  />
                  
                  {index < stages.length - 1 && (
                    <div className="flex justify-center my-2">
                      <div className="w-px h-4 bg-border" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Performance Insights */}
      {isCompleted && metrics.completed > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5" />
              <span>Performance Insights</span>
            </CardTitle>
          </CardHeader>
          
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium mb-2">Stage Performance</div>
                <div className="space-y-1">
                  {stages.map((stage) => {
                    const stageRun = stageRunsMap[stage.name];
                    if (!stageRun || stageRun.status !== 'completed' || !stageRun.startedAt || !stageRun.completedAt) {
                      return null;
                    }
                    
                    const actualDuration = (new Date(stageRun.completedAt).getTime() - new Date(stageRun.startedAt).getTime()) / 1000;
                    const expectedDuration = stage.estimatedDuration || 60;
                    const performanceRatio = actualDuration / expectedDuration;
                    
                    return (
                      <div key={stage.id} className="flex items-center justify-between text-xs">
                        <span className="truncate">{stage.displayName}</span>
                        <Badge 
                          variant={performanceRatio < 0.8 ? "default" : performanceRatio < 1.2 ? "secondary" : "destructive"}
                          className="text-xs"
                        >
                          {performanceRatio < 0.8 ? 'Fast' : performanceRatio < 1.2 ? 'On-time' : 'Slow'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div>
                <div className="text-sm font-medium mb-2">Success Rate</div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Successful stages</span>
                    <span className="font-mono">
                      {Math.round((metrics.completed / (metrics.completed + metrics.failed)) * 100)}%
                    </span>
                  </div>
                  <Progress 
                    value={(metrics.completed / (metrics.completed + metrics.failed)) * 100} 
                    className="h-2"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}