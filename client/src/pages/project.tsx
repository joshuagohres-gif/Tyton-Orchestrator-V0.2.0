import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Node } from "@xyflow/react";
import { Skeleton } from "@/components/ui/skeleton";
import ProjectCanvasSimple from "@/components/ProjectCanvasSimple";
import ComponentLibrary from "@/components/ComponentLibrary";
import PropertiesPanel from "@/components/PropertiesPanel";
import FloatingOrchestrationStatus from "@/components/FloatingOrchestrationStatus";
import AppHeader from "@/components/AppHeader";
import Design3DViewer from "@/components/Design3DViewer";
import SchematicDiagram from "@/components/SchematicDiagram";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Microchip, Save, Download, Settings, Users, Cpu, Box, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectWithModules } from "@/types/project";

export default function Project() {
  const { id } = useParams<{ id: string }>();
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [activeTab, setActiveTab] = useState<string>("canvas");

  const { data: project, isLoading, error } = useQuery<ProjectWithModules>({
    queryKey: ["/api/projects", id],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col overflow-hidden starry-bg">
        <AppHeader>
          <div className="flex items-center space-x-3">
            <Skeleton className="w-20 h-8 bg-muted" />
            <Skeleton className="w-20 h-8 bg-muted" />
          </div>
        </AppHeader>
        <div className="flex-1 flex">
          <Skeleton className="w-80 h-full bg-muted" />
          <Skeleton className="flex-1 h-full bg-muted" />
          <Skeleton className="w-96 h-full bg-muted" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="h-screen flex items-center justify-center starry-bg">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Project Not Found</h1>
          <p className="text-muted-foreground">The project you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden starry-bg">
      {/* Top Navigation Bar */}
      <AppHeader>
        <div className="flex items-center space-x-4">
          <div className="h-6 w-px bg-border"></div>
          <span className="text-sm text-muted-foreground" data-testid="text-project-title">
            {project.title}
          </span>
          
          <div className="flex items-center space-x-3 ml-auto">
            {/* Real-time Collaboration Indicators */}
            <div className="flex items-center space-x-2">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-medium border-2 border-background">
                  JD
                </div>
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-medium text-primary-foreground border-2 border-background">
                  SA
                </div>
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium border-2 border-background">
                  +2
                </div>
              </div>
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse-gold"></div>
              <span className="text-xs text-muted-foreground" data-testid="text-collaboration-status">4 active</span>
            </div>
            
            <div className="h-6 w-px bg-border"></div>
            
            {/* Project Actions */}
            <Button 
              variant="secondary" 
              size="sm"
              className="bg-secondary hover:bg-secondary/80"
              data-testid="button-save-project"
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button 
              className="bg-primary hover:bg-primary/90 text-primary-foreground glow-gold"
              size="sm"
              data-testid="button-export-project"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              className="hover:bg-secondary"
              data-testid="button-project-settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </AppHeader>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          {/* Tab Navigation */}
          <div className="border-b border-border bg-card px-4">
            <TabsList className="h-12 bg-transparent p-0">
              <TabsTrigger 
                value="canvas" 
                className="h-12 px-6 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none"
                data-testid="tab-canvas"
              >
                <Cpu className="w-4 h-4 mr-2" />
                Canvas
              </TabsTrigger>
              <TabsTrigger 
                value="3d-design" 
                className="h-12 px-6 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none"
                data-testid="tab-3d-design"
              >
                <Box className="w-4 h-4 mr-2" />
                3D Design
              </TabsTrigger>
              <TabsTrigger 
                value="schematic" 
                className="h-12 px-6 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none"
                data-testid="tab-schematic"
              >
                <FileText className="w-4 h-4 mr-2" />
                Schematic
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Canvas Tab */}
          <TabsContent value="canvas" className="flex-1 flex overflow-hidden m-0">
            {/* Left Sidebar - Component Library */}
            <ComponentLibrary />

            {/* Main Canvas Area with Error Boundary */}
            <div className="flex-1 flex flex-col" data-testid="canvas-root">
              <div className="w-full h-full bg-background border-r">
                <ProjectCanvasSimple 
                  project={project} 
                  selectedNode={selectedNode}
                  onSelectionChange={setSelectedNode}
                />
              </div>
            </div>

            {/* Right Sidebar - Properties & Orchestration */}
            <PropertiesPanel 
              project={project} 
              selectedNode={selectedNode}
            />
          </TabsContent>

          {/* 3D Design Tab */}
          <TabsContent value="3d-design" className="flex-1 overflow-hidden m-0">
            <Design3DViewer project={project} />
          </TabsContent>

          {/* Schematic Tab */}
          <TabsContent value="schematic" className="flex-1 overflow-hidden m-0 flex">
            <div className="flex-1 bg-background">
              <SchematicDiagram project={project} />
            </div>
            <PropertiesPanel project={project} selectedNode={selectedNode} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Floating Orchestration Status */}
      <FloatingOrchestrationStatus project={project} />
    </div>
  );
}
