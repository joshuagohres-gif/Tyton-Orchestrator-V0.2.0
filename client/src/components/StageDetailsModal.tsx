import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  CheckCircle, Clock, AlertCircle, Loader2, Timer, Activity, 
  RotateCcw, SkipForward, Settings, Info, ExternalLink, 
  AlertTriangle, User, Bot, TrendingUp
} from "lucide-react";
import type { OrchestrationStage } from "@/types/project";

interface StageDetailsModalProps {
  stage: OrchestrationStage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStageAction?: (action: 'retry' | 'skip' | 'configure', stage: OrchestrationStage) => void;
}

export default function StageDetailsModal({ 
  stage, 
  open, 
  onOpenChange, 
  onStageAction 
}: StageDetailsModalProps) {
  if (!stage) return null;

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

  const getStageDescription = (name: string) => {
    switch (name) {
      case 'Planning':
        return 'Analyzes hardware requirements and selects optimal components for the circuit design.';
      case 'Building':
        return 'Generates detailed schematics, PCB layouts, and routing optimizations.';
      case 'Validation':
        return 'Performs electrical rule checks (ERC), design rule checks (DRC), and signal integrity analysis.';
      case 'Export':
        return 'Creates production-ready files including Gerbers, BOMs, and assembly instructions.';
      default:
        return 'Processing stage in the hardware design pipeline.';
    }
  };

  const mockStageDetails = {
    Planning: {
      outputs: ['Component selection criteria', 'Circuit topology', 'Power analysis'],
      inputs: ['User requirements', 'Performance constraints', 'Budget parameters'],
      estimatedTime: 120,
      actualTime: stage.status === 'completed' ? 105 : null,
    },
    Building: {
      outputs: ['Schematic files', 'PCB layout', 'Component placement'],
      inputs: ['Component list', 'Circuit topology', 'Physical constraints'],
      estimatedTime: 300,
      actualTime: stage.status === 'completed' ? 275 : null,
    },
    Validation: {
      outputs: ['ERC report', 'DRC report', 'Signal integrity analysis'],
      inputs: ['Schematic files', 'PCB layout', 'Design rules'],
      estimatedTime: 90,
      actualTime: stage.status === 'completed' ? 85 : null,
    },
    Export: {
      outputs: ['Gerber files', 'BOM', 'Assembly drawings', 'Pick & place files'],
      inputs: ['Validated design', 'Manufacturing specs', 'Quality requirements'],
      estimatedTime: 60,
      actualTime: stage.status === 'completed' ? 55 : null,
    },
  };

  const details = mockStageDetails[stage.name as keyof typeof mockStageDetails];
  
  const mockLogs = [
    { timestamp: '2025-01-15 23:52:15', level: 'info', message: `Starting ${stage.name} stage execution` },
    { timestamp: '2025-01-15 23:52:18', level: 'info', message: `Loading ${stage.name.toLowerCase()} configuration` },
    { timestamp: '2025-01-15 23:52:22', level: 'info', message: `Processing inputs: ${details?.inputs.slice(0, 2).join(', ')}` },
    ...(stage.status === 'error' ? [
      { timestamp: '2025-01-15 23:52:45', level: 'error', message: `Validation failed: Circuit analysis detected potential issues` },
      { timestamp: '2025-01-15 23:52:46', level: 'error', message: `Stage failed after 3 retry attempts` },
    ] : []),
    ...(stage.status === 'completed' ? [
      { timestamp: '2025-01-15 23:54:30', level: 'success', message: `Generated all required outputs successfully` },
      { timestamp: '2025-01-15 23:54:31', level: 'success', message: `Stage completed in ${details?.actualTime}s` },
    ] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center space-x-3">
            {getStageIcon(stage.status)}
            <div>
              <DialogTitle className="text-xl">{stage.name} Stage</DialogTitle>
              <DialogDescription className="mt-1">
                {getStageDescription(stage.name)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          {/* Status & Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Status & Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={stage.status === 'completed' ? 'default' : 
                              stage.status === 'running' ? 'secondary' :
                              stage.status === 'error' ? 'destructive' : 'outline'}>
                  {stage.status.charAt(0).toUpperCase() + stage.status.slice(1)}
                </Badge>
              </div>
              
              {stage.status === 'running' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Progress</span>
                    <span className="text-sm font-medium">{stage.progress}%</span>
                  </div>
                  <Progress value={stage.progress} className="h-2" />
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estimated Time</span>
                <div className="flex items-center space-x-1">
                  <Timer className="w-3 h-3" />
                  <span className="text-sm">{Math.floor((details?.estimatedTime || 0) / 60)}m {(details?.estimatedTime || 0) % 60}s</span>
                </div>
              </div>
              
              {details?.actualTime && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Actual Time</span>
                  <div className="flex items-center space-x-1">
                    <Activity className="w-3 h-3" />
                    <span className="text-sm">{Math.floor(details.actualTime / 60)}m {details.actualTime % 60}s</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Inputs & Outputs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Inputs & Outputs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h5 className="text-xs font-medium text-muted-foreground mb-2">Inputs</h5>
                <div className="space-y-1">
                  {details?.inputs.map((input, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span className="text-xs">{input}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h5 className="text-xs font-medium text-muted-foreground mb-2">Expected Outputs</h5>
                <div className="space-y-1">
                  {details?.outputs.map((output, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        stage.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'
                      }`} />
                      <span className="text-xs">{output}</span>
                      {stage.status === 'completed' && (
                        <CheckCircle className="w-3 h-3 text-green-500 ml-auto" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Error Details */}
        {stage.status === 'error' && (
          <Alert className="border-destructive/20 bg-destructive/5 mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Stage Failed</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-3">The {stage.name.toLowerCase()} stage encountered errors during execution. Common causes include:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Invalid input parameters or missing dependencies</li>
                <li>Resource constraints or timeout issues</li>
                <li>Configuration conflicts or validation failures</li>
              </ul>
              <div className="flex space-x-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => onStageAction?.('retry', stage)}>
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Retry
                </Button>
                <Button size="sm" variant="outline" onClick={() => onStageAction?.('configure', stage)}>
                  <Settings className="w-3 h-3 mr-1" />
                  Configure
                </Button>
                <Button size="sm" variant="outline" onClick={() => onStageAction?.('skip', stage)}>
                  <SkipForward className="w-3 h-3 mr-1" />
                  Skip
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Stage Logs */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm">Stage Logs</CardTitle>
            <CardDescription>Real-time execution logs and status updates</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-32 w-full">
              <div className="space-y-2">
                {mockLogs.map((log, index) => (
                  <div key={index} className="flex items-start space-x-3 text-xs">
                    <span className="text-muted-foreground whitespace-nowrap">{log.timestamp}</span>
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${
                      log.level === 'error' ? 'bg-red-500' :
                      log.level === 'success' ? 'bg-green-500' :
                      'bg-blue-500'
                    }`} />
                    <span className={
                      log.level === 'error' ? 'text-red-600' :
                      log.level === 'success' ? 'text-green-600' :
                      'text-foreground'
                    }>{log.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}