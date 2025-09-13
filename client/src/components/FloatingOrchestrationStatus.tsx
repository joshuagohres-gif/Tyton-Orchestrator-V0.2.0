import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X, Pause, Square, Maximize2, Minimize2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProjectWithModules } from "@/types/project";

interface FloatingOrchestrationStatusProps {
  project: ProjectWithModules;
}

export default function FloatingOrchestrationStatus({ project }: FloatingOrchestrationStatusProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();

  // Get orchestration status
  const { data: orchestrationStatus } = useQuery({
    queryKey: ["/api/projects", project.id, "orchestrator/status"],
    refetchInterval: 2000, // Poll every 2 seconds
  });

  const controlOrchestrationMutation = useMutation({
    mutationFn: async (action: "pause" | "cancel") => {
      const response = await apiRequest("PUT", `/api/projects/${project.id}/orchestrator/control`, {
        action,
        orchestratorRunId: orchestrationStatus?.id,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Orchestration Updated", 
        description: `Successfully ${data.action}d orchestration.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "orchestrator/status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Control Action Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Only show if orchestration is running or has recent activity
  const shouldShow = orchestrationStatus?.status === 'running' || 
                    orchestrationStatus?.status === 'paused' ||
                    (orchestrationStatus?.status === 'completed' && isVisible);

  if (!shouldShow || !isVisible) {
    return null;
  }

  const getStatusText = () => {
    switch (orchestrationStatus?.status) {
      case 'running':
        return `${orchestrationStatus.currentStage?.charAt(0).toUpperCase()}${orchestrationStatus.currentStage?.slice(1)} Circuit...`;
      case 'paused':
        return 'Orchestration Paused';
      case 'completed':
        return 'Orchestration Complete';
      case 'error':
        return 'Orchestration Error';
      default:
        return 'Processing...';
    }
  };

  const getDetailedMessage = () => {
    switch (orchestrationStatus?.currentStage) {
      case 'planning':
        return 'Analyzing requirements and planning circuit design...';
      case 'building':
        return 'Generating PCB layout with optimal trace routing...';
      case 'validation':
        return 'Running ERC/DRC checks and optimizing design...';
      case 'export':
        return 'Generating production-ready export files...';
      default:
        return 'Processing your hardware design request...';
    }
  };

  const progress = orchestrationStatus?.progress || 0;
  const isRunning = orchestrationStatus?.status === 'running';
  const isPaused = orchestrationStatus?.status === 'paused';

  return (
    <Card 
      className={`fixed bottom-6 right-6 bg-card border-border shadow-lg z-50 transition-all duration-300 ${
        isExpanded ? 'w-96' : 'w-80'
      }`}
      data-testid="floating-orchestration-status"
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-foreground">Orchestration Progress</h4>
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 hover:bg-secondary"
              onClick={() => setIsExpanded(!isExpanded)}
              data-testid="button-toggle-expand"
            >
              {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6 hover:bg-secondary text-muted-foreground"
              onClick={() => setIsVisible(false)}
              data-testid="button-close-status"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground" data-testid="text-orchestration-status">
              {getStatusText()}
            </span>
            <span className="text-xs text-primary font-medium" data-testid="text-orchestration-progress">
              {progress}%
            </span>
          </div>
          
          <Progress 
            value={progress} 
            className="h-2" 
            data-testid="progress-orchestration"
          />
          
          {isExpanded && (
            <p className="text-xs text-muted-foreground" data-testid="text-orchestration-message">
              {getDetailedMessage()}
            </p>
          )}
          
          {(isRunning || isPaused) && (
            <div className="flex space-x-2 pt-2">
              {isRunning && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => controlOrchestrationMutation.mutate('pause')}
                  disabled={controlOrchestrationMutation.isPending}
                  data-testid="button-pause-floating"
                >
                  <Pause className="w-3 h-3 mr-1" />
                  Pause
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => controlOrchestrationMutation.mutate('cancel')}
                disabled={controlOrchestrationMutation.isPending}
                data-testid="button-cancel-floating"
              >
                <Square className="w-3 h-3 mr-1" />
                Cancel
              </Button>
            </div>
          )}
          
          {orchestrationStatus?.status === 'completed' && (
            <div className="flex items-center justify-center pt-2">
              <span className="text-xs text-green-500 font-medium">
                ✓ Circuit design completed successfully!
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
