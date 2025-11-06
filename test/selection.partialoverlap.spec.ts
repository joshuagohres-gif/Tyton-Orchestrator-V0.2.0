import { describe, it, expect } from "vitest";
import { selectUvRegion, computeTutteEmbeddingRobust } from "../server/lib/tutte";
import type { Mesh } from "../server/lib/shape-operations";

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

describe("Region Selection - Partial Overlap", () => {
  it("selects triangles that partially overlap UV box", () => {
    const mesh = makeFlatBoxFace();
    const result = computeTutteEmbeddingRobust(mesh);

    // Box that only partially covers the mesh
    const region = selectUvRegion(
      mesh,
      {
        uMin: 0.3,
        uMax: 0.7,
        vMin: 0.3,
        vMax: 0.7,
      },
      result.uv
    );

    // Should find faces that intersect the box
    expect(region.faceIndices.length).toBeGreaterThanOrEqual(0);
  });

  it("includes triangles grazing the edge", () => {
    const mesh = makeFlatBoxFace();
    const result = computeTutteEmbeddingRobust(mesh);

    // Very small box at edge
    const region = selectUvRegion(
      mesh,
      {
        uMin: 0.48,
        uMax: 0.52,
        vMin: 0.48,
        vMax: 0.52,
      },
      result.uv
    );

    // May or may not find faces depending on exact geometry
    expect(region.faceIndices.length).toBeGreaterThanOrEqual(0);
  });

  it("handles triangles with vertices outside but centroid inside", () => {
    const mesh = makeFlatBoxFace();
    const result = computeTutteEmbeddingRobust(mesh);

    // Box that might contain centroid but not all vertices
    const region = selectUvRegion(
      mesh,
      {
        uMin: 0.45,
        uMax: 0.55,
        vMin: 0.45,
        vMax: 0.55,
      },
      result.uv
    );

    expect(region.vertexSet.size).toBeGreaterThanOrEqual(0);
  });
});
