/**
 * Shape Operations - Type definitions for geometric operations
 */

export interface MeshVertex {
  id: number;
  u: number;  // UV coordinates for texture/parametric mapping
  v: number;
  x: number;  // 3D position
  y: number;
  z: number;
  tags?: string[];
}

export interface Mesh {
  meshId: string;
  vertices: MeshVertex[];
  faces: number[][];  // Array of vertex indices (triangles or polygons)
  boundaryLoops?: number[][];  // For open meshes
}

export interface UvRegionTarget {
  kind: "uv_region";
  uvBox: {
    uMin: number;
    uMax: number;
    vMin: number;
    vMax: number;
  };
}

export interface AddHoleParams {
  shape: "circular" | "rectangular" | "custom";
  diameterMm: number;
  throughAll: boolean;
  normalDirection: "outward_surface_normal" | "inward_surface_normal" | "axis_x" | "axis_y" | "axis_z";
  offsetFromRegionCenterMm?: { x: number; y: number };
  chamferEntranceMm?: number;
  chamferExitMm?: number;
}

export interface ExtrudeRegionParams {
  mode: "solid" | "shell";
  direction: "outward_surface_normal" | "inward_surface_normal" | "axis_x" | "axis_y" | "axis_z";
  heightMm: number;
  taperAngleDegrees?: number;
  capType: "flat" | "rounded";
}

export interface Operation {
  opId: string;
  type: "add_hole" | "extrude_region" | "fillet" | "chamfer";
  description: string;
  target: UvRegionTarget;
  params: AddHoleParams | ExtrudeRegionParams | any;
  priority: number;
  dependsOn: string[];
  notes: string;
}

export interface OperationEnvelope {
  schemaVersion: number;
  operations: Operation[];
}
