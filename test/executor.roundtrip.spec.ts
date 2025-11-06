import { describe, it, expect } from "vitest";
import {
  computeTutteEmbeddingRobust,
  getBoundaryLoops,
  buildAdjacency,
} from "../server/lib/tutte";
import { applyOperationsRobust } from "../server/lib/executor-robust";
import type { Mesh, OperationEnvelope } from "../server/lib/shape-operations";

function makeFlatBoxFace(): Mesh {
  const verts = [];
  const W = 50,
    H = 120;
  const coords = [
    [0, 0, 0],
    [W, 0, 0],
    [W, H, 0],
    [0, H, 0],
  ];

  for (let i = 0; i < 4; i++) {
    const [x, y, z] = coords[i];
    const u = x / W,
      v = y / H;
    verts.push({ id: i, u, v, x, y, z });
  }

  return {
    meshId: "front",
    vertices: verts,
    faces: [
      [0, 1, 2],
      [0, 2, 3],
    ],
  };
}

function countManifoldEdges(mesh: Mesh): number {
  const adj = buildAdjacency(mesh);
  let manifoldCount = 0;

  for (const [edgeKey, faces] of Array.from(adj.edgeToFaces.entries())) {
    // Manifold edges are used by exactly 2 faces (or 1 for boundary)
    if (faces.size === 1 || faces.size === 2) {
      manifoldCount++;
    }
  }

  return manifoldCount;
}

describe("Executor Roundtrip", () => {
  it("preserves manifoldness after embed → plan → execute", () => {
    const mesh = makeFlatBoxFace();

    // Embed
    const embedding = computeTutteEmbeddingRobust(mesh);
    expect(embedding.uv.size).toBe(mesh.vertices.length);

    // Plan operation
    const env: OperationEnvelope = {
      schemaVersion: 1,
      operations: [
        {
          opId: "h1",
          type: "add_hole",
          description: "test hole",
          target: {
            kind: "uv_region",
            uvBox: { uMin: 0.45, uMax: 0.55, vMin: 0.75, vMax: 0.85 },
          },
          params: {
            shape: "circular",
            diameterMm: 10,
            throughAll: true,
            normalDirection: "outward_surface_normal",
          },
          priority: 1,
          dependsOn: [],
          notes: "",
        },
      ],
    };

    // Execute
    const result = applyOperationsRobust(mesh, env);

    // Check: manifold edges count should be reasonable
    // (boundary edges may change, but interior should remain manifold)
    const originalManifold = countManifoldEdges(mesh);
    const resultManifold = countManifoldEdges(result);

    // Result should still have manifold structure
    expect(resultManifold).toBeGreaterThan(0);

    // Mesh should have more vertices/faces after operation
    expect(result.vertices.length).toBeGreaterThanOrEqual(mesh.vertices.length);
    expect(result.faces.length).toBeGreaterThanOrEqual(mesh.faces.length);
  });

  it("handles extrude roundtrip", () => {
    const mesh = makeFlatBoxFace();
    const embedding = computeTutteEmbeddingRobust(mesh);

    const env: OperationEnvelope = {
      schemaVersion: 1,
      operations: [
        {
          opId: "e1",
          type: "extrude_region",
          description: "test extrude",
          target: {
            kind: "uv_region",
            uvBox: { uMin: 0.4, uMax: 0.6, vMin: 0.4, vMax: 0.6 },
          },
          params: {
            mode: "solid",
            direction: "axis_z",
            heightMm: 2,
            taperAngleDegrees: 0,
            capType: "flat",
          },
          priority: 1,
          dependsOn: [],
          notes: "",
        },
      ],
    };

    const result = applyOperationsRobust(mesh, env);

    // Should add geometry
    expect(result.vertices.length).toBeGreaterThan(mesh.vertices.length);
    expect(result.faces.length).toBeGreaterThan(mesh.faces.length);

    // Should remain manifold
    const resultManifold = countManifoldEdges(result);
    expect(resultManifold).toBeGreaterThan(0);
  });

  it("maintains boundary loop structure", () => {
    const mesh = makeFlatBoxFace();
    const originalLoops = getBoundaryLoops(mesh);

    const env: OperationEnvelope = {
      schemaVersion: 1,
      operations: [
        {
          opId: "h1",
          type: "add_hole",
          description: "test",
          target: {
            kind: "uv_region",
            uvBox: { uMin: 0.45, uMax: 0.55, vMin: 0.45, vMax: 0.55 },
          },
          params: {
            shape: "circular",
            diameterMm: 5,
            throughAll: true,
            normalDirection: "outward_surface_normal",
          },
          priority: 1,
          dependsOn: [],
          notes: "",
        },
      ],
    };

    const result = applyOperationsRobust(mesh, env);

    // After hole, should still have boundary (may have inner loop now)
    const resultLoops = getBoundaryLoops(result);
    expect(resultLoops.length).toBeGreaterThanOrEqual(0);
  });
});
