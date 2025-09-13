import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import ProjectCanvas from "@/components/ProjectCanvas";
import ComponentLibrary from "@/components/ComponentLibrary";
import PropertiesPanel from "@/components/PropertiesPanel";
import FloatingOrchestrationStatus from "@/components/FloatingOrchestrationStatus";
import { Microchip, Save, Download, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Project() {
  const { id } = useParams<{ id: string }>();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ["/api/projects", id],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col overflow-hidden starry-bg">
        <header className="bg-card border-b border-border px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Skeleton className="w-8 h-8 bg-muted" />
              <Skeleton className="w-48 h-6 bg-muted" />
            </div>
            <div className="flex items-center space-x-3">
              <Skeleton className="w-20 h-8 bg-muted" />
              <Skeleton className="w-20 h-8 bg-muted" />
            </div>
          </div>
        </header>
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
      <header className="bg-card border-b border-border px-6 py-3 flex items-center justify-between relative z-50">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Microchip className="text-primary-foreground text-sm" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Tyton Orchestrator</h1>
          </div>
          <div className="h-6 w-px bg-border"></div>
          <span className="text-sm text-muted-foreground" data-testid="text-project-title">
            {project.title}
          </span>
        </div>
        
        <div className="flex items-center space-x-3">
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
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Component Library */}
        <ComponentLibrary />

        {/* Main Canvas Area */}
        <ProjectCanvas project={project} />

        {/* Right Sidebar - Properties & Orchestration */}
        <PropertiesPanel project={project} />
      </div>

      {/* Floating Orchestration Status */}
      <FloatingOrchestrationStatus project={project} />
    </div>
  );
}
