import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, FileText, Settings, Play, Trash2, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import PipelineBuilder from "@/components/PipelineBuilder";
import PipelineVisualization from "@/components/PipelineVisualization";
import PipelineLibrary from "@/components/PipelineLibrary";
import type { PipelineTemplateWithStages, PipelineMetadata, StageRetryPolicy } from "@shared/schema";

export default function PipelineManager() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("library");
  const [selectedTemplate, setSelectedTemplate] = useState<PipelineTemplateWithStages | undefined>(undefined);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<PipelineTemplateWithStages | undefined>(undefined);

  // Fetch pipeline templates
  const { data: templates = [], isLoading } = useQuery<PipelineTemplateWithStages[]>({
    queryKey: ["/api/pipeline-templates"],
    // Mock data for now since backend endpoints aren't implemented yet
    queryFn: async () => {
      // Return mock templates for demonstration
      return [
        {
          id: "1",
          name: "Standard Hardware Design",
          description: "Complete hardware design pipeline from concept to manufacturing",
          category: "hardware_design",
          version: "1.0.0",
          isPublic: true,
          userId: "demo-user",
          metadata: {
            tags: ["hardware", "pcb", "design"],
            difficulty: "intermediate" as const,
            estimatedTime: 180,
          } as PipelineMetadata,
          stageDefinitions: [
            {
              id: "stage-1",
              templateId: "1",
              name: "requirements_analysis",
              displayName: "Requirements Analysis",
              description: "Analyze project requirements and constraints",
              category: "ai_generation",
              order: 0,
              isOptional: false,
              isParallel: false,
              estimatedDuration: 1800,
              dependencies: [],
              configuration: {},
              inputSchema: {},
              outputSchema: {},
              retryPolicy: { maxAttempts: 3, backoffStrategy: "exponential", baseDelay: 2000 },
              createdAt: new Date(),
            },
            {
              id: "stage-2", 
              templateId: "1",
              name: "circuit_design",
              displayName: "Circuit Design",
              description: "Generate circuit schematic using AI",
              category: "ai_generation",
              order: 1,
              isOptional: false,
              isParallel: false,
              estimatedDuration: 3600,
              dependencies: ["requirements_analysis"],
              configuration: {},
              inputSchema: {},
              outputSchema: {},
              retryPolicy: { maxAttempts: 3, backoffStrategy: "exponential", baseDelay: 2000 },
              createdAt: new Date(),
            },
            {
              id: "stage-3",
              templateId: "1", 
              name: "validation",
              displayName: "Design Validation",
              description: "Validate circuit design for errors and compliance",
              category: "validation",
              order: 2,
              isOptional: false,
              isParallel: false,
              estimatedDuration: 1200,
              dependencies: ["circuit_design"],
              configuration: {},
              inputSchema: {},
              outputSchema: {},
              retryPolicy: { maxAttempts: 2, backoffStrategy: "linear", baseDelay: 1000 },
              createdAt: new Date(),
            }
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "2",
          name: "Quick Prototype Pipeline", 
          description: "Fast prototyping workflow for rapid iteration",
          category: "custom",
          version: "1.2.0",
          isPublic: true,
          userId: "demo-user",
          metadata: {
            tags: ["prototype", "rapid", "iteration"],
            difficulty: "beginner" as const,
            estimatedTime: 60,
          } as PipelineMetadata,
          stageDefinitions: [
            {
              id: "stage-4",
              templateId: "2",
              name: "quick_design",
              displayName: "Quick Design",
              description: "Rapid circuit generation for prototyping",
              category: "ai_generation",
              order: 0,
              isOptional: false,
              isParallel: false,
              estimatedDuration: 900,
              dependencies: [],
              configuration: {},
              inputSchema: {},
              outputSchema: {},
              retryPolicy: { maxAttempts: 2, backoffStrategy: "linear", baseDelay: 1000 },
              createdAt: new Date(),
            },
            {
              id: "stage-5",
              templateId: "2",
              name: "quick_export",
              displayName: "Quick Export",
              description: "Export basic design files for prototyping",
              category: "export",
              order: 1,
              isOptional: true,
              isParallel: false,
              estimatedDuration: 600,
              dependencies: ["quick_design"],
              configuration: {},
              inputSchema: {},
              outputSchema: {},
              retryPolicy: { maxAttempts: 5, backoffStrategy: "exponential", baseDelay: 1000 },
              createdAt: new Date(),
            }
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ] as PipelineTemplateWithStages[];
    },
  });

  // Save pipeline template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (templateData: Partial<PipelineTemplateWithStages>) => {
      // Mock save - would call actual API
      const response = await apiRequest("POST", "/api/pipeline-templates", templateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-templates"] });
      setIsBuilderOpen(false);
      toast({
        title: "Pipeline saved",
        description: "Your pipeline template has been saved successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Save failed", 
        description: "Failed to save pipeline template. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await apiRequest("DELETE", `/api/pipeline-templates/${templateId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-templates"] });
      toast({
        title: "Pipeline deleted",
        description: "The pipeline template has been deleted.",
      });
    },
  });

  // Run pipeline mutation
  const runPipelineMutation = useMutation({
    mutationFn: async (templateId: string) => {
      // Mock pipeline execution - would create orchestration run
      const response = await apiRequest("POST", `/api/pipeline-templates/${templateId}/run`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Pipeline started",
        description: "Pipeline execution has been initiated.",
      });
    },
  });

  const handleCreateNew = () => {
    setSelectedTemplate(undefined);
    setIsBuilderOpen(true);
  };

  const handleEditTemplate = (template: PipelineTemplateWithStages) => {
    setSelectedTemplate(template);
    setIsBuilderOpen(true);
  };

  const handlePreviewTemplate = (template: PipelineTemplateWithStages) => {
    setPreviewTemplate(template);
    setIsPreviewOpen(true);
  };

  const handleSaveTemplate = (templateData: Partial<PipelineTemplateWithStages>) => {
    saveTemplateMutation.mutate(templateData);
  };

  const handleDeleteTemplate = (templateId: string) => {
    deleteTemplateMutation.mutate(templateId);
  };

  const handleRunTemplate = (templateId: string) => {
    runPipelineMutation.mutate(templateId);
  };

  const handleCloneTemplate = (template: PipelineTemplateWithStages) => {
    const clonedTemplate: PipelineTemplateWithStages = {
      ...template,
      id: `${template.id}-copy`,
      name: `${template.name} (Copy)`,
      version: "1.0.0",
      isPublic: false,
    };
    setSelectedTemplate(clonedTemplate);
    setIsBuilderOpen(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="pipeline-manager">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pipeline Manager</h1>
          <p className="text-muted-foreground">
            Create, manage, and execute hardware design pipelines
          </p>
        </div>
        <Button onClick={handleCreateNew} data-testid="button-create-pipeline">
          <Plus className="w-4 h-4 mr-2" />
          Create Pipeline
        </Button>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="library" data-testid="tab-library">
            Pipeline Library
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">
            My Templates
          </TabsTrigger>
          <TabsTrigger value="runs" data-testid="tab-runs">
            Execution History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-6">
          <PipelineLibrary
            templates={templates.filter(t => t.isPublic) as any}
            onTemplateSelect={handlePreviewTemplate as any}
            onTemplateCreate={handleCreateNew}
          />
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.filter(t => !t.isPublic || t.userId === "demo-user").map((template) => (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {template.description}
                      </CardDescription>
                    </div>
                    <Badge variant="outline">{template.version}</Badge>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>{template.stageDefinitions?.length || 0} stages</span>
                      <span>~{(template.metadata as PipelineMetadata)?.estimatedTime || 0}m</span>
                      {(template.metadata as PipelineMetadata)?.difficulty && (
                        <Badge variant="secondary" className="text-xs">
                          {(template.metadata as PipelineMetadata).difficulty}
                        </Badge>
                      )}
                    </div>
                    
                    {(template.metadata as PipelineMetadata)?.tags && (
                      <div className="flex flex-wrap gap-1">
                        {(template.metadata as PipelineMetadata).tags!.slice(0, 3).map((tag: string) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePreviewTemplate(template)}
                        data-testid={`button-preview-${template.id}`}
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleRunTemplate(template.id)}
                        disabled={runPipelineMutation.isPending}
                        data-testid={`button-run-${template.id}`}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Run
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditTemplate(template)}
                        data-testid={`button-edit-${template.id}`}
                      >
                        <Settings className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCloneTemplate(template)}
                        data-testid={`button-clone-${template.id}`}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-delete-${template.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {templates.filter(t => !t.isPublic).length === 0 && (
              <Card className="border-dashed border-2 flex items-center justify-center p-8 col-span-full">
                <div className="text-center">
                  <h3 className="text-lg font-medium mb-2">No custom templates</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first custom pipeline template
                  </p>
                  <Button onClick={handleCreateNew} variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Template
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="runs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Execution History</CardTitle>
              <CardDescription>
                View and manage your pipeline execution runs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <div className="text-lg mb-2">No execution history</div>
                <p className="text-sm">Run a pipeline to see execution history here.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Pipeline Builder Dialog */}
      <Dialog open={isBuilderOpen} onOpenChange={setIsBuilderOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTemplate ? 'Edit Pipeline' : 'Create New Pipeline'}
            </DialogTitle>
          </DialogHeader>
          <PipelineBuilder
            template={selectedTemplate}
            onSave={handleSaveTemplate}
            onPreview={handlePreviewTemplate}
            isLoading={saveTemplateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Pipeline Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pipeline Preview</DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <PipelineVisualization
              template={previewTemplate as any}
              showDependencies={true}
              showMetrics={false}
              onStageClick={(stage) => {
                toast({
                  title: stage.displayName,
                  description: stage.description || "No description available",
                });
              }}
              onPipelineAction={(action) => {
                if (action === 'start') {
                  setIsPreviewOpen(false);
                  handleRunTemplate(previewTemplate.id);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}