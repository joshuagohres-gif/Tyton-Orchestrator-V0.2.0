import { describe, it, expect } from "vitest";
import { applyOperationsRobust } from "../server/lib/executor-robust";
import type { Mesh, OperationEnvelope } from "../server/lib/shape-operations";

function makeFlatBoxFace(): Mesh {
  // 50x120 front rectangle as two triangles; UV==XY normalized to [0,1]
  const verts = [];
  const W = 50, H = 120;
  const coords = [
    [0, 0, 0],
    [W, 0, 0],
    [W, H, 0],
    [0, H, 0]
  ];

  for (let i = 0; i < 4; i++) {
    const [x, y, z] = coords[i];
    const u = x / W, v = y / H;
    verts.push({ id: i, u, v, x, y, z });
  }

  return {
    meshId: "front",
    vertices: verts,
    faces: [[0, 1, 2], [0, 2, 3]]
  };
}

describe("Robust Executor - add_hole", () => {
  it("cuts a circular hole in front face", () => {
    const mesh = makeFlatBoxFace();
    const env: OperationEnvelope = {
      schemaVersion: 1,
      operations: [
        {
          opId: "h1",
          type: "add_hole",
          description: "front cam",
          target: {
            kind: "uv_region",
            uvBox: { uMin: 0.45, uMax: 0.55, vMin: 0.75, vMax: 0.85 }
          },
          params: {
            shape: "circular",
            diameterMm: 10,
            throughAll: true,
            normalDirection: "outward_surface_normal",
            offsetFromRegionCenterMm: { x: 0, y: 0 },
            chamferEntranceMm: 0.5,
            chamferExitMm: 0
          },
          priority: 1,
          dependsOn: [],
          notes: ""
        }
      ]
    };

    const out = applyOperationsRobust(mesh, env);

    // Should have remeshed the region
    expect(out.faces.length).toBeGreaterThan(2);
    expect(out.vertices.length).toBeGreaterThan(4);

    // Verify mesh ID was updated
    expect(out.meshId).toBe("front|ops");
  });

  it("handles empty operations gracefully", () => {
    const mesh = makeFlatBoxFace();
    const env: OperationEnvelope = {
      schemaVersion: 1,
      operations: []
    };

    const out = applyOperationsRobust(mesh, env);

    // Should return unchanged mesh (cloned)
    expect(out.faces.length).toBe(2);
    expect(out.vertices.length).toBe(4);
  });
});

describe("Robust Executor - extrude_region", () => {
  it("extrudes a bezel outward", () => {
    const mesh = makeFlatBoxFace();
    const env: OperationEnvelope = {
      schemaVersion: 1,
      operations: [
        {
          opId: "e1",
          type: "extrude_region",
          description: "bezel",
          target: {
            kind: "uv_region",
            uvBox: { uMin: 0.40, uMax: 0.60, vMin: 0.70, vMax: 0.90 }
          },
          params: {
            mode: "solid",
            direction: "axis_z",
            heightMm: 1,
            taperAngleDegrees: 3,
            capType: "flat"
          },
          priority: 1,
          dependsOn: [],
          notes: ""
        }
      ]
    };

    const out = applyOperationsRobust(mesh, env);

    // Should have added top+side faces
    expect(out.faces.length).toBeGreaterThan(2);
    expect(out.vertices.length).toBeGreaterThan(4);

    // Check that new vertices are tagged
    const taggedVerts = out.vertices.filter(v => v.tags && v.tags.length > 0);
    expect(taggedVerts.length).toBeGreaterThan(0);
  });

  it("extrudes with taper", () => {
    const mesh = makeFlatBoxFace();
    const env: OperationEnvelope = {
      schemaVersion: 1,
      operations: [
        {
          opId: "e2",
          type: "extrude_region",
          description: "tapered boss",
          target: {
            kind: "uv_region",
            uvBox: { uMin: 0.4, uMax: 0.6, vMin: 0.4, vMax: 0.6 }
          },
          params: {
            mode: "solid",
            direction: "outward_surface_normal",
            heightMm: 5,
            taperAngleDegrees: 10,
            capType: "flat"
          },
          priority: 1,
          dependsOn: [],
          notes: "center boss"
        }
      ]
    };

    const out = applyOperationsRobust(mesh, env);

    expect(out.faces.length).toBeGreaterThan(2);
  });
});

describe("Robust Executor - combined operations", () => {
  it("applies hole then extrude in order", () => {
    const mesh = makeFlatBoxFace();
    const env: OperationEnvelope = {
      schemaVersion: 1,
      operations: [
        {
          opId: "e1",
          type: "extrude_region",
          description: "create raised platform",
          target: {
            kind: "uv_region",
            uvBox: { uMin: 0.3, uMax: 0.7, vMin: 0.3, vMax: 0.7 }
          },
          params: {
            mode: "solid",
            direction: "axis_z",
            heightMm: 2,
            taperAngleDegrees: 0,
            capType: "flat"
          },
          priority: 1,
          dependsOn: [],
          notes: ""
        },
        {
          opId: "h1",
          type: "add_hole",
          description: "cut hole in platform",
          target: {
            kind: "uv_region",
            uvBox: { uMin: 0.45, uMax: 0.55, vMin: 0.45, vMax: 0.55 }
          },
          params: {
            shape: "circular",
            diameterMm: 8,
            throughAll: true,
            normalDirection: "axis_z",
            offsetFromRegionCenterMm: { x: 0, y: 0 }
          },
          priority: 2,
          dependsOn: ["e1"],
          notes: ""
        }
      ]
    };

    const out = applyOperationsRobust(mesh, env);

    // Both operations should have modified the mesh
    expect(out.faces.length).toBeGreaterThan(4);
    expect(out.vertices.length).toBeGreaterThan(8);
  });
});
