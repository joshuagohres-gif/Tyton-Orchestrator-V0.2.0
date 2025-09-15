import { useState } from "react";
import { Search, Filter, Plus, BookOpen, Zap, Shield, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { PipelineTemplate } from "./PipelineVisualization";

interface PipelineLibraryProps {
  templates: PipelineTemplate[];
  onTemplateSelect?: (template: PipelineTemplate) => void;
  onTemplateCreate?: () => void;
  selectedTemplateId?: string;
}

const getCategoryIcon = (category: PipelineTemplate['category']) => {
  switch (category) {
    case 'hardware_design': return Zap;
    case 'firmware_dev': return Wrench;
    case 'validation': return Shield;
    case 'custom': return BookOpen;
    default: return BookOpen;
  }
};

const getCategoryColor = (category: PipelineTemplate['category']) => {
  switch (category) {
    case 'hardware_design': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    case 'firmware_dev': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'validation': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'custom': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  }
};

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'beginner': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'intermediate': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'advanced': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  }
};

export default function PipelineLibrary({
  templates,
  onTemplateSelect,
  onTemplateCreate,
  selectedTemplateId,
}: PipelineLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("all");

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.metadata.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = categoryFilter === "all" || template.category === categoryFilter;
    const matchesDifficulty = difficultyFilter === "all" || template.metadata.difficulty === difficultyFilter;
    const matchesTab = activeTab === "all" || 
                      (activeTab === "public" && template.isPublic) ||
                      (activeTab === "private" && !template.isPublic);

    return matchesSearch && matchesCategory && matchesDifficulty && matchesTab;
  });

  const publicTemplates = filteredTemplates.filter(t => t.isPublic);
  const privateTemplates = filteredTemplates.filter(t => !t.isPublic);

  return (
    <div className="space-y-4" data-testid="pipeline-library">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pipeline Library</h2>
          <p className="text-sm text-muted-foreground">
            Choose from pre-built pipelines or create your own
          </p>
        </div>
        <Button onClick={onTemplateCreate} data-testid="button-create-template">
          <Plus className="w-4 h-4 mr-2" />
          Create Pipeline
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search pipelines..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-templates"
          />
        </div>
        
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger data-testid="select-category-filter">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="hardware_design">Hardware Design</SelectItem>
            <SelectItem value="firmware_dev">Firmware Development</SelectItem>
            <SelectItem value="validation">Validation</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
          <SelectTrigger data-testid="select-difficulty-filter">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
        
        <Button variant="outline" onClick={() => {
          setSearchQuery("");
          setCategoryFilter("all");
          setDifficultyFilter("all");
        }}>
          <Filter className="w-4 h-4 mr-2" />
          Clear Filters
        </Button>
      </div>

      {/* Template Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all" data-testid="tab-all-templates">
            All ({filteredTemplates.length})
          </TabsTrigger>
          <TabsTrigger value="public" data-testid="tab-public-templates">
            Public ({publicTemplates.length})
          </TabsTrigger>
          <TabsTrigger value="private" data-testid="tab-private-templates">
            Private ({privateTemplates.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <TemplateGrid 
            templates={filteredTemplates}
            onTemplateSelect={onTemplateSelect}
            selectedTemplateId={selectedTemplateId}
          />
        </TabsContent>
        
        <TabsContent value="public" className="mt-4">
          <TemplateGrid 
            templates={publicTemplates}
            onTemplateSelect={onTemplateSelect}
            selectedTemplateId={selectedTemplateId}
          />
        </TabsContent>
        
        <TabsContent value="private" className="mt-4">
          <TemplateGrid 
            templates={privateTemplates}
            onTemplateSelect={onTemplateSelect}
            selectedTemplateId={selectedTemplateId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface TemplateGridProps {
  templates: PipelineTemplate[];
  onTemplateSelect?: (template: PipelineTemplate) => void;
  selectedTemplateId?: string;
}

function TemplateGrid({ templates, onTemplateSelect, selectedTemplateId }: TemplateGridProps) {
  if (templates.length === 0) {
    return (
      <Card className="p-8 text-center">
        <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No pipelines found</h3>
        <p className="text-muted-foreground">
          Try adjusting your search criteria or create a new pipeline template.
        </p>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-4">
        {templates.map((template) => {
          const CategoryIcon = getCategoryIcon(template.category);
          const isSelected = selectedTemplateId === template.id;
          
          return (
            <Card
              key={template.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                isSelected && "ring-2 ring-primary ring-offset-2"
              )}
              onClick={() => onTemplateSelect?.(template)}
              data-testid={`template-card-${template.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <CategoryIcon className="w-5 h-5 text-muted-foreground" />
                    <CardTitle className="text-base">{template.name}</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {template.version}
                  </Badge>
                </div>
                
                {template.description && (
                  <CardDescription className="text-sm line-clamp-2">
                    {template.description}
                  </CardDescription>
                )}
              </CardHeader>
              
              <CardContent className="pt-0 space-y-3">
                {/* Categories and Difficulty */}
                <div className="flex items-center space-x-2">
                  <Badge className={cn("text-xs", getCategoryColor(template.category))}>
                    {template.category.replace('_', ' ')}
                  </Badge>
                  
                  {template.metadata.difficulty && (
                    <Badge className={cn("text-xs", getDifficultyColor(template.metadata.difficulty))}>
                      {template.metadata.difficulty}
                    </Badge>
                  )}
                  
                  {template.isPublic && (
                    <Badge variant="outline" className="text-xs">
                      Public
                    </Badge>
                  )}
                </div>
                
                {/* Stage Count and Estimated Time */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {template.stageDefinitions?.length || 0} stages
                  </span>
                  {template.metadata.estimatedTime && (
                    <span>
                      ~{template.metadata.estimatedTime < 60 
                        ? `${template.metadata.estimatedTime}m` 
                        : `${Math.floor(template.metadata.estimatedTime / 60)}h`
                      }
                    </span>
                  )}
                </div>
                
                {/* Tags */}
                {template.metadata.tags && template.metadata.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {template.metadata.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {template.metadata.tags.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{template.metadata.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}