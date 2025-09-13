import { useCallback, useEffect, useState } from "react";
import { ReactFlow, Node, Edge, addEdge, useNodesState, useEdgesState, Controls, Background, ConnectionMode, Connection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ZoomIn, ZoomOut, RotateCcw, RotateCw, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectWithModules } from "@/types/project";

interface ProjectCanvasProps {
  project: ProjectWithModules;
}

// Custom node component for hardware modules
function HardwareModuleNode({ data, selected }: { data: any; selected: boolean }) {
  const getComponentIcon = (category: string) => {
    switch (category) {
      case 'microcontroller':
        return '🔧';
      case 'sensor':
        return '📡';
      case 'communication':
        return '📶';
      case 'power':
        return '⚡';
      default:
        return '🔌';
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'validated':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'processing':
        return 'bg-yellow-500 animate-pulse-gold';
      default:
        return 'bg-secondary';
    }
  };

  return (
    <div className={`node rounded-lg p-4 w-48 ${selected ? 'ring-2 ring-primary' : ''}`}>
      <div className="flex items-center space-x-3 mb-3">
        <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
          <span className="text-primary text-sm">{getComponentIcon(data.category)}</span>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-foreground">{data.label}</h3>
          <p className="text-xs text-muted-foreground">{data.category}</p>
        </div>
        <div className={`w-3 h-3 rounded-full ${getStatusColor(data.status)}`} title={data.status || 'Unknown'}></div>
      </div>
      
      {/* Node Ports */}
      <div className="space-y-1">
        {data.ports?.map((port: any, index: number) => (
          <div key={port.id} className="flex justify-between items-center">
            {port.direction === 'input' && (
              <div className={`w-3 h-3 rounded-full cursor-pointer ${
                port.type === 'power' ? 'bg-red-500' :
                port.type === 'data' ? 'bg-accent' :
                'bg-gray-500'
              }`} />
            )}
            <span className="text-xs text-muted-foreground">{port.label}</span>
            {port.direction === 'output' && (
              <div className={`w-3 h-3 rounded-full cursor-pointer ${
                port.type === 'power' ? 'bg-red-500' :
                port.type === 'data' ? 'bg-accent' :
                'bg-gray-500'
              }`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = {
  hardwareModule: HardwareModuleNode,
};

export default function ProjectCanvas({ project }: ProjectCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const { sendMessage, lastMessage, connectionStatus } = useWebSocket();

  // Convert project modules to React Flow nodes
  useEffect(() => {
    if (project.modules) {
      const flowNodes: Node[] = project.modules.map((module) => ({
        id: module.nodeId,
        type: 'hardwareModule',
        position: module.position as { x: number; y: number },
        data: {
          label: module.label,
          category: module.component?.category,
          status: 'validated', // Would come from validation
          ports: [
            { id: 'gpio0', label: 'GPIO0', type: 'data', direction: 'output' },
            { id: 'gpio2', label: 'GPIO2', type: 'data', direction: 'output' },
            { id: '3v3', label: '3.3V', type: 'power', direction: 'output' },
            { id: 'gnd', label: 'GND', type: 'power', direction: 'output' },
          ],
          moduleId: module.id,
          componentId: module.componentId,
        },
      }));
      setNodes(flowNodes);
    }
  }, [project.modules, setNodes]);

  // Convert project connections to React Flow edges
  useEffect(() => {
    if (project.connections) {
      const flowEdges: Edge[] = project.connections.map((connection) => ({
        id: connection.edgeId,
        source: connection.fromModuleId,
        target: connection.toModuleId,
        sourceHandle: connection.fromPort,
        targetHandle: connection.toPort,
        type: 'smoothstep',
        style: {
          stroke: connection.connectionType === 'power' ? '#ef4444' : '#00bfff',
          strokeWidth: 2,
        },
        animated: connection.connectionType === 'data',
      }));
      setEdges(flowEdges);
    }
  }, [project.connections, setEdges]);

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
        connectionType: 'data', // Would be determined by port types
        edgeId: `edge-${Date.now()}`,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
    },
  });

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({
        ...params,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#00bfff', strokeWidth: 2 },
      }, eds));
      
      createConnectionMutation.mutate(params);

      // Broadcast the connection to other users
      sendMessage({
        type: 'canvas_update',
        action: 'connection_created',
        data: params,
        projectId: project.id,
      });
    },
    [setEdges, createConnectionMutation, sendMessage, project.id]
  );

  const onNodeDragStop = useCallback(
    (event: any, node: Node) => {
      // Broadcast node position update
      sendMessage({
        type: 'canvas_update',
        action: 'node_moved',
        data: { nodeId: node.id, position: node.position },
        projectId: project.id,
      });
    },
    [sendMessage, project.id]
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      setSelectedNode(selectedNodes[0] || null);
    },
    []
  );

  // Handle real-time updates from other users
  useEffect(() => {
    if (lastMessage) {
      const message = JSON.parse(lastMessage.data);
      
      if (message.type === 'canvas_update' && message.projectId === project.id) {
        switch (message.action) {
          case 'node_moved':
            setNodes(nodes => 
              nodes.map(node => 
                node.id === message.data.nodeId 
                  ? { ...node, position: message.data.position }
                  : node
              )
            );
            break;
          case 'connection_created':
            setEdges(edges => addEdge({
              ...message.data,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#00bfff', strokeWidth: 2 },
            }, edges));
            break;
        }
      }
    }
  }, [lastMessage, project.id, setNodes, setEdges]);

  return (
    <main className="flex-1 relative bg-background grid-overlay overflow-hidden">
      {/* Canvas Controls */}
      <div className="absolute top-4 left-4 z-40 flex space-x-2">
        <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg p-2 flex space-x-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-2 hover:bg-secondary" 
            title="Zoom In"
            data-testid="button-zoom-in"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-2 hover:bg-secondary" 
            title="Zoom Out"
            data-testid="button-zoom-out"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-2 hover:bg-secondary" 
            title="Fit to View"
            data-testid="button-fit-view"
          >
            <Maximize className="w-4 h-4" />
          </Button>
          <div className="w-px bg-border my-1"></div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-2 hover:bg-secondary" 
            title="Undo"
            data-testid="button-undo"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-2 hover:bg-secondary" 
            title="Redo"
            data-testid="button-redo"
          >
            <RotateCw className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Connection Status */}
        <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'Connected' ? 'bg-green-500' :
              connectionStatus === 'Connecting' ? 'bg-yellow-500 animate-pulse' :
              'bg-red-500'
            }`} />
            <span className="text-xs text-muted-foreground" data-testid="text-connection-status">
              {connectionStatus}
            </span>
          </div>
        </div>
      </div>

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        className="bg-background"
        data-testid="react-flow-canvas"
      >
        <Controls 
          className="bg-card border-border [&>button]:bg-card [&>button]:border-border [&>button]:text-foreground hover:[&>button]:bg-secondary"
          position="bottom-right"
        />
        <Background 
          variant="grid" 
          gap={20} 
          color="rgba(255, 255, 255, 0.03)"
          className="opacity-50"
        />
      </ReactFlow>

      {/* Real-time Collaboration Indicators */}
      <div className="absolute bottom-4 left-4 z-40">
        <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2">
          <div className="flex items-center space-x-2">
            <div className="flex -space-x-1">
              <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-xs font-medium border border-background">
                J
              </div>
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs font-medium text-primary-foreground border border-background">
                S
              </div>
            </div>
            <span className="text-xs text-muted-foreground" data-testid="text-active-collaborators">
              2 editing
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
