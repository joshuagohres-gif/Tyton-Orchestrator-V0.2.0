import { useCallback, useEffect, useState } from "react";
import { ReactFlow, Node, Edge, addEdge, useNodesState, useEdgesState, useReactFlow, Controls, Background, BackgroundVariant, ConnectionMode, Connection, Handle, Position } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Grid3X3, MousePointer2, Crosshair, ZoomIn, ZoomOut, RotateCcw, RotateCw, Maximize, Layers, Eye, EyeOff, Lock, Unlock, Copy, Trash2, Group, AlignCenter } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProjectWithModules } from "@/types/project";

interface ProjectCanvasProps {
  project: ProjectWithModules;
  selectedNode?: Node | null;
  onSelectionChange?: (node: Node | null) => void;
  showSchematicPreview?: boolean;
}

interface PortData {
  id: string;
  label: string;
  type: 'power' | 'data' | 'analog' | 'digital';
  direction: 'input' | 'output';
  voltage?: string;
  current?: string;
  protocol?: string;
  compatible?: string[];
}

interface EnhancedNodeData {
  label: string;
  category: string;
  status: 'validated' | 'error' | 'processing' | 'warning';
  ports: PortData[];
  moduleId?: string;
  componentId?: string;
  locked?: boolean;
  grouped?: boolean;
  groupId?: string;
  specifications?: Record<string, any>;
}

// Enhanced Custom node component for hardware modules
function HardwareModuleNode({ data, selected }: { data: EnhancedNodeData; selected: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);

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
      case 'analog':
        return '📊';
      case 'digital':
        return '🔢';
      case 'memory':
        return '💾';
      case 'display':
        return '🖥️';
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
        return 'bg-yellow-500 animate-pulse';
      case 'warning':
        return 'bg-orange-500';
      default:
        return 'bg-secondary';
    }
  };

  const getPortColor = (port: PortData) => {
    switch (port.type) {
      case 'power':
        return 'bg-red-500 border-red-600';
      case 'data':
        return 'bg-blue-500 border-blue-600';
      case 'analog':
        return 'bg-green-500 border-green-600';
      case 'digital':
        return 'bg-purple-500 border-purple-600';
      default:
        return 'bg-gray-500 border-gray-600';
    }
  };

  const isPortCompatible = (sourcePort: PortData, targetPort: PortData) => {
    // Basic compatibility rules
    if (sourcePort.type !== targetPort.type) return false;
    if (sourcePort.direction === targetPort.direction) return false;
    if (sourcePort.voltage && targetPort.voltage && sourcePort.voltage !== targetPort.voltage) return false;
    return true;
  };

  return (
    <TooltipProvider>
      <Card 
        className={`relative w-64 transition-all duration-200 ${
          selected ? 'ring-2 ring-primary shadow-lg scale-105' : 'hover:shadow-md'
        } ${
          isHovered ? 'ring-1 ring-primary/50' : ''
        } ${
          data.locked ? 'opacity-75' : ''
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-testid={`canvas-node-${data.moduleId || data.componentId || 'unknown'}`}
      >
        <CardContent className="p-4">
          {/* Node Header */}
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center relative">
              <span className="text-primary text-lg">{getComponentIcon(data.category)}</span>
              {data.locked && (
                <Lock className="absolute -top-1 -right-1 w-3 h-3 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{data.label}</h3>
              <div className="flex items-center space-x-2">
                <Badge variant="outline" className="text-xs">
                  {data.category}
                </Badge>
                {data.grouped && (
                  <Badge variant="secondary" className="text-xs">
                    <Group className="w-2 h-2 mr-1" />
                    Group
                  </Badge>
                )}
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger>
                <div className={`w-4 h-4 rounded-full ${getStatusColor(data.status)} ring-2 ring-background`} />
              </TooltipTrigger>
              <TooltipContent>
                <p className="capitalize">{data.status}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          
          {/* Enhanced Ports */}
          <div className="space-y-2">
            {data.ports?.map((port: PortData, index: number) => (
              <div key={port.id} className="relative">
                <div className="flex justify-between items-center py-1">
                  {port.direction === 'input' && (
                    <Tooltip>
                      <TooltipTrigger>
                        <div className={`w-4 h-4 rounded-full border-2 cursor-pointer transition-all hover:scale-110 ${
                          getPortColor(port)
                        }`}>
                          <Handle
                            type="target"
                            position={Position.Left}
                            id={port.id}
                            className="!w-4 !h-4 !border-2 !rounded-full opacity-0"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <div className="text-xs">
                          <p className="font-medium">{port.label}</p>
                          <p className="text-muted-foreground">{port.type}</p>
                          {port.voltage && <p>Voltage: {port.voltage}</p>}
                          {port.protocol && <p>Protocol: {port.protocol}</p>}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  
                  <div className="flex-1 px-2">
                    <div className="flex items-center justify-center">
                      <span className="text-xs font-medium text-center">{port.label}</span>
                    </div>
                    <div className="flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">
                        {port.type} • {port.voltage || 'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  {port.direction === 'output' && (
                    <Tooltip>
                      <TooltipTrigger>
                        <div className={`w-4 h-4 rounded-full border-2 cursor-pointer transition-all hover:scale-110 ${
                          getPortColor(port)
                        }`}>
                          <Handle
                            type="source"
                            position={Position.Right}
                            id={port.id}
                            className="!w-4 !h-4 !border-2 !rounded-full opacity-0"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <div className="text-xs">
                          <p className="font-medium">{port.label}</p>
                          <p className="text-muted-foreground">{port.type}</p>
                          {port.voltage && <p>Voltage: {port.voltage}</p>}
                          {port.protocol && <p>Protocol: {port.protocol}</p>}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Node Actions (visible on hover/selection) */}
          {(isHovered || selected) && (
            <div className="absolute -top-2 -right-2 flex space-x-1">
              {!data.locked && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-6 h-6 p-0 bg-background"
                      data-testid={`button-copy-${data.moduleId}`}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Duplicate</p>
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-6 h-6 p-0 bg-background text-destructive hover:text-destructive"
                    data-testid={`button-delete-${data.moduleId}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Delete</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

const nodeTypes = {
  hardwareModule: HardwareModuleNode,
};

export default function ProjectCanvas({ project, selectedNode, onSelectionChange, showSchematicPreview = false }: ProjectCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const internalSelectedNode = selectedNode || null;
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [enableSnapping, setEnableSnapping] = useState(true);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [canvasMode, setCanvasMode] = useState<'design' | 'schematic'>('design');
  const [showGrid, setShowGrid] = useState(true);
  const [connectionPreview, setConnectionPreview] = useState<Connection | null>(null);
  const { toast } = useToast();

  // Make WebSocket connection optional to prevent crashes
  let sendMessage: any, lastMessage: any, connectionStatus: any;
  try {
    const webSocketHook = useWebSocket();
    sendMessage = webSocketHook.sendMessage;
    lastMessage = webSocketHook.lastMessage;
    connectionStatus = webSocketHook.connectionStatus;
  } catch (error) {
    console.warn('WebSocket connection failed, continuing without real-time features:', error);
    sendMessage = () => false;
    lastMessage = null;
    connectionStatus = 'Disconnected';
  }

  // Enhanced canvas tools
  const alignNodes = useCallback((alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedNodes.length < 2) {
      toast({
        title: "Alignment requires selection",
        description: "Please select at least 2 nodes to align",
        variant: "destructive",
      });
      return;
    }
    
    const bounds = selectedNodes.reduce((acc, node) => {
      return {
        minX: Math.min(acc.minX, node.position.x),
        maxX: Math.max(acc.maxX, node.position.x + (node.width || 256)),
        minY: Math.min(acc.minY, node.position.y),
        maxY: Math.max(acc.maxY, node.position.y + (node.height || 120)),
      };
    }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    
    const updatedNodes = selectedNodes.map(node => {
      let newPosition = { ...node.position };
      
      switch (alignment) {
        case 'left':
          newPosition.x = bounds.minX;
          break;
        case 'center':
          newPosition.x = (bounds.minX + bounds.maxX) / 2 - (node.width || 256) / 2;
          break;
        case 'right':
          newPosition.x = bounds.maxX - (node.width || 256);
          break;
        case 'top':
          newPosition.y = bounds.minY;
          break;
        case 'middle':
          newPosition.y = (bounds.minY + bounds.maxY) / 2 - (node.height || 120) / 2;
          break;
        case 'bottom':
          newPosition.y = bounds.maxY - (node.height || 120);
          break;
      }
      
      return { ...node, position: newPosition };
    });
    
    setNodes(nodes => nodes.map(node => {
      const updated = updatedNodes.find(n => n.id === node.id);
      return updated || node;
    }));
    
    toast({
      title: "Nodes aligned",
      description: `${selectedNodes.length} nodes aligned to ${alignment}`,
    });
  }, [selectedNodes, setNodes, toast]);
  
  const groupSelectedNodes = useCallback(() => {
    if (selectedNodes.length < 2) {
      toast({
        title: "Grouping requires selection",
        description: "Please select at least 2 nodes to group",
        variant: "destructive",
      });
      return;
    }
    
    const groupId = `group_${Date.now()}`;
    setNodes(nodes => nodes.map(node => {
      if (selectedNodes.some(selected => selected.id === node.id)) {
        return {
          ...node,
          data: {
            ...node.data,
            grouped: true,
            groupId,
          }
        };
      }
      return node;
    }));
    
    toast({
      title: "Nodes grouped",
      description: `${selectedNodes.length} nodes grouped together`,
    });
  }, [selectedNodes, setNodes, toast]);
  
  // Validate connection compatibility
  const isValidConnection = useCallback((connection: Connection) => {
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    
    if (!sourceNode || !targetNode) return false;
    
    const sourcePort = (sourceNode.data as EnhancedNodeData).ports?.find((p: PortData) => p.id === connection.sourceHandle);
    const targetPort = (targetNode.data as EnhancedNodeData).ports?.find((p: PortData) => p.id === connection.targetHandle);
    
    if (!sourcePort || !targetPort) return false;
    
    // Check basic compatibility
    if (sourcePort.type !== targetPort.type) return false;
    if (sourcePort.direction === targetPort.direction) return false;
    if (sourcePort.voltage && targetPort.voltage && sourcePort.voltage !== targetPort.voltage) return false;
    
    return true;
  }, [nodes]);

  // Control functions - React Flow instance state
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  
  // Enhanced connection handling
  const onConnect = useCallback((params: Connection) => {
    if (!isValidConnection(params)) {
      toast({
        title: "Invalid connection",
        description: "These ports are not compatible. Check voltage levels and port types.",
        variant: "destructive",
      });
      return;
    }
    
    const newEdge: Edge = {
      ...params,
      id: `edge_${Date.now()}`,
      type: 'smoothstep',
      animated: params.sourceHandle?.includes('data') || params.targetHandle?.includes('data'),
      style: {
        stroke: params.sourceHandle?.includes('power') ? '#ef4444' : 
                params.sourceHandle?.includes('data') ? '#3b82f6' :
                params.sourceHandle?.includes('analog') ? '#10b981' : '#8b5cf6',
        strokeWidth: 3,
      },
      markerEnd: {
        type: 'arrowclosed',
        color: params.sourceHandle?.includes('power') ? '#ef4444' : 
               params.sourceHandle?.includes('data') ? '#3b82f6' :
               params.sourceHandle?.includes('analog') ? '#10b981' : '#8b5cf6',
      },
    };
    
    setEdges((eds) => addEdge(newEdge, eds));
    
    // Persist to database
    createConnectionMutation.mutate(params);
    
    // Broadcast the connection to other users (only if WebSocket is available)
    try {
      sendMessage({
        type: 'canvas_update',
        action: 'connection_created',
        data: params,
        projectId: project.id,
      });
    } catch (e) {
      console.warn('Failed to broadcast connection update:', e);
    }
    
    toast({
      title: "Connection created",
      description: "Components successfully connected",
    });
  }, [setEdges, isValidConnection, toast, createConnectionMutation, sendMessage, project.id]);

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
            { id: 'gpio0', label: 'GPIO0', type: 'digital', direction: 'output', voltage: '3.3V', protocol: 'GPIO' },
            { id: 'gpio2', label: 'GPIO2', type: 'digital', direction: 'input', voltage: '3.3V', protocol: 'GPIO' },
            { id: 'sda', label: 'SDA', type: 'data', direction: 'output', voltage: '3.3V', protocol: 'I2C' },
            { id: 'scl', label: 'SCL', type: 'data', direction: 'output', voltage: '3.3V', protocol: 'I2C' },
            { id: '3v3', label: '3.3V', type: 'power', direction: 'output', voltage: '3.3V', current: '800mA' },
            { id: 'gnd', label: 'GND', type: 'power', direction: 'output', voltage: '0V' },
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
    if (project.connections && project.modules) {
      // Create a mapping from database module.id to module.nodeId for edge rendering
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
          stroke: connection.connectionType === 'power' ? '#ef4444' : '#00bfff',
          strokeWidth: 2,
        },
        animated: connection.connectionType === 'data',
      }));
      setEdges(flowEdges);
    }
  }, [project.connections, project.modules, setEdges]);

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

  const updateModulePositionMutation = useMutation({
    mutationFn: async ({ moduleId, position }: { moduleId: string; position: { x: number; y: number } }) => {
      const response = await apiRequest("PUT", `/api/projects/${project.id}/modules/${moduleId}`, {
        position,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
    },
  });


  // Remove custom drag snapping to avoid redundancy with React Flow's built-in snapping

  const onNodeDragStop = useCallback(
    (event: any, node: Node) => {
      // Persist position to database
      if (node.data.moduleId && typeof node.data.moduleId === 'string') {
        updateModulePositionMutation.mutate({
          moduleId: node.data.moduleId,
          position: node.position,
        });
      }

      // Broadcast the final position to other users (only if WebSocket is available)
      try {
        sendMessage({
          type: 'canvas_update',
          action: 'node_moved',
          data: { nodeId: node.id, position: node.position },
          projectId: project.id,
        });
      } catch (e) {
        console.warn('Failed to broadcast node position update:', e);
      }
    },
    [updateModulePositionMutation, sendMessage, project.id]
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      const newSelection = selectedNodes[0] || null;
      setSelectedNodes(selectedNodes);
      onSelectionChange?.(newSelection);
    },
    [onSelectionChange]
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
            { id: 'gpio0', label: 'GPIO0', type: 'digital', direction: 'output', voltage: '3.3V', protocol: 'GPIO' },
            { id: 'gpio2', label: 'GPIO2', type: 'digital', direction: 'input', voltage: '3.3V', protocol: 'GPIO' },
            { id: 'sda', label: 'SDA', type: 'data', direction: 'output', voltage: '3.3V', protocol: 'I2C' },
            { id: 'scl', label: 'SCL', type: 'data', direction: 'output', voltage: '3.3V', protocol: 'I2C' },
            { id: '3v3', label: '3.3V', type: 'power', direction: 'output', voltage: '3.3V', current: '800mA' },
            { id: 'gnd', label: 'GND', type: 'power', direction: 'output', voltage: '0V' },
          ],
          moduleId: newNodeId, // Will be updated after creation
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
        onSelectionChange={handleSelectionChange}
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
              {internalSelectedNode 
                ? `Node: (${internalSelectedNode.position.x.toFixed(0)}, ${internalSelectedNode.position.y.toFixed(0)})`
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
