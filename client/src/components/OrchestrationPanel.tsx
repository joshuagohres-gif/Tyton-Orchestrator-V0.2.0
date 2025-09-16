import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  Play, Pause, Square, Send, CheckCircle, Clock, AlertCircle, Loader2, Wifi, WifiOff,
  RotateCcw, SkipForward, Settings, Info, ExternalLink, AlertTriangle, CheckCircle2,
  User, Bot, Timer, Activity, TrendingUp
} from "lucide-react";
import { useOrchestration } from "@/providers/OrchestrationProvider";
import StageDetailsModal from "./StageDetailsModal";
import type { ProjectWithModules, OrchestrationStage } from "@/types/project";

interface OrchestrationPanelProps {
  project: ProjectWithModules;
}

export default function OrchestrationPanel({ project }: OrchestrationPanelProps) {
  const [userBrief, setUserBrief] = useState("");
  const [agentMessage, setAgentMessage] = useState("");
  const [selectedStage, setSelectedStage] = useState<OrchestrationStage | null>(null);
  const [stageDetailsOpen, setStageDetailsOpen] = useState(false);
  const { toast } = useToast();
  
  // Use the enhanced OrchestrationProvider
  const { state, startPending, controlPending, actions } = useOrchestration();
  const { status: orchestrationStatus, isLoading: statusLoading, error, isWebSocketConnected, logs } = state;

  const handleStartOrchestration = async () => {
    if (!userBrief.trim()) {
      toast({
        title: "Brief Required",
        description: "Please provide a description of your hardware requirements.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      await actions.startOrchestration(userBrief);
      setUserBrief("");
    } catch (error) {
      // Error handling is done in the provider
    }
  };

  const handleControlAction = async (action: "pause" | "resume" | "cancel") => {
    if (!orchestrationStatus?.id) return;
    
    try {
      await actions.controlOrchestration(action);
    } catch (error) {
      // Error handling is done in the provider
    }
  };

  const handleSendAgentMessage = () => {
    if (!agentMessage.trim()) return;
    
    // This would integrate with the AI agent in a real implementation
    toast({
      title: "Message Sent",
      description: "Your message has been sent to the AI agent.",
    });
    setAgentMessage("");
  };

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStageStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Complete';
      case 'running':
        return 'In Progress';
      case 'error':
        return 'Error';
      case 'paused':
        return 'Paused';
      case 'skipped':
        return 'Skipped';
      default:
        return 'Pending';
    }
  };

  const handleStageClick = (stage: OrchestrationStage) => {
    setSelectedStage(stage);
    setStageDetailsOpen(true);
  };

  const handleStageAction = async (action: 'retry' | 'skip' | 'configure', stage: OrchestrationStage) => {
    try {
      // This would be connected to actual stage control APIs
      toast({
        title: `Stage ${action.charAt(0).toUpperCase() + action.slice(1)}`,
        description: `${action === 'retry' ? 'Retrying' : action === 'skip' ? 'Skipping' : 'Configuring'} stage: ${stage.name}`,
      });
    } catch (error) {
      toast({
        title: "Stage Action Failed",
        description: `Failed to ${action} stage: ${stage.name}`,
        variant: "destructive",
      });
    }
  };

  const getStageMetrics = (stage: OrchestrationStage) => {
    // Mock metrics for demo - in real app would come from backend
    return {
      duration: stage.status === 'completed' ? Math.floor(Math.random() * 120) + 30 : null,
      attempts: stage.status === 'error' ? Math.floor(Math.random() * 3) + 1 : 1,
      estimatedTime: stage.status === 'pending' ? Math.floor(Math.random() * 180) + 60 : null,
    };
  };

  const mockStages: OrchestrationStage[] = [
    {
      id: '1',
      name: 'Planning',
      status: orchestrationStatus?.status === 'running' && orchestrationStatus?.currentStage === 'planning' ? 'running' : 
             (orchestrationStatus?.progress ?? 0) >= 25 ? 'completed' : 'pending',
      progress: Math.min(orchestrationStatus?.progress ?? 0, 25),
    },
    {
      id: '2', 
      name: 'Building',
      status: orchestrationStatus?.status === 'running' && orchestrationStatus?.currentStage === 'building' ? 'running' :
             (orchestrationStatus?.progress ?? 0) >= 85 ? 'completed' : 'pending',
      progress: Math.max(0, Math.min((orchestrationStatus?.progress ?? 0) - 25, 60)),
    },
    {
      id: '3',
      name: 'Validation', 
      status: orchestrationStatus?.status === 'running' && orchestrationStatus?.currentStage === 'validation' ? 'running' :
             (orchestrationStatus?.progress ?? 0) >= 95 ? 'completed' : 'pending',
      progress: Math.max(0, Math.min((orchestrationStatus?.progress ?? 0) - 85, 10)),
    },
    {
      id: '4',
      name: 'Export',
      status: orchestrationStatus?.status === 'completed' ? 'completed' :
             orchestrationStatus?.status === 'running' && orchestrationStatus?.currentStage === 'export' ? 'running' : 'pending',
      progress: Math.max(0, (orchestrationStatus?.progress || 0) - 95),
    },
  ];

  // Use real logs from provider, with fallback to mock data for demo
  const displayLogs = logs.length > 0 ? logs : [
    { id: '1', stage: 'Planning', message: 'Analyzing component requirements...', timestamp: new Date(Date.now() - 120000).toISOString(), level: 'info' as const },
    { id: '2', stage: 'Building', message: 'Generating schematic for DHT22 sensor connection...', timestamp: new Date(Date.now() - 60000).toISOString(), level: 'info' as const },
    { id: '3', stage: 'Building', message: 'Optimizing PCB layout for minimal interference...', timestamp: new Date(Date.now() - 30000).toISOString(), level: 'info' as const },
  ];

  const canStart = orchestrationStatus?.status === 'idle' || orchestrationStatus?.status === 'completed' || orchestrationStatus?.status === 'error' || orchestrationStatus?.status === 'cancelled';
  const isRunning = orchestrationStatus?.status === 'running';
  const isPaused = orchestrationStatus?.status === 'paused';

  return (
    <div className="p-4 space-y-6">
      {/* Start Orchestration Section */}
      {canStart && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-semibold text-foreground">AI Orchestration</h3>
              <div className="flex items-center space-x-1" data-testid="websocket-status">
                {isWebSocketConnected ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-500" />
                    <span className="text-xs text-green-500">Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Polling</span>
                  </>
                )}
              </div>
            </div>
            <Button
              onClick={handleStartOrchestration}
              disabled={startPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground glow-gold"
              data-testid="button-start-orchestration"
            >
              {startPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Start
            </Button>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Hardware Requirements</label>
            <Textarea
              value={userBrief}
              onChange={(e) => setUserBrief(e.target.value)}
              placeholder="Describe your hardware project requirements... (e.g., 'Create a smart home sensor network with temperature, humidity, and motion detection capabilities')"
              className="bg-input border-border text-foreground resize-none"
              rows={4}
              data-testid="textarea-user-brief"
            />
          </div>
        </div>
      )}

      {/* Pipeline Stages */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-foreground">Pipeline Stages</h4>
        <div className="space-y-3">
          {mockStages.map((stage, index) => {
            const metrics = getStageMetrics(stage);
            return (
              <Card
                key={stage.id}
                className={`cursor-pointer transition-all hover:shadow-md border-l-4 ${
                  stage.status === 'completed' ? 'border-green-500' :
                  stage.status === 'running' ? 'border-primary' :
                  stage.status === 'error' ? 'border-destructive' :
                  'border-muted'
                } ${stage.status === 'pending' ? 'opacity-60' : ''}`}
                onClick={() => handleStageClick(stage)}
                data-testid={`stage-${stage.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="flex-shrink-0 mt-0.5">
                        {getStageIcon(stage.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="text-sm font-medium text-foreground">
                            {index + 1}. {stage.name}
                          </h4>
                          <Badge variant={stage.status === 'completed' ? 'default' : 
                                        stage.status === 'running' ? 'secondary' :
                                        stage.status === 'error' ? 'destructive' : 'outline'}
                                 className="text-xs">
                            {getStageStatusText(stage.status)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {stage.name === 'Planning' && 'Circuit design and component selection'}
                          {stage.name === 'Building' && 'Generating schematics and layouts'}
                          {stage.name === 'Validation' && 'ERC/DRC checks and optimization'}
                          {stage.name === 'Export' && 'Generate production files'}
                        </p>
                        
                        {/* Stage Metrics */}
                        <div className="flex items-center space-x-4 text-xs text-muted-foreground mb-2">
                          {metrics.duration && (
                            <div className="flex items-center space-x-1">
                              <Timer className="w-3 h-3" />
                              <span>{metrics.duration}s</span>
                            </div>
                          )}
                          {metrics.estimatedTime && (
                            <div className="flex items-center space-x-1">
                              <Clock className="w-3 h-3" />
                              <span>~{Math.floor(metrics.estimatedTime / 60)}m</span>
                            </div>
                          )}
                          {metrics.attempts > 1 && (
                            <div className="flex items-center space-x-1">
                              <RotateCcw className="w-3 h-3" />
                              <span>{metrics.attempts} attempts</span>
                            </div>
                          )}
                        </div>
                        
                        {stage.status === 'running' && (
                          <Progress value={stage.progress} className="h-2 mb-2" />
                        )}
                        
                        {stage.status === 'error' && (
                          <Alert className="border-destructive/20 bg-destructive/5 mb-2">
                            <AlertTriangle className="h-3 w-3" />
                            <AlertDescription className="text-xs">
                              {stage.name === 'Planning' && 'Failed to analyze circuit requirements'}
                              {stage.name === 'Building' && 'Schematic generation encountered errors'}
                              {stage.name === 'Validation' && 'ERC checks found critical issues'}
                              {stage.name === 'Export' && 'File generation failed'}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                    
                    {/* Stage Actions */}
                    <div className="flex items-center space-x-1 ml-2">
                      {stage.status === 'error' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStageAction('retry', stage);
                          }}
                          data-testid={`button-retry-${stage.id}`}
                        >
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      )}
                      
                      {(stage.status === 'error' || stage.status === 'pending') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStageAction('skip', stage);
                          }}
                          data-testid={`button-skip-${stage.id}`}
                        >
                          <SkipForward className="w-3 h-3" />
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStageAction('configure', stage);
                        }}
                        data-testid={`button-configure-${stage.id}`}
                      >
                        <Settings className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Control Actions */}
      {(isRunning || isPaused) && (
        <div className="flex space-x-2">
          {isRunning && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleControlAction('pause')}
              disabled={controlPending}
              data-testid="button-pause-orchestration"
            >
              <Pause className="w-4 h-4 mr-2" />
              Pause
            </Button>
          )}
          {isPaused && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleControlAction('resume')}
              disabled={controlPending}
              data-testid="button-resume-orchestration"
            >
              <Play className="w-4 h-4 mr-2" />
              Resume
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleControlAction('cancel')}
            disabled={controlPending}
            data-testid="button-cancel-orchestration"
          >
            <Square className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>
      )}

      {/* AI Agent Console */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">AI Agent Console</h4>
        <ScrollArea className="h-32 bg-secondary border border-border rounded-lg p-3">
          <div className="space-y-2">
            {displayLogs.slice(-10).map((log, index) => (
              <div key={index} className="text-xs">
                <span className="text-accent font-medium">[{log.stage}]</span>
                <span className="text-muted-foreground ml-2">{log.message}</span>
                <span className="text-muted-foreground/70 ml-2">({log.timestamp})</span>
              </div>
            ))}
          </div>
        </ScrollArea>
        
        <div className="flex space-x-2">
          <Input
            type="text"
            placeholder="Send message to AI agent..."
            value={agentMessage}
            onChange={(e) => setAgentMessage(e.target.value)}
            className="flex-1 bg-input border-border text-foreground"
            onKeyDown={(e) => e.key === 'Enter' && handleSendAgentMessage()}
            data-testid="input-agent-message"
          />
          <Button
            onClick={handleSendAgentMessage}
            disabled={!agentMessage.trim()}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
            size="sm"
            data-testid="button-send-agent-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stage Details Modal */}
      <StageDetailsModal
        stage={selectedStage}
        open={stageDetailsOpen}
        onOpenChange={setStageDetailsOpen}
        onStageAction={handleStageAction}
      />
    </div>
  );
}
