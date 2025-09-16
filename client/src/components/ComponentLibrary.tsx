import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Microchip, Wifi, Thermometer, Eye, Package, Filter, X, ExternalLink, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Component } from "@shared/schema";

// Global type extension for drag and drop
declare global {
  interface Window {
    draggedComponent?: Component;
  }
}

interface ComponentItemProps {
  component: Component;
  onDragStart: (component: Component) => void;
}

function ComponentItem({ component, onDragStart }: ComponentItemProps) {
  const getComponentIcon = (category: string) => {
    switch (category) {
      case 'microcontroller':
        return <Microchip className="text-primary" />;
      case 'sensor':
        return <Thermometer className="text-accent" />;
      case 'communication':
        return <Wifi className="text-green-500" />;
      case 'power':
        return <Package className="text-red-500" />;
      default:
        return <Package className="text-muted-foreground" />;
    }
  };

  const getPriceDisplay = (pricing: any) => {
    if (pricing && typeof pricing === 'object' && pricing.price) {
      return `$${pricing.price.toFixed(2)}`;
    }
    return "Price TBD";
  };

  const getAvailabilityStatus = (component: Component) => {
    // Mock availability logic - in real app would check supplier APIs
    const inStock = Math.random() > 0.2; // 80% chance in stock
    return inStock ? 'in-stock' : 'limited';
  };

  const getAvailabilityDisplay = (status: string) => {
    switch (status) {
      case 'in-stock':
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />In Stock</Badge>;
      case 'limited':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><Clock className="w-3 h-3 mr-1" />Limited</Badge>;
      case 'out-of-stock':
        return <Badge variant="outline" className="text-red-600 border-red-600"><AlertCircle className="w-3 h-3 mr-1" />Out of Stock</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Unknown</Badge>;
    }
  };

  const availabilityStatus = getAvailabilityStatus(component);

  return (
    <div 
      className="p-4 bg-secondary rounded-lg border border-border hover:border-primary/50 cursor-grab transition-all group hover:shadow-sm"
      draggable
      onDragStart={() => onDragStart(component)}
      data-testid={`component-item-${component.id}`}
    >
      <div className="space-y-3">
        <div className="flex items-start space-x-3">
          <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center group-hover:bg-primary/30 transition-colors flex-shrink-0">
            {getComponentIcon(component.category)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{component.name}</p>
                <p className="text-xs text-muted-foreground truncate mb-1">{component.manufacturer}</p>
                <p className="text-xs text-muted-foreground truncate">{component.description}</p>
              </div>
              {component.datasheet && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (component.datasheet) {
                      window.open(component.datasheet, '_blank');
                    }
                  }}
                  data-testid={`button-datasheet-${component.id}`}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-accent">{getPriceDisplay(component.pricing)}</span>
            {component.pricing && typeof component.pricing === 'object' && 'supplier' in component.pricing && component.pricing.supplier && (
              <Badge variant="secondary" className="text-xs">{String(component.pricing.supplier)}</Badge>
            )}
          </div>
          {getAvailabilityDisplay(availabilityStatus)}
        </div>
      </div>
    </div>
  );
}

function ComponentCategory({ title, components, onDragStart }: {
  title: string;
  components: Component[];
  onDragStart: (component: Component) => void;
}) {
  if (components.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
      <div className="space-y-2">
        {components.map((component) => (
          <ComponentItem 
            key={component.id} 
            component={component} 
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </div>
  );
}

export default function ComponentLibrary() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: components, isLoading } = useQuery<Component[]>({
    queryKey: ["/api/components/search", searchQuery, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (selectedCategory !== "all") params.append('category', selectedCategory);
      
      const response = await fetch(`/api/components/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch components');
      }
      return response.json();
    },
    enabled: searchQuery.length > 0 || selectedCategory !== "all",
  });

  const handleDragStart = (component: Component) => {
    // Store component data for drag and drop
    if (typeof window !== 'undefined') {
      window.draggedComponent = component;
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("all");
  };

  const hasActiveFilters = searchQuery.length > 0 || selectedCategory !== "all";
  const showNoResults = !isLoading && hasActiveFilters && (!components || components.length === 0);
  const showEmptyState = !isLoading && !hasActiveFilters;

  const categories = [
    { value: "all", label: "All Categories" },
    { value: "microcontroller", label: "Microcontrollers" },
    { value: "sensor", label: "Sensors" },
    { value: "communication", label: "Communication" },
    { value: "power", label: "Power" },
    { value: "passive", label: "Passive Components" },
    { value: "mechanical", label: "Mechanical" },
  ];

  // Group components by category
  const groupedComponents = components?.reduce((acc, component) => {
    const category = component.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(component);
    return acc;
  }, {} as Record<string, Component[]>) || {};

  return (
    <aside className="w-80 bg-card border-r border-border flex flex-col relative z-10" data-testid="component-library">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">Component Library</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8 w-8 p-0"
            data-testid="button-toggle-filters"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              type="text"
              placeholder="Search components..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-input border-border text-foreground"
              data-testid="input-component-search"
            />
          </div>
          
          {showFilters && (
            <div className="space-y-2">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="bg-input border-border text-foreground" data-testid="select-category-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {categories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  className="w-full h-8"
                  data-testid="button-clear-filters"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 bg-secondary rounded-lg">
                <div className="flex items-start space-x-3">
                  <Skeleton className="w-12 h-12 bg-muted rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full bg-muted" />
                    <Skeleton className="h-3 w-3/4 bg-muted" />
                    <Skeleton className="h-3 w-1/2 bg-muted" />
                    <div className="flex justify-between items-center pt-2">
                      <Skeleton className="h-4 w-16 bg-muted" />
                      <Skeleton className="h-5 w-20 bg-muted rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : showEmptyState ? (
          // Empty State - No Search Query
          <div className="flex flex-col items-center justify-center h-full py-12" data-testid="component-library-empty-state">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto">
                <Package className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-medium text-foreground">Explore Components</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Search for components or use category filters to find the perfect parts for your hardware design.
                </p>
              </div>
              <div className="space-y-3 text-left bg-muted/30 rounded-lg p-4 max-w-sm">
                <div className="flex items-center space-x-2 text-sm">
                  <Search className="w-4 h-4 text-primary" />
                  <span className="text-foreground">Search by name or description</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <Filter className="w-4 h-4 text-primary" />
                  <span className="text-foreground">Filter by component category</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <Eye className="w-4 h-4 text-primary" />
                  <span className="text-foreground">View datasheets and specifications</span>
                </div>
              </div>
            </div>
          </div>
        ) : showNoResults ? (
          // No Results State
          <div className="text-center py-12" data-testid="component-library-no-results">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-sm font-medium text-foreground mb-2">No components found</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Try adjusting your search terms or filters
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              data-testid="button-clear-search"
            >
              <X className="h-3 w-3 mr-1" />
              Clear Search
            </Button>
          </div>
        ) : (
          // Components Display
          <div className="space-y-4">
            {selectedCategory === "all" ? (
              // Grouped by Category
              <>
                <ComponentCategory
                  title="Microcontrollers"
                  components={groupedComponents.microcontroller || []}
                  onDragStart={handleDragStart}
                />
                <ComponentCategory
                  title="Sensors"
                  components={groupedComponents.sensor || []}
                  onDragStart={handleDragStart}
                />
                <ComponentCategory
                  title="Communication"
                  components={groupedComponents.communication || []}
                  onDragStart={handleDragStart}
                />
                <ComponentCategory
                  title="Power"
                  components={groupedComponents.power || []}
                  onDragStart={handleDragStart}
                />
                {/* Render any other categories */}
                {Object.entries(groupedComponents).map(([category, categoryComponents]) => {
                  if (['microcontroller', 'sensor', 'communication', 'power'].includes(category)) {
                    return null;
                  }
                  return (
                    <ComponentCategory
                      key={category}
                      title={category.charAt(0).toUpperCase() + category.slice(1)}
                      components={categoryComponents}
                      onDragStart={handleDragStart}
                    />
                  );
                })}
              </>
            ) : (
              // Filtered Results (No Category Grouping)
              <div className="space-y-3">
                {components?.map((component) => (
                  <ComponentItem 
                    key={component.id} 
                    component={component} 
                    onDragStart={handleDragStart}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
