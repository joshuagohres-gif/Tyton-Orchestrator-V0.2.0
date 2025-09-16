import { useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Box, Edges, Environment } from "@react-three/drei";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Maximize, Move, RotateCw, Package, Settings2, Layers } from "lucide-react";
import type { ProjectWithModules } from "@/types/project";
import { Badge } from "@/components/ui/badge";

interface Design3DViewerProps {
  project: ProjectWithModules;
}

// Mechanical component type (temporary until API is ready)
interface MechanicalComponent {
  id: string;
  name: string;
  type: 'housing' | 'bracket' | 'heatsink' | 'plate' | 'enclosure';
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  material: 'ABS' | 'PLA' | 'Aluminum' | 'Steel' | 'Nylon';
  manufacturingMethod: '3D_PRINT' | 'CNC' | 'INJECTION_MOLD';
  clearanceClass: 'LOOSE' | 'NORMAL' | 'CLOSE';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

// Component colors based on type
const componentColors = {
  housing: '#6b7280',
  bracket: '#3b82f6',
  heatsink: '#94a3b8',
  plate: '#71717a',
  enclosure: '#52525b'
};

// 3D Component mesh
function MechanicalMesh({ component, selected, onClick }: {
  component: MechanicalComponent;
  selected: boolean;
  onClick: () => void;
}) {
  const color = componentColors[component.type] || '#6b7280';
  const scale = [
    component.dimensions.length / 100,
    component.dimensions.height / 100,
    component.dimensions.width / 100
  ];

  return (
    <group
      position={[component.position.x, component.position.y, component.position.z]}
      rotation={[component.rotation.x, component.rotation.y, component.rotation.z]}
    >
      <Box
        args={[1, 1, 1]}
        scale={scale as [number, number, number]}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'default';
        }}
      >
        <meshStandardMaterial 
          color={selected ? '#fbbf24' : color}
          metalness={component.material === 'Aluminum' || component.material === 'Steel' ? 0.8 : 0.1}
          roughness={component.material === 'Aluminum' || component.material === 'Steel' ? 0.3 : 0.8}
        />
        {selected && <Edges linewidth={2} color="#fbbf24" />}
      </Box>
    </group>
  );
}

export default function Design3DViewer({ project }: Design3DViewerProps) {
  const [selectedComponent, setSelectedComponent] = useState<MechanicalComponent | null>(null);
  const [dimensions, setDimensions] = useState({ length: 100, width: 100, height: 50 });
  const [material, setMaterial] = useState<string>('ABS');
  const [manufacturingMethod, setManufacturingMethod] = useState<string>('3D_PRINT');
  const [clearanceClass, setClearanceClass] = useState<string>('NORMAL');

  // Query mechanical components
  const { data: mechanicalComponents, isLoading } = useQuery<MechanicalComponent[]>({
    queryKey: ['/api/projects', project.id, 'mechanical'],
    enabled: true
  });

  // Use placeholder data for now
  const components = mechanicalComponents || [
    {
      id: '1',
      name: 'Main Housing',
      type: 'housing' as const,
      dimensions: { length: 200, width: 150, height: 80 },
      material: 'ABS' as const,
      manufacturingMethod: '3D_PRINT' as const,
      clearanceClass: 'NORMAL' as const,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }
    },
    {
      id: '2',
      name: 'Mounting Bracket',
      type: 'bracket' as const,
      dimensions: { length: 50, width: 30, height: 60 },
      material: 'Aluminum' as const,
      manufacturingMethod: 'CNC' as const,
      clearanceClass: 'CLOSE' as const,
      position: { x: 1.5, y: 0, z: 0.5 },
      rotation: { x: 0, y: Math.PI / 4, z: 0 }
    },
    {
      id: '3',
      name: 'Heat Sink',
      type: 'heatsink' as const,
      dimensions: { length: 80, width: 80, height: 40 },
      material: 'Aluminum' as const,
      manufacturingMethod: 'CNC' as const,
      clearanceClass: 'NORMAL' as const,
      position: { x: -1, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }
    }
  ];

  return (
    <div className="flex h-full w-full bg-background">
      {/* 3D Viewport */}
      <div className="flex-1 relative" data-testid="3d-viewport">
        <Canvas
          camera={{ position: [5, 5, 5], fov: 50 }}
          className="w-full h-full"
        >
          <Suspense fallback={null}>
            {/* Lighting */}
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
            <pointLight position={[-10, -10, -5]} intensity={0.5} />

            {/* Environment for reflections */}
            <Environment preset="studio" />

            {/* Grid */}
            <Grid
              args={[10, 10]}
              cellSize={0.5}
              cellThickness={0.5}
              cellColor={'#3f3f46'}
              sectionSize={2}
              sectionThickness={1}
              sectionColor={'#52525b'}
              fadeDistance={10}
              fadeStrength={1}
              infiniteGrid
            />

            {/* Mechanical Components */}
            {components.map((component) => (
              <MechanicalMesh
                key={component.id}
                component={component}
                selected={selectedComponent?.id === component.id}
                onClick={() => {
                  setSelectedComponent(component);
                  setDimensions(component.dimensions);
                  setMaterial(component.material);
                  setManufacturingMethod(component.manufacturingMethod);
                  setClearanceClass(component.clearanceClass);
                }}
              />
            ))}

            {/* Controls */}
            <OrbitControls
              enablePan={true}
              enableZoom={true}
              enableRotate={true}
              makeDefault
            />
          </Suspense>
        </Canvas>

        {/* Viewport Controls Overlay */}
        <div className="absolute top-4 left-4 space-y-2">
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg p-2">
            <div className="flex space-x-2">
              <Button size="sm" variant="ghost" title="Pan" data-testid="button-pan">
                <Move className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" title="Rotate" data-testid="button-rotate">
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" title="Zoom" data-testid="button-zoom">
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2">
            <div className="text-xs text-muted-foreground">
              <div className="flex items-center space-x-1">
                <Package className="h-3 w-3" />
                <span data-testid="text-component-count">{components.length} Components</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Parameter Panel */}
      <div className="w-96 bg-card border-l border-border overflow-y-auto" data-testid="parameter-panel">
        <Card className="rounded-none border-0">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings2 className="h-5 w-5" />
              <span>Component Parameters</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {selectedComponent ? (
              <>
                {/* Selected Component Info */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Selected Component</Label>
                  <div className="p-3 bg-secondary rounded-lg border border-border">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground" data-testid="text-component-name">
                        {selectedComponent.name}
                      </span>
                      <Badge variant="secondary" data-testid="badge-component-type">
                        {selectedComponent.type}
                      </Badge>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Dimensions */}
                <div className="space-y-4">
                  <Label className="text-sm font-medium flex items-center space-x-2">
                    <Layers className="h-4 w-4" />
                    <span>Dimensions (mm)</span>
                  </Label>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between mb-2">
                        <Label className="text-xs text-muted-foreground">Length</Label>
                        <span className="text-xs font-mono" data-testid="text-length">
                          {dimensions.length}mm
                        </span>
                      </div>
                      <Slider
                        value={[dimensions.length]}
                        min={10}
                        max={500}
                        step={5}
                        onValueChange={([value]) => 
                          setDimensions({ ...dimensions, length: value })
                        }
                        className="w-full"
                        data-testid="slider-length"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <Label className="text-xs text-muted-foreground">Width</Label>
                        <span className="text-xs font-mono" data-testid="text-width">
                          {dimensions.width}mm
                        </span>
                      </div>
                      <Slider
                        value={[dimensions.width]}
                        min={10}
                        max={500}
                        step={5}
                        onValueChange={([value]) => 
                          setDimensions({ ...dimensions, width: value })
                        }
                        className="w-full"
                        data-testid="slider-width"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <Label className="text-xs text-muted-foreground">Height</Label>
                        <span className="text-xs font-mono" data-testid="text-height">
                          {dimensions.height}mm
                        </span>
                      </div>
                      <Slider
                        value={[dimensions.height]}
                        min={10}
                        max={500}
                        step={5}
                        onValueChange={([value]) => 
                          setDimensions({ ...dimensions, height: value })
                        }
                        className="w-full"
                        data-testid="slider-height"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Material */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Material</Label>
                  <Select value={material} onValueChange={setMaterial}>
                    <SelectTrigger data-testid="select-material">
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ABS">ABS Plastic</SelectItem>
                      <SelectItem value="PLA">PLA Plastic</SelectItem>
                      <SelectItem value="Aluminum">Aluminum</SelectItem>
                      <SelectItem value="Steel">Steel</SelectItem>
                      <SelectItem value="Nylon">Nylon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Manufacturing Method */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Manufacturing Method</Label>
                  <Select value={manufacturingMethod} onValueChange={setManufacturingMethod}>
                    <SelectTrigger data-testid="select-manufacturing">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3D_PRINT">3D Printing</SelectItem>
                      <SelectItem value="CNC">CNC Machining</SelectItem>
                      <SelectItem value="INJECTION_MOLD">Injection Molding</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Clearance Class */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Clearance Class</Label>
                  <Select value={clearanceClass} onValueChange={setClearanceClass}>
                    <SelectTrigger data-testid="select-clearance">
                      <SelectValue placeholder="Select clearance" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOOSE">Loose Fit</SelectItem>
                      <SelectItem value="NORMAL">Normal Fit</SelectItem>
                      <SelectItem value="CLOSE">Close Fit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex space-x-2">
                  <Button className="flex-1" variant="outline" data-testid="button-reset">
                    Reset
                  </Button>
                  <Button className="flex-1" data-testid="button-apply">
                    Apply Changes
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-no-selection">
                  Click on a component in the 3D view to edit its parameters
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}