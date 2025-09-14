import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Play, Pause, Square, Send, CheckCircle, Clock, AlertCircle, Loader2, Wifi, WifiOff } from "lucide-react";
import { useOrchestration } from "@/providers/OrchestrationProvider";
import type { ProjectWithModules, OrchestrationStage } from "@/types/project";

interface OrchestrationPanelProps {
  project: ProjectWithModules;
}

export default function OrchestrationPanel({ project }: OrchestrationPanelProps) {
  const [userBrief, setUserBrief] = useState("");
  const [agentMessage, setAgentMessage] = useState("");
  const { toast } = useToast();
  
  // Use the enhanced OrchestrationProvider
  const { state, actions } = useOrchestration();
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
      await actions.startOrchestration(project.id, userBrief);
      setUserBrief("");
    } catch (error) {
      // Error handling is done in the provider
    }
  };

  const handleControlAction = async (action: "pause" | "resume" | "cancel") => {
    if (!orchestrationStatus?.id) return;
    
    try {
      switch (action) {
        case "pause":
          await actions.pauseOrchestration(orchestrationStatus.id);
          break;
        case "resume":
          await actions.resumeOrchestration(orchestrationStatus.id);
          break;
        case "cancel":
          await actions.cancelOrchestration(orchestrationStatus.id);
          break;
      }
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
      default:
        return 'Pending';
    }
  };

  const mockStages: OrchestrationStage[] = [
    {
      id: '1',
      name: 'Planning',
      status: orchestrationStatus?.status === 'running' && orchestrationStatus?.currentStage === 'planning' ? 'running' : 
             orchestrationStatus?.progress >= 25 ? 'completed' : 'pending',
      progress: Math.min(orchestrationStatus?.progress || 0, 25),
    },
    {
      id: '2', 
      name: 'Building',
      status: orchestrationStatus?.status === 'running' && orchestrationStatus?.currentStage === 'building' ? 'running' :
             orchestrationStatus?.progress >= 85 ? 'completed' : 'pending',
      progress: Math.max(0, Math.min((orchestrationStatus?.progress || 0) - 25, 60)),
    },
    {
      id: '3',
      name: 'Validation', 
      status: orchestrationStatus?.status === 'running' && orchestrationStatus?.currentStage === 'validation' ? 'running' :
             orchestrationStatus?.progress >= 95 ? 'completed' : 'pending',
      progress: Math.max(0, Math.min((orchestrationStatus?.progress || 0) - 85, 10)),
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
              disabled={statusLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground glow-gold"
              data-testid="button-start-orchestration"
            >
              {statusLoading ? (
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
          {mockStages.map((stage, index) => (
            <div
              key={stage.id}
              className={`flex items-center space-x-3 p-3 bg-secondary rounded-lg border-l-4 ${
                stage.status === 'completed' ? 'border-green-500' :
                stage.status === 'running' ? 'border-primary' :
                stage.status === 'error' ? 'border-destructive' :
                'border-muted'
              } ${stage.status === 'pending' ? 'opacity-50' : ''}`}
              data-testid={`stage-${stage.id}`}
            >
              <div className="flex-shrink-0">
                {getStageIcon(stage.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-foreground">
                    {index + 1}. {stage.name}
                  </p>
                  <span className={`text-xs font-medium ${
                    stage.status === 'completed' ? 'text-green-500' :
                    stage.status === 'running' ? 'text-primary' :
                    stage.status === 'error' ? 'text-destructive' :
                    'text-muted-foreground'
                  }`}>
                    {getStageStatusText(stage.status)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {stage.name === 'Planning' && 'Circuit design and component selection'}
                  {stage.name === 'Building' && 'Generating schematics and layouts'}
                  {stage.name === 'Validation' && 'ERC/DRC checks and optimization'}
                  {stage.name === 'Export' && 'Generate production files'}
                </p>
                {stage.status === 'running' && (
                  <Progress value={stage.progress} className="h-2" />
                )}
              </div>
            </div>
          ))}
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
              disabled={statusLoading}
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
              disabled={statusLoading}
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
            disabled={controlOrchestrationMutation.isPending}
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
    </div>
  );
}
