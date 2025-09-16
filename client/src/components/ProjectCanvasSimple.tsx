import { useCallback, useEffect, useState } from "react";
import { ReactFlow, Node, Edge, addEdge, useNodesState, useEdgesState, Controls, Background, BackgroundVariant, Connection } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Grid3X3, Crosshair } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProjectWithModules } from "@/types/project";

interface ProjectCanvasProps {
  project: ProjectWithModules;
  selectedNode?: Node | null;
  onSelectionChange?: (node: Node | null) => void;
}

// Simple node component
function SimpleModuleNode({ data }: { data: any }) {
  return (
    <div className="w-64 h-32 bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-foreground mb-2">{data.label}</h3>
      <div className="text-xs text-muted-foreground">{data.category}</div>
    </div>
  );
}

const nodeTypes = {
  hardwareModule: SimpleModuleNode,
};

export default function ProjectCanvasSimple({ project, selectedNode, onSelectionChange }: ProjectCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [enableSnapping, setEnableSnapping] = useState(true);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const { toast } = useToast();

  // Convert project modules to React Flow nodes
  useEffect(() => {
    if (project.modules) {
      const flowNodes: Node[] = project.modules.map((module, index) => ({
        id: module.nodeId,
        type: 'hardwareModule',
        position: (module.position && typeof module.position === 'object' && 'x' in module.position && 'y' in module.position) 
          ? { x: module.position.x, y: module.position.y }
          : { x: 100 + (index * 300), y: 100 + (index * 150) },
        data: {
          label: module.label,
          category: module.component?.category || 'unknown',
          moduleId: module.id,
          componentId: module.componentId,
        },
      }));
      setNodes(flowNodes);
    }
  }, [project.modules, setNodes]);

  // Convert project connections to React Flow edges
  useEffect(() => {
    if (project.connections && project.modules) {
      const moduleIdToNodeId = new Map<string, string>();
      project.modules.forEach((module) => {
        moduleIdToNodeId.set(module.id, module.nodeId);
      });

      const flowEdges: Edge[] = project.connections.map((connection) => ({
        id: connection.edgeId,
        source: moduleIdToNodeId.get(connection.fromModuleId) || connection.fromModuleId,
        target: moduleIdToNodeId.get(connection.toModuleId) || connection.toModuleId,
        sourceHandle: connection.fromPort,
        targetHandle: connection.toPort,
        type: 'smoothstep',
        style: {
          stroke: '#00bfff',
          strokeWidth: 2,
        },
      }));
      setEdges(flowEdges);
    }
  }, [project.connections, project.modules, setEdges]);

  const createConnectionMutation = useMutation({
    mutationFn: async (connection: Connection) => {
      const sourceNode = nodes.find(n => n.id === connection.source);
      const targetNode = nodes.find(n => n.id === connection.target);
      
      if (!sourceNode || !targetNode) throw new Error("Nodes not found");

      const response = await apiRequest("POST", `/api/projects/${project.id}/connections`, {
        fromModuleId: sourceNode.data.moduleId,
        toModuleId: targetNode.data.moduleId,
        fromPort: connection.sourceHandle,
        toPort: connection.targetHandle,
        connectionType: 'data',
        edgeId: `edge-${Date.now()}`,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      toast({
        title: "Connection created",
        description: "Components successfully connected",
      });
    },
  });

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({
      ...params,
      type: 'smoothstep',
      style: { stroke: '#00bfff', strokeWidth: 2 },
    }, eds));
    
    createConnectionMutation.mutate(params);
  }, [setEdges, createConnectionMutation]);

  const onSelectionChange_ = useCallback((elements: { nodes: Node[]; edges: Edge[] }) => {
    const selectedNode = elements.nodes[0] || null;
    onSelectionChange?.(selectedNode);
  }, [onSelectionChange]);

  return (
    <main className="w-full h-full relative bg-background" data-testid="project-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onSelectionChange={onSelectionChange_}
        className="w-full h-full"
        snapToGrid={enableSnapping}
        snapGrid={[20, 20]}
        fitView
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>

      {/* Simple Controls */}
      <div className="absolute top-4 right-4 z-40">
        <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg p-2 space-y-2">
          <Button
            variant={enableSnapping ? "default" : "outline"}
            size="sm"
            onClick={() => setEnableSnapping(!enableSnapping)}
            data-testid="button-toggle-snap"
          >
            <Grid3X3 className="h-4 w-4 mr-1" />
            Snap
          </Button>
          <Button
            variant={showCoordinates ? "default" : "outline"}
            size="sm"
            onClick={() => setShowCoordinates(!showCoordinates)}
            data-testid="button-toggle-coordinates"
          >
            <Crosshair className="h-4 w-4 mr-1" />
            XY
          </Button>
        </div>
      </div>

      {showCoordinates && (
        <div className="absolute top-4 left-4 z-40">
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2">
            <div className="text-xs text-muted-foreground font-mono" data-testid="text-coordinates">
              Canvas Ready
            </div>
          </div>
        </div>
      )}
    </main>
  );
}