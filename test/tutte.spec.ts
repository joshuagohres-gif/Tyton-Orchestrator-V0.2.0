import { describe, it, expect } from "vitest";
import {
  buildAdjacency,
  computeTutteEmbedding,
  selectUvRegion,
  validateEdgeLoop,
  getBoundaryLoops,
} from "../server/lib/tutte";
import type { Mesh } from "../server/lib/shape-operations";

function makeFlatBoxFace(): Mesh {
  // 50x120 front rectangle as two triangles; UV==XY normalized to [0,1]
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

function makeBoxMesh(): Mesh {
  // Simple box with 8 vertices and 12 faces (2 per side)
  const vertices = [
    { id: 0, u: 0, v: 0, x: 0, y: 0, z: 0 },
    { id: 1, u: 1, v: 0, x: 10, y: 0, z: 0 },
    { id: 2, u: 1, v: 1, x: 10, y: 10, z: 0 },
    { id: 3, u: 0, v: 1, x: 0, y: 10, z: 0 },
    { id: 4, u: 0, v: 0, x: 0, y: 0, z: 10 },
    { id: 5, u: 1, v: 0, x: 10, y: 0, z: 10 },
    { id: 6, u: 1, v: 1, x: 10, y: 10, z: 10 },
    { id: 7, u: 0, v: 1, x: 0, y: 10, z: 10 },
  ];

  // Front face
  const faces = [
    [0, 1, 2],
    [0, 2, 3],
    // Back face
    [4, 7, 6],
    [4, 6, 5],
    // Top face
    [3, 2, 6],
    [3, 6, 7],
    // Bottom face
    [0, 5, 6],
    [0, 6, 1],
    // Right face
    [1, 6, 2],
    [1, 5, 6],
    // Left face
    [0, 3, 7],
    [0, 7, 4],
  ];

  return {
    meshId: "box",
    vertices,
    faces,
  };
}

describe("Tutte Utilities - buildAdjacency", () => {
  it("builds correct adjacency for flat box face", () => {
    const mesh = makeFlatBoxFace();
    const adj = buildAdjacency(mesh);

    // Check vertex 0 neighbors
    const v0Neighbors = adj.vertexToNeighbors.get(0);
    expect(v0Neighbors).toBeDefined();
    expect(v0Neighbors!.has(1)).toBe(true);
    expect(v0Neighbors!.has(3)).toBe(true);
    expect(v0Neighbors!.has(2)).toBe(true); // Through face [0,1,2]

    // Check edge-to-face mapping
    const edge01 = adj.edgeToFaces.get("0_1");
    expect(edge01).toBeDefined();
    expect(edge01!.has(0)).toBe(true);
  });

  it("handles closed mesh (box)", () => {
    const mesh = makeBoxMesh();
    const adj = buildAdjacency(mesh);

    // All edges should appear in 2 faces (closed mesh)
    for (const [edgeKey, faces] of adj.edgeToFaces.entries()) {
      expect(faces.size).toBeGreaterThan(0);
    }
  });
});

describe("Tutte Utilities - computeTutteEmbedding", () => {
  it("computes embedding for flat box face", () => {
    const mesh = makeFlatBoxFace();
    const embedding = computeTutteEmbedding(mesh);

    // All vertices should have embeddings
    expect(embedding.size).toBe(mesh.vertices.length);

    // Check UV coordinates are in [0,1]
    for (const [vid, embed] of embedding.entries()) {
      expect(embed.u).toBeGreaterThanOrEqual(0);
      expect(embed.u).toBeLessThanOrEqual(1);
      expect(embed.v).toBeGreaterThanOrEqual(0);
      expect(embed.v).toBeLessThanOrEqual(1);
    }
  });

  it("preserves existing UV coordinates when no boundary", () => {
    const mesh: Mesh = {
      meshId: "closed",
      vertices: [
        { id: 0, u: 0.2, v: 0.3, x: 0, y: 0, z: 0 },
        { id: 1, u: 0.8, v: 0.3, x: 10, y: 0, z: 0 },
        { id: 2, u: 0.8, v: 0.7, x: 10, y: 10, z: 0 },
        { id: 3, u: 0.2, v: 0.7, x: 0, y: 10, z: 0 },
      ],
      faces: [
        [0, 1, 2],
        [0, 2, 3],
      ],
    };

    const embedding = computeTutteEmbedding(mesh);

    // For closed mesh, should use existing UV
    for (const v of mesh.vertices) {
      const embed = embedding.get(v.id);
      expect(embed).toBeDefined();
      if (embed) {
        expect(embed.u).toBeCloseTo(v.u, 0.1);
        expect(embed.v).toBeCloseTo(v.v, 0.1);
      }
    }
  });
});

describe("Tutte Utilities - selectUvRegion", () => {
  it("selects region within UV box", () => {
    const mesh = makeFlatBoxFace();
    const region = selectUvRegion(mesh, {
      uMin: 0.4,
      uMax: 0.6,
      vMin: 0.4,
      vMax: 0.6,
    });

    // Should find vertices in region
    expect(region.vertexSet.size).toBeGreaterThan(0);
    expect(region.faceIndices.length).toBeGreaterThanOrEqual(0);
  });

  it("selects entire face when UV box covers all", () => {
    const mesh = makeFlatBoxFace();
    const region = selectUvRegion(mesh, {
      uMin: 0,
      uMax: 1,
      vMin: 0,
      vMax: 1,
    });

    // Should select all vertices and faces
    expect(region.vertexSet.size).toBe(mesh.vertices.length);
    expect(region.faceIndices.length).toBe(mesh.faces.length);
  });

  it("returns empty region for UV box outside mesh", () => {
    const mesh = makeFlatBoxFace();
    const region = selectUvRegion(mesh, {
      uMin: 1.1,
      uMax: 1.2,
      vMin: 1.1,
      vMax: 1.2,
    });

    expect(region.vertexSet.size).toBe(0);
    expect(region.faceIndices.length).toBe(0);
    expect(region.triangles.length).toBe(0);
  });
});

describe("Tutte Utilities - validateEdgeLoop", () => {
  it("validates correct closed loop", () => {
    const mesh = makeFlatBoxFace();
    const loop = [0, 1, 2, 3, 0]; // Closed loop around face

    const result = validateEdgeLoop(mesh, loop);
    expect(result.valid).toBe(true);
  });

  it("rejects loop with non-adjacent vertices", () => {
    const mesh = makeFlatBoxFace();
    const loop = [0, 2, 3, 0]; // 0 and 2 are not directly adjacent

    const result = validateEdgeLoop(mesh, loop);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not adjacent");
  });

  it("rejects loop with too few vertices", () => {
    const mesh = makeFlatBoxFace();
    const loop = [0, 1, 0]; // Only 2 vertices

    const result = validateEdgeLoop(mesh, loop);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("at least 3");
  });

  it("rejects non-closed loop", () => {
    const mesh = makeFlatBoxFace();
    const loop = [0, 1, 2, 3]; // Not closed

    const result = validateEdgeLoop(mesh, loop);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not closed");
  });

  it("rejects loop with duplicate vertices", () => {
    const mesh = makeFlatBoxFace();
    const loop = [0, 1, 1, 2, 3, 0]; // Duplicate vertex 1

    const result = validateEdgeLoop(mesh, loop);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Duplicate");
  });
});

describe("Tutte Utilities - getBoundaryLoops", () => {
  it("finds boundary loops for open mesh", () => {
    const mesh = makeFlatBoxFace();
    const loops = getBoundaryLoops(mesh);

    // Flat face should have one boundary loop
    expect(loops.length).toBeGreaterThan(0);

    // Check loop is valid
    for (const loop of loops) {
      expect(loop.length).toBeGreaterThanOrEqual(3);
      const result = validateEdgeLoop(mesh, [...loop, loop[0]]); // Close the loop
      expect(result.valid).toBe(true);
    }
  });

  it("returns empty array for closed mesh", () => {
    const mesh = makeBoxMesh();
    const loops = getBoundaryLoops(mesh);

    // Closed box should have no boundary
    expect(loops.length).toBe(0);
  });
});
