import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Microchip, Wifi, Thermometer, Eye, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { Component } from "@shared/schema";

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

  return (
    <div 
      className="p-3 bg-secondary rounded-lg border border-border hover:border-primary/50 cursor-grab transition-all group"
      draggable
      onDragStart={() => onDragStart(component)}
      data-testid={`component-item-${component.id}`}
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center group-hover:bg-primary/30 transition-colors">
          {getComponentIcon(component.category)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{component.name}</p>
          <p className="text-xs text-muted-foreground truncate">{component.description}</p>
          <p className="text-xs text-accent">{getPriceDisplay(component.pricing)}</p>
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

  const { data: components, isLoading } = useQuery<Component[]>({
    queryKey: ["/api/components/search", { q: searchQuery || "arduino" }], // Default search
    enabled: true,
  });

  const handleDragStart = (component: Component) => {
    // Store component data for drag and drop
    if (typeof window !== 'undefined') {
      window.draggedComponent = component;
    }
  };

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
    <aside className="w-80 bg-card border-r border-border flex flex-col" data-testid="component-library">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold mb-3 text-foreground">Component Library</h2>
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
      </div>
      
      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24 bg-muted" />
                <div className="space-y-2">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="p-3 bg-secondary rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Skeleton className="w-10 h-10 bg-muted rounded-lg" />
                        <div className="flex-1 space-y-1">
                          <Skeleton className="h-4 w-full bg-muted" />
                          <Skeleton className="h-3 w-3/4 bg-muted" />
                          <Skeleton className="h-3 w-1/4 bg-muted" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
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
            
            {components && components.length === 0 && (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">No components found</p>
                <p className="text-xs text-muted-foreground">Try a different search term</p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
