import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Microchip, Plus, Clock, User, Trash2 } from "lucide-react";
import type { Project } from "@shared/schema";

export default function Home() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string }) => {
      const response = await apiRequest("POST", "/api/projects", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setIsCreateDialogOpen(false);
      setTitle("");
      setDescription("");
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await apiRequest("DELETE", `/api/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDeleteConfirmOpen(false);
      setProjectToDelete(null);
    },
  });

  const handleCreateProject = () => {
    if (!title.trim()) return;
    createProjectMutation.mutate({ title, description });
  };

  const handleDeleteClick = (projectId: string) => {
    setProjectToDelete(projectId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (projectToDelete) {
      deleteProjectMutation.mutate(projectToDelete);
    }
  };

  return (
    <div className="min-h-screen starry-bg">
      {/* Background Depth Layer */}
      <div className="nebula-layer"></div>
      
      {/* Astronomical Constellation System */}
      <div className="constellation-container">
        {/* Ursa Major (Big Dipper) Stars */}
        <div className="constellation-star dubhe"></div>
        <div className="constellation-star merak"></div>
        <div className="constellation-star phecda"></div>
        <div className="constellation-star megrez"></div>
        <div className="constellation-star alioth"></div>
        <div className="constellation-star mizar"></div>
        <div className="constellation-star alkaid"></div>
        
        {/* Orion Stars */}
        <div className="constellation-star betelgeuse"></div>
        <div className="constellation-star rigel"></div>
        <div className="constellation-star bellatrix"></div>
        <div className="constellation-star mintaka"></div>
        <div className="constellation-star alnilam"></div>
        <div className="constellation-star alnitak"></div>
        <div className="constellation-star saiph"></div>
        
        {/* Cassiopeia Stars */}
        <div className="constellation-star schedar"></div>
        <div className="constellation-star caph"></div>
        <div className="constellation-star navi"></div>
        <div className="constellation-star ruchbah"></div>
        <div className="constellation-star segin"></div>
        
        {/* Constellation Lines - 4 Second Tracing */}
        {/* Ursa Major Lines */}
        <div className="constellation-line line-dubhe-merak"></div>
        <div className="constellation-line line-merak-phecda"></div>
        <div className="constellation-line line-phecda-megrez"></div>
        <div className="constellation-line line-megrez-alioth"></div>
        <div className="constellation-line line-alioth-mizar"></div>
        <div className="constellation-line line-mizar-alkaid"></div>
        <div className="constellation-line line-megrez-dubhe"></div>
        
        {/* Orion Lines */}
        <div className="constellation-line line-betelgeuse-bellatrix"></div>
        <div className="constellation-line line-bellatrix-mintaka"></div>
        <div className="constellation-line line-mintaka-alnilam"></div>
        <div className="constellation-line line-alnilam-alnitak"></div>
        <div className="constellation-line line-alnitak-saiph"></div>
        <div className="constellation-line line-saiph-rigel"></div>
        <div className="constellation-line line-rigel-alnilam"></div>
        
        {/* Cassiopeia Lines */}
        <div className="constellation-line line-schedar-caph"></div>
        <div className="constellation-line line-caph-navi"></div>
        <div className="constellation-line line-navi-ruchbah"></div>
        <div className="constellation-line line-ruchbah-segin"></div>
      </div>
      
      {/* Physics-Based Shooting Stars */}
      <div className="shooting-star shooting-star-1"></div>
      <div className="shooting-star shooting-star-2"></div>
      <div className="shooting-star shooting-star-3"></div>
      
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Microchip className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Tyton Orchestrator</h1>
              <p className="text-sm text-muted-foreground">AI-Powered Hardware Design Platform</p>
            </div>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground glow-gold" data-testid="button-create-project">
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Create New Project</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Start a new hardware design project with AI assistance.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title" className="text-foreground">Project Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Smart Home Sensor Network"
                    className="bg-input border-border text-foreground"
                    data-testid="input-project-title"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description" className="text-foreground">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your hardware project..."
                    className="bg-input border-border text-foreground resize-none"
                    rows={3}
                    data-testid="input-project-description"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateProject}
                  disabled={!title.trim() || createProjectMutation.isPending}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  data-testid="button-create-confirm"
                >
                  {createProjectMutation.isPending ? "Creating..." : "Create Project"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete Project</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you would like to delete? This action cannot be undone and will permanently remove the project and all its data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="mr-2"
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteProjectMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteProjectMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">Your Projects</h2>
          <p className="text-muted-foreground">Design and orchestrate hardware projects with AI assistance</p>
        </div>

        {/* Projects Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="bg-card border-border">
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 bg-muted" />
                  <Skeleton className="h-4 w-full bg-muted" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full bg-muted" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-9 w-full bg-muted" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Card key={project.id} className="bg-card border-border hover:border-primary/50 transition-all group">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center justify-between">
                    <span className="truncate">{project.title}</span>
                    <div className={`w-3 h-3 rounded-full ${
                      project.status === 'active' ? 'bg-green-500' :
                      project.status === 'completed' ? 'bg-primary' :
                      project.status === 'archived' ? 'bg-muted-foreground' :
                      'bg-secondary'
                    }`} />
                  </CardTitle>
                  <CardDescription className="text-muted-foreground line-clamp-2">
                    {project.description || "No description provided"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Clock className="w-4 h-4 mr-2" />
                      <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <User className="w-4 h-4 mr-2" />
                      <span>LLM Budget: {project.llmBudget - project.llmSpent} tokens left</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Link href={`/projects/${project.id}`} className="flex-1">
                    <Button 
                      className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all"
                      data-testid={`button-open-project-${project.id}`}
                    >
                      Open Project
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDeleteClick(project.id)}
                    className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    data-testid={`button-delete-project-${project.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
              <Microchip className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No Projects Yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Create your first hardware design project and let AI help you build amazing circuits.
            </p>
            <Button 
              onClick={() => setIsCreateDialogOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground glow-gold"
              data-testid="button-create-first-project"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Project
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
