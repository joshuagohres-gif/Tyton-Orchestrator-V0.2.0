import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { PinInspector } from "./PinInspector";
import { nodeTypes, DesignModuleData } from "./DesignModuleNode";
import { Cable, Loader2, Trash2 } from "lucide-react";

interface HardwareDesignCanvasProps {
  projectId: string;
}

export function HardwareDesignCanvas({ projectId }: HardwareDesignCanvasProps) {
  const queryClient = useQueryClient();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedModule, setSelectedModule] = useState<{ id: string; name: string; pins: any[] } | null>(null);

  // Fetch modules
  const { data: modules, isLoading: modulesLoading } = useQuery({
    queryKey: ["hardware-design-modules", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/hardware-design/modules`, {
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch modules");
      return response.json();
    }
  });

  // Fetch connections
  const { data: connections, isLoading: connectionsLoading } = useQuery({
    queryKey: ["hardware-design-connections", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/hardware-design/connections`, {
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch connections");
      return response.json();
    }
  });

  // Generate wiring mutation
  const generateWiringMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/hardware-design/wiring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to generate wiring");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hardware-design-connections", projectId] });
    }
  });

  // Delete connection mutation
  const deleteConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await fetch(
        `/api/projects/${projectId}/hardware-design/connections/${connectionId}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );
      if (!response.ok) throw new Error("Failed to delete connection");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hardware-design-connections", projectId] });
    }
  });

  // Create manual connection mutation
  const createConnectionMutation = useMutation({
    mutationFn: async ({ fromPinId, toPinId, kind }: { fromPinId: string; toPinId: string; kind: string }) => {
      const response = await fetch(`/api/projects/${projectId}/hardware-design/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fromPinId,
          toPinId,
          kind,
          netName: `NET_${Date.now()}`,
          notes: "Manual connection"
        })
      });
      if (!response.ok) throw new Error("Failed to create connection");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hardware-design-connections", projectId] });
    }
  });

  // Convert modules to React Flow nodes
  useEffect(() => {
    if (modules && Array.isArray(modules)) {
      const flowNodes: Node<DesignModuleData>[] = modules.map((module: any) => ({
        id: module.id,
        type: "designModule",
        position: module.position || { x: Math.random() * 400, y: Math.random() * 400 },
        data: {
          id: module.id,
          componentName: module.componentName,
          type: module.type,
          voltage: module.voltage,
          maxCurrent: module.maxCurrent,
          wifi: module.wifi,
          bluetooth: module.bluetooth,
          isMotorOrServo: module.isMotorOrServo,
          pins: module.pins || []
        }
      }));
      setNodes(flowNodes);
    }
  }, [modules, setNodes]);

  // Convert connections to React Flow edges
  useEffect(() => {
    if (connections && Array.isArray(connections) && modules && Array.isArray(modules)) {
      const flowEdges: Edge[] = connections.map((conn: any) => {
        // Find the modules that own these pins
        const fromModule = modules.find((m: any) => 
          m.pins?.some((p: any) => p.id === conn.fromPinId)
        );
        const toModule = modules.find((m: any) => 
          m.pins?.some((p: any) => p.id === conn.toPinId)
        );

        const fromPin = fromModule?.pins?.find((p: any) => p.id === conn.fromPinId);
        const toPin = toModule?.pins?.find((p: any) => p.id === conn.toPinId);

        const getEdgeColor = (kind: string) => {
          switch (kind) {
            case "power": return "#ef4444";
            case "ground": return "#000000";
            case "signal": return "#3b82f6";
            case "bus": return "#10b981";
            default: return "#6b7280";
          }
        };

        return {
          id: conn.id,
          source: fromModule?.id,
          target: toModule?.id,
          sourceHandle: `${conn.fromPinId}-source`,
          targetHandle: `${conn.toPinId}-target`,
          label: conn.netName || conn.kind,
          type: "default",
          animated: conn.kind === "power",
          style: {
            stroke: getEdgeColor(conn.kind),
            strokeWidth: conn.kind === "power" ? 3 : 2
          },
          data: {
            connectionId: conn.id,
            kind: conn.kind,
            notes: conn.notes
          }
        };
      }).filter((edge: Edge) => edge.source && edge.target);

      setEdges(flowEdges);
    }
  }, [connections, modules, setEdges]);

  // Handle node click for pin inspection
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node<DesignModuleData>) => {
    setSelectedModule({
      id: node.id,
      name: node.data.componentName,
      pins: node.data.pins
    });
  }, []);

  // Handle edge click for deletion option
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    if (confirm("Delete this connection?")) {
      const connectionId = edge.data?.connectionId;
      if (connectionId) {
        deleteConnectionMutation.mutate(connectionId);
      }
    }
  }, [deleteConnectionMutation]);

  // Handle manual connection creation
  const onConnect = useCallback((connection: Connection) => {
    // Extract pin IDs from handles
    const fromPinId = connection.sourceHandle?.replace("-source", "");
    const toPinId = connection.targetHandle?.replace("-target", "");

    if (fromPinId && toPinId) {
      // Determine connection kind based on pin types
      // This is simplified - in production, would analyze pin types
      const kind = "signal"; 
      
      createConnectionMutation.mutate({ fromPinId, toPinId, kind });
    }
  }, [createConnectionMutation]);

  if (modulesLoading || connectionsLoading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!modules || modules.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No modules found. Complete the Hardware Design Wizard to create modules.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex gap-4 h-[600px]">
      <div className="flex-1 border rounded-lg overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls />
          <Panel position="top-right" className="space-x-2">
            <Button
              size="sm"
              onClick={() => generateWiringMutation.mutate()}
              disabled={generateWiringMutation.isPending}
            >
              {generateWiringMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Cable className="h-4 w-4 mr-2" />
              )}
              Generate Wiring
            </Button>
          </Panel>
          <Panel position="bottom-right">
            <div className="bg-background/95 backdrop-blur p-3 rounded-lg space-y-2 text-xs">
              <div className="font-semibold">Connection Types:</div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-red-500"></div>
                <span>Power</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-black"></div>
                <span>Ground</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-blue-500"></div>
                <span>Signal</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-green-500"></div>
                <span>Bus</span>
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {selectedModule && (
        <div className="w-96">
          <PinInspector
            projectId={projectId}
            moduleId={selectedModule.id}
            moduleName={selectedModule.name}
            pins={selectedModule.pins}
            onClose={() => setSelectedModule(null)}
          />
        </div>
      )}
    </div>
  );
}
