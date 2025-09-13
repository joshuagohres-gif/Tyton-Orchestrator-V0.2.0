import { storage } from "../storage";

export interface SchematicData {
  components: any[];
  connections: any[];
  layout: string;
}

export interface BOMEntry {
  component: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  supplier: string;
  availability: string;
}

export async function generateSchematic(circuitDesign: any): Promise<SchematicData> {
  // Convert circuit design to schematic format
  const schematic: SchematicData = {
    components: circuitDesign.components.map((comp: any) => ({
      id: comp.id,
      type: comp.type,
      label: comp.label,
      position: comp.position,
      symbol: getComponentSymbol(comp.type),
      ports: comp.ports
    })),
    connections: circuitDesign.connections.map((conn: any) => ({
      from: conn.from,
      to: conn.to,
      type: conn.type,
      color: getConnectionColor(conn.type)
    })),
    layout: "auto" // ELK.js would handle auto-layout
  };

  return schematic;
}

export async function generateKiCadFiles(projectId: string): Promise<{ schematic: string; pcb: string; project: string }> {
  const modules = await storage.getProjectModules(projectId);
  const connections = await storage.getProjectConnections(projectId);
  
  // Generate KiCad schematic file
  const schematic = generateKiCadSchematic(modules, connections);
  
  // Generate KiCad PCB file
  const pcb = generateKiCadPCB(modules, connections);
  
  // Generate KiCad project file
  const project = generateKiCadProject();
  
  return { schematic, pcb, project };
}

export async function generateBOM(projectId: string): Promise<BOMEntry[]> {
  const modules = await storage.getProjectModules(projectId);
  const bom: BOMEntry[] = [];
  
  // Group modules by component
  const componentCounts = new Map<string, number>();
  const componentDetails = new Map<string, any>();
  
  for (const module of modules) {
    const component = await storage.getComponent(module.componentId);
    if (component) {
      const count = componentCounts.get(component.id) || 0;
      componentCounts.set(component.id, count + 1);
      componentDetails.set(component.id, component);
    }
  }
  
  // Generate BOM entries
  for (const [componentId, quantity] of Array.from(componentCounts.entries())) {
    const component = componentDetails.get(componentId);
    if (component) {
      const pricing = component.pricing as any;
      const unitPrice = pricing?.price || 0;
      
      bom.push({
        component: component.name,
        quantity,
        unitPrice,
        totalPrice: unitPrice * quantity,
        supplier: pricing?.supplier || "TBD",
        availability: "In Stock" // Would be fetched from supplier APIs
      });
    }
  }
  
  return bom;
}

function getComponentSymbol(type: string): string {
  const symbols: Record<string, string> = {
    microcontroller: "IC",
    sensor: "U", 
    communication: "U",
    power: "PS",
    passive: "R"
  };
  return symbols[type] || "U";
}

function getConnectionColor(type: string): string {
  const colors: Record<string, string> = {
    power: "#ff0000",
    data: "#00ff00", 
    analog: "#0000ff",
    digital: "#ffff00"
  };
  return colors[type] || "#808080";
}

function generateKiCadSchematic(modules: any[], connections: any[]): string {
  // Generate KiCad schematic file format
  let schematic = `EESchema Schematic File Version 4
EELAYER 30 0
EELAYER END
$Descr A4 11693 8268
encoding utf-8
Sheet 1 1
Title "Tyton Generated Schematic"
Date ""
Rev ""
Comp ""
Comment1 ""
Comment2 ""
Comment3 ""
Comment4 ""
$EndDescr
`;

  // Add components
  modules.forEach((module, index) => {
    const x = (module.position as any).x * 10; // Scale for KiCad
    const y = (module.position as any).y * 10;
    
    schematic += `$Comp
L Device:${getComponentSymbol(module.component?.category || "U")} U${index + 1}
U 1 1 00000000
P ${x} ${y}
F 0 "U${index + 1}" H ${x} ${y + 50} 50  0000 C CNN
F 1 "${module.label}" H ${x} ${y - 50} 50  0000 C CNN
        1    ${x}    ${y}
        1    0    0    -1  
$EndComp
`;
  });

  // Add connections (wires)
  connections.forEach(connection => {
    schematic += `Wire Wire Line
        ${connection.fromX || 0} ${connection.fromY || 0} ${connection.toX || 0} ${connection.toY || 0}
`;
  });

  schematic += `$EndSCHEMATC
`;

  return schematic;
}

function generateKiCadPCB(modules: any[], connections: any[]): string {
  // Generate KiCad PCB file format
  let pcb = `(kicad_pcb (version 20211014) (generator pcbnew)
  (general
    (thickness 1.6)
  )
  (paper "A4")
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (32 "B.Adhes" user "B.Adhesive")
    (33 "F.Adhes" user "F.Adhesive")
    (34 "B.Paste" user)
    (35 "F.Paste" user)
    (36 "B.SilkS" user "B.Silkscreen")
    (37 "F.SilkS" user "F.Silkscreen")
    (38 "B.Mask" user)
    (39 "F.Mask" user)
    (40 "Dwgs.User" user "User.Drawings")
    (41 "Cmts.User" user "User.Comments")
    (42 "Eco1.User" user "User.Eco1")
    (43 "Eco2.User" user "User.Eco2")
    (44 "Edge.Cuts" user)
    (45 "Margin" user)
    (46 "B.CrtYd" user "B.Courtyard")
    (47 "F.CrtYd" user "F.Courtyard")
    (48 "B.Fab" user)
    (49 "F.Fab" user)
  )
`;

  // Add footprints
  modules.forEach((module, index) => {
    const x = (module.position as any).x * 254000; // Convert to nanometers
    const y = (module.position as any).y * 254000;
    
    pcb += `  (footprint "Package_DIP:DIP-8_W7.62mm" (layer "F.Cu")
    (at ${x / 1000000} ${y / 1000000})
    (uuid "${generateUuid()}")
    (property "Reference" "U${index + 1}" (at 0 0) (layer "F.SilkS"))
    (property "Value" "${module.label}" (at 0 2.54) (layer "F.Fab"))
  )
`;
  });

  pcb += `)`;
  return pcb;
}

function generateKiCadProject(): string {
  return `{
  "board": {
    "design_settings": {
      "defaults": {
        "board_outline_line_width": 0.1,
        "copper_line_width": 0.2
      }
    }
  },
  "libraries": {
    "pinned_footprint_libs": [],
    "pinned_symbol_libs": []
  },
  "meta": {
    "filename": "tyton_project.kicad_pro",
    "version": 1
  }
}`;
}

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
