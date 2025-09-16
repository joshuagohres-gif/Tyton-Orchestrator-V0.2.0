import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, CheckCircle, FileText, Zap } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProjectWithModules } from "@/types/project";

interface SchematicDiagramProps {
  project: ProjectWithModules;
}

export default function SchematicDiagram({ project }: SchematicDiagramProps) {
  const { toast } = useToast();

  const exportSchematicMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/eda/export/kicad", {
        projectId: project.id,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Export Successful",
        description: "Schematic files have been generated and are ready for download.",
      });
      
      // In a real implementation, this would trigger a file download
      console.log("Export data:", data);
    },
    onError: (error: Error) => {
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const validateCircuitMutation = useMutation({
    mutationFn: async () => {
      // This would call the circuit validation endpoint
      const response = await apiRequest("POST", "/api/eda/validate", {
        projectId: project.id,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Validation Complete",
        description: "Circuit validation passed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Validation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleExportSchematic = () => {
    exportSchematicMutation.mutate();
  };

  const handleValidateCircuit = () => {
    validateCircuitMutation.mutate();
  };

  // Generate schematic based on project modules
  const renderSchematic = () => {
    const modules = project.modules || [];
    const connections = project.connections || [];

    if (modules.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-2">No components in design</p>
          <p className="text-xs text-muted-foreground">Add components to the canvas to generate a schematic</p>
        </div>
      );
    }

    return (
      <svg width="100%" height="300" viewBox="0 0 350 300" className="bg-background rounded border border-border">
        {/* Background grid */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Render components */}
        {modules.slice(0, 3).map((module, index) => {
          const x = 50 + index * 100;
          const y = 50 + (index % 2) * 120;
          const width = 80;
          const height = 60;
          
          return (
            <g key={module.id}>
              {/* Component rectangle */}
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill="hsl(0 0% 16%)"
                stroke="hsl(51 100% 50%)"
                strokeWidth="2"
                rx="4"
              />
              
              {/* Component label */}
              <text
                x={x + width / 2}
                y={y + height / 2 - 5}
                textAnchor="middle"
                fill="hsl(0 0% 98%)"
                fontSize="10"
                fontFamily="monospace"
              >
                {module.label}
              </text>
              
              {/* Component type */}
              <text
                x={x + width / 2}
                y={y + height / 2 + 8}
                textAnchor="middle"
                fill="hsl(0 0% 63%)"
                fontSize="8"
                fontFamily="monospace"
              >
                {module.component?.category?.toUpperCase() || 'COMP'}
              </text>
              
              {/* Component pins */}
              <circle cx={x - 5} cy={y + height / 2} r="3" fill="hsl(195 100% 50%)" />
              <circle cx={x + width + 5} cy={y + height / 2} r="3" fill="hsl(195 100% 50%)" />
            </g>
          );
        })}
        
        {/* Render connections */}
        {connections.slice(0, 2).map((connection, index) => {
          const sourceIndex = modules.findIndex(m => m.id === connection.fromModuleId);
          const targetIndex = modules.findIndex(m => m.id === connection.toModuleId);
          
          if (sourceIndex === -1 || targetIndex === -1) return null;
          
          const sourceX = 50 + sourceIndex * 100 + 80 + 5;
          const sourceY = 50 + (sourceIndex % 2) * 120 + 30;
          const targetX = 50 + targetIndex * 100 - 5;
          const targetY = 50 + (targetIndex % 2) * 120 + 30;
          
          return (
            <line
              key={connection.id}
              x1={sourceX}
              y1={sourceY}
              x2={targetX}
              y2={targetY}
              stroke="hsl(195 100% 50%)"
              strokeWidth="2"
              filter="drop-shadow(0 0 4px hsl(195 100% 50%))"
            />
          );
        })}
        
        {/* Connection labels */}
        {connections.slice(0, 2).map((connection, index) => {
          const midX = 175;
          const midY = 100 + index * 20;
          
          return (
            <text
              key={`label-${connection.id}`}
              x={midX}
              y={midY}
              fill="hsl(0 0% 63%)"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {connection.fromPort}→{connection.toPort}
            </text>
          );
        })}
        
        {/* Title */}
        <text
          x="10"
          y="20"
          fill="hsl(0 0% 98%)"
          fontSize="12"
          fontFamily="monospace"
          fontWeight="bold"
        >
          {project.title} - Circuit Schematic
        </text>
      </svg>
    );
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Circuit Schematic</h3>
      
      {/* Schematic Display */}
      <Card className="bg-secondary border-border">
        <CardContent className="p-4">
          {renderSchematic()}
        </CardContent>
      </Card>
      
      {/* Circuit Statistics */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-secondary border-border">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              <div>
                <p className="text-sm font-medium text-foreground">Components</p>
                <p className="text-xs text-muted-foreground" data-testid="text-component-count">
                  {project.modules?.length || 0} modules
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-secondary border-border">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <div>
                <p className="text-sm font-medium text-foreground">Connections</p>
                <p className="text-xs text-muted-foreground" data-testid="text-connection-count">
                  {project.connections?.length || 0} wires
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Action Buttons */}
      <div className="space-y-2">
        <Button
          onClick={handleExportSchematic}
          disabled={exportSchematicMutation.isPending}
          className="w-full bg-secondary hover:bg-secondary/80 border border-border text-secondary-foreground"
          data-testid="button-export-schematic"
        >
          <Download className="w-4 h-4 mr-2" />
          {exportSchematicMutation.isPending ? "Exporting..." : "Export Schematic"}
        </Button>
        
        <Button
          onClick={handleValidateCircuit}
          disabled={validateCircuitMutation.isPending}
          className="w-full bg-secondary hover:bg-secondary/80 border border-border text-secondary-foreground"
          data-testid="button-validate-circuit"
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          {validateCircuitMutation.isPending ? "Validating..." : "Validate Circuit"}
        </Button>
      </div>
      
      {/* Export Formats */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">Available Formats</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 bg-muted rounded text-muted-foreground text-center">KiCad (.sch)</div>
          <div className="p-2 bg-muted rounded text-muted-foreground text-center">Netlist (.net)</div>
          <div className="p-2 bg-muted rounded text-muted-foreground text-center">PCB (.pcb)</div>
          <div className="p-2 bg-muted rounded text-muted-foreground text-center">3D (.glb)</div>
        </div>
      </div>
    </div>
  );
}
