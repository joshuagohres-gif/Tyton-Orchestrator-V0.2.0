import { useCallback, useEffect, useState } from "react";
import { ReactFlow, Node, Edge, addEdge, useNodesState, useEdgesState, useReactFlow, Controls, Background, BackgroundVariant, ConnectionMode, Connection } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Grid3X3, MousePointer2, Crosshair, ZoomIn, ZoomOut, RotateCcw, RotateCw, Maximize } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
    <div 
      className={`node rounded-lg p-4 w-48 ${selected ? 'ring-2 ring-primary' : ''}`}
      data-testid={`canvas-node-${data.moduleId || data.componentId || 'unknown'}`}
    >
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
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [enableSnapping, setEnableSnapping] = useState(true);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });

  const { sendMessage, lastMessage, connectionStatus } = useWebSocket();

  // Control functions - React Flow instance state
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Grid snapping utility (kept for potential future use)
  const snapToGrid = useCallback((position: { x: number; y: number }, gridSize = 20): { x: number; y: number } => {
    if (!enableSnapping) return position;
    return {
      x: Math.round(position.x / gridSize) * gridSize,
      y: Math.round(position.y / gridSize) * gridSize,
    };
  }, [enableSnapping]);

  // Viewport state for adaptive grid (lifted to parent)
  const [adaptiveViewport, setAdaptiveViewport] = useState({ x: 0, y: 0, zoom: 1 });

  // Adaptive Grid Component with reactive viewport tracking
  const AdaptiveGrid = () => {

    // Calculate adaptive grid properties based on zoom level
    const calculateGridProperties = () => {
      const { zoom } = adaptiveViewport;
      
      // Base grid (always visible)
      const baseGap = Math.max(20, 80 / zoom);
      const baseOpacity = Math.min(0.1, 0.05 * zoom);
      
      // Fine grid (visible at higher zoom levels)
      const fineGap = Math.max(5, 20 / zoom);
      const fineOpacity = zoom > 1.5 ? Math.min(0.05, 0.02 * zoom) : 0;
      
      // Coarse grid (visible at lower zoom levels)
      const coarseGap = Math.max(40, 160 / zoom);
      const coarseOpacity = zoom < 0.75 ? Math.min(0.08, 0.1 / zoom) : 0;

      return { baseGap, baseOpacity, fineGap, fineOpacity, coarseGap, coarseOpacity };
    };

    const { baseGap, baseOpacity, fineGap, fineOpacity, coarseGap, coarseOpacity } = calculateGridProperties();

    return (
      <>
        {/* Coarse grid for zoomed out view */}
        {coarseOpacity > 0 && (
          <Background
            variant={BackgroundVariant.Dots}
            gap={coarseGap}
            size={2}
            color={`rgba(255, 255, 255, ${coarseOpacity})`}
          />
        )}
        
        {/* Base grid - primary reference */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={baseGap}
          size={1.5}
          color={`rgba(255, 255, 255, ${baseOpacity})`}
        />
        
        {/* Fine grid for detailed work */}
        {fineOpacity > 0 && (
          <Background
            variant={BackgroundVariant.Dots}
            gap={fineGap}
            size={0.8}
            color={`rgba(255, 255, 255, ${fineOpacity})`}
          />
        )}
      </>
    );
  };

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

  const createModuleMutation = useMutation({
    mutationFn: async (moduleData: any) => {
      const response = await apiRequest("POST", `/api/projects/${project.id}/modules`, moduleData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
    },
  });

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

  // Remove custom drag snapping to avoid redundancy with React Flow's built-in snapping

  const onNodeDragStop = useCallback(
    (event: any, node: Node) => {
      // Let React Flow handle snapping, just broadcast the final position
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

  // Real-time cursor tracking with proper flow coordinate transformation
  const onMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (showCoordinates && reactFlowInstance) {
        const reactFlowBounds = event.currentTarget.getBoundingClientRect();
        const clientPosition = {
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        };
        // Convert client coordinates to flow coordinates
        const flowPosition = reactFlowInstance.project(clientPosition);
        setCursorPosition(flowPosition);
      }
    },
    [showCoordinates, reactFlowInstance]
  );

  // Viewport change handler for adaptive grid
  const onMove = useCallback(() => {
    if (reactFlowInstance) {
      const currentViewport = reactFlowInstance.getViewport();
      setAdaptiveViewport(currentViewport);
    }
  }, [reactFlowInstance]);

  // Handle drag over to allow dropping
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle component drop from library
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      
      const draggedComponent = (window as any).draggedComponent;
      if (!draggedComponent || !reactFlowInstance) return;

      // Get the canvas bounds and convert to flow coordinates
      const reactFlowBounds = (event.target as Element).closest('.react-flow')?.getBoundingClientRect();
      if (!reactFlowBounds) return;
      
      const clientPosition = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      };
      
      // Convert client coordinates to flow coordinates
      const position = reactFlowInstance.project(clientPosition);

      const newNodeId = `node_${Date.now()}`;
      const newNode: Node = {
        id: newNodeId,
        type: 'hardwareModule',
        position,
        data: {
          label: draggedComponent.name,
          category: draggedComponent.category,
          status: 'validated',
          ports: [
            { id: 'gpio0', label: 'GPIO0', type: 'data', direction: 'output' },
            { id: 'gpio2', label: 'GPIO2', type: 'data', direction: 'output' },
            { id: '3v3', label: '3.3V', type: 'power', direction: 'output' },
            { id: 'gnd', label: 'GND', type: 'power', direction: 'output' },
          ],
          moduleId: newNodeId,
          componentId: draggedComponent.id,
        },
      };

      setNodes((nds) => nds.concat(newNode));

      // Create project module in database with flow coordinates
      createModuleMutation.mutate({
        nodeId: newNodeId,
        label: draggedComponent.name,
        componentId: draggedComponent.id,
        position,
        projectId: project.id,
      });

      // Broadcast the new node to other users
      sendMessage({
        type: 'canvas_update',
        action: 'node_created',
        data: newNode,
        projectId: project.id,
      });

      // Clear the dragged component
      delete (window as any).draggedComponent;
    },
    [setNodes, createModuleMutation, sendMessage, project.id]
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
            onClick={() => reactFlowInstance?.zoomIn()}
            data-testid="button-zoom-in"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-2 hover:bg-secondary" 
            title="Zoom Out"
            onClick={() => reactFlowInstance?.zoomOut()}
            data-testid="button-zoom-out"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-2 hover:bg-secondary" 
            title="Fit to View"
            onClick={() => reactFlowInstance?.fitView()}
            data-testid="button-fit-view"
          >
            <Maximize className="w-4 h-4" />
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
        onDrop={onDrop}
        onDragOver={onDragOver}
        onMouseMove={onMouseMove}
        onMove={onMove}
        onInit={setReactFlowInstance}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        snapToGrid={enableSnapping}
        snapGrid={[20, 20]}
        className="bg-background"
        data-testid="react-flow-canvas"
      >
        <Controls 
          className="bg-card border-border [&>button]:bg-card [&>button]:border-border [&>button]:text-foreground hover:[&>button]:bg-secondary"
          position="bottom-right"
        />
        <AdaptiveGrid />
      </ReactFlow>

      {/* Grid Controls Panel */}
      <div className="absolute top-4 right-4 z-40">
        <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg p-2">
          <div className="flex flex-col space-y-2">
            <Button
              variant={enableSnapping ? "default" : "outline"}
              size="sm"
              onClick={() => setEnableSnapping(!enableSnapping)}
              className="h-8 px-2"
              data-testid="button-toggle-snap"
            >
              <Grid3X3 className="h-4 w-4 mr-1" />
              Snap
            </Button>
            <Button
              variant={showCoordinates ? "default" : "outline"}
              size="sm"
              onClick={() => setShowCoordinates(!showCoordinates)}
              className="h-8 px-2"
              data-testid="button-toggle-coordinates"
            >
              <Crosshair className="h-4 w-4 mr-1" />
              XY
            </Button>
          </div>
        </div>
      </div>

      {/* Coordinate Display */}
      {showCoordinates && (
        <div className="absolute top-4 left-4 z-40">
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2">
            <div className="text-xs text-muted-foreground font-mono" data-testid="text-coordinates">
              {selectedNode 
                ? `Node: (${selectedNode.position.x.toFixed(0)}, ${selectedNode.position.y.toFixed(0)})`
                : `Cursor: (${cursorPosition.x.toFixed(0)}, ${cursorPosition.y.toFixed(0)})`
              }
            </div>
          </div>
        </div>
      )}

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
