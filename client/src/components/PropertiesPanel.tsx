import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OrchestrationPanel from "./OrchestrationPanel";
import SchematicDiagram from "./SchematicDiagram";
import { OrchestrationProvider } from "@/providers/OrchestrationProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Play, FileText, MousePointer2, Layers3, Info } from "lucide-react";
import type { ProjectWithModules } from "@/types/project";
import { Node } from "@xyflow/react";

interface PropertiesPanelProps {
  project: ProjectWithModules;
  selectedNode?: Node | null;
}

export default function PropertiesPanel({ project, selectedNode }: PropertiesPanelProps) {
  const [selectedTab, setSelectedTab] = useState("properties");

  return (
    <aside className="w-96 bg-card border-l border-border flex flex-col" data-testid="properties-panel">
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex flex-col h-full">
        {/* Tabs Navigation */}
        <div className="border-b border-border">
          <TabsList className="grid w-full grid-cols-3 bg-transparent p-0 h-auto">
            <TabsTrigger 
              value="properties" 
              className="px-4 py-3 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none"
              data-testid="tab-properties"
            >
              <Settings className="w-4 h-4 mr-2" />
              Properties
            </TabsTrigger>
            <TabsTrigger 
              value="orchestration" 
              className="px-4 py-3 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none"
              data-testid="tab-orchestration"
            >
              <Play className="w-4 h-4 mr-2" />
              Orchestration
            </TabsTrigger>
            <TabsTrigger 
              value="schematic" 
              className="px-4 py-3 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none"
              data-testid="tab-schematic"
            >
              <FileText className="w-4 h-4 mr-2" />
              Schematic
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Properties Tab Content */}
        <TabsContent value="properties" className="flex-1 overflow-y-auto m-0 p-4 space-y-4">
          {selectedNode ? (
            // Component Selected State
            <>
              <div>
                <h3 className="text-sm font-medium mb-2 text-foreground">Selected Component</h3>
                <div className="p-3 bg-secondary rounded-lg border border-border">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                      <span className="text-primary text-sm">
                        {selectedNode.data?.category === 'microcontroller' ? '🔧' :
                         selectedNode.data?.category === 'sensor' ? '📡' :
                         selectedNode.data?.category === 'communication' ? '📶' :
                         selectedNode.data?.category === 'power' ? '⚡' : '🔌'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{String(selectedNode.data?.label || 'Unknown Component')}</p>
                      <p className="text-xs text-muted-foreground">{String(selectedNode.data?.category || 'Unknown Category')}</p>
                    </div>
                    <div className={`w-3 h-3 rounded-full ml-auto ${
                      selectedNode.data?.status === 'validated' ? 'bg-green-500' :
                      selectedNode.data?.status === 'error' ? 'bg-red-500' :
                      selectedNode.data?.status === 'processing' ? 'bg-yellow-500 animate-pulse' :
                      'bg-secondary'
                    }`} title={String(selectedNode.data?.status || 'Unknown')} />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2 text-foreground">Configuration</h4>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="component-label" className="text-xs text-muted-foreground">
                      Component Label
                    </Label>
                    <Input
                      id="component-label"
                      value={String(selectedNode.data?.label || '')}
                      className="mt-1 bg-input border-border text-foreground"
                      data-testid="input-component-label"
                      placeholder="Enter component label"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Position</Label>
                    <div className="flex space-x-2 mt-1">
                      <Input
                        value={`${selectedNode.position.x.toFixed(0)}`}
                        readOnly
                        className="bg-secondary border-border text-muted-foreground"
                        data-testid="input-position-x"
                      />
                      <Input
                        value={`${selectedNode.position.y.toFixed(0)}`}
                        readOnly
                        className="bg-secondary border-border text-muted-foreground"
                        data-testid="input-position-y"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {selectedNode.data?.ports && Array.isArray(selectedNode.data.ports) && selectedNode.data.ports.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 text-foreground">Ports</h4>
                  <div className="space-y-2">
                    {selectedNode.data.ports.map((port: any) => (
                      <div key={port.id} className="flex items-center justify-between p-2 bg-secondary rounded border border-border">
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${
                            port.type === 'power' ? 'bg-red-500' :
                            port.type === 'data' ? 'bg-blue-500' :
                            'bg-gray-500'
                          }`} />
                          <span className="text-sm text-foreground">{port.label}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{port.direction}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            // Empty State - No Component Selected
            <div className="flex flex-col items-center justify-center h-full py-8" data-testid="properties-empty-state">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto">
                  <MousePointer2 className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">No Component Selected</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Click on any component in the canvas to view its properties and configure its settings.
                  </p>
                </div>
                <div className="space-y-3 text-left bg-muted/30 rounded-lg p-4 max-w-sm">
                  <div className="flex items-center space-x-2 text-sm">
                    <Layers3 className="w-4 h-4 text-primary" />
                    <span className="text-foreground">Drag components from the left panel</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <MousePointer2 className="w-4 h-4 text-primary" />
                    <span className="text-foreground">Click to select and configure</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <Info className="w-4 h-4 text-primary" />
                    <span className="text-foreground">View ports, settings, and more</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Orchestration Tab Content */}
        <TabsContent value="orchestration" className="flex-1 overflow-y-auto m-0">
          <OrchestrationProvider projectId={project.id}>
            <OrchestrationPanel project={project} />
          </OrchestrationProvider>
        </TabsContent>

        {/* Schematic Tab Content */}
        <TabsContent value="schematic" className="flex-1 overflow-y-auto m-0">
          <SchematicDiagram project={project} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
