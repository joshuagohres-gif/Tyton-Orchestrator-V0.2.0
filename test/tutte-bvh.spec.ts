import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildUVTriangleBVH,
  queryBVH,
  liftUvToXyzBVH,
} from "../server/lib/tutte-bvh";
import { computeTutteEmbeddingRobust } from "../server/lib/tutte";
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

describe("BVH Spatial Index", () => {
  it("builds BVH for UV triangles", () => {
    const mesh = makeFlatBoxFace();
    const embedding = computeTutteEmbeddingRobust(mesh);
    const bvh = buildUVTriangleBVH(mesh, embedding.uv);

    expect(bvh).toBeDefined();
    expect(bvh.bounds).toBeDefined();
    expect(bvh.bounds.uMin).toBeGreaterThanOrEqual(0);
    expect(bvh.bounds.uMax).toBeLessThanOrEqual(1);
  });

  it("queries BVH for triangles containing UV point", () => {
    const mesh = makeFlatBoxFace();
    const embedding = computeTutteEmbeddingRobust(mesh);
    const bvh = buildUVTriangleBVH(mesh, embedding.uv);

    // Query center of mesh
    const triangles = queryBVH(bvh, 0.5, 0.5, mesh, embedding.uv);
    expect(triangles.length).toBeGreaterThan(0);
  });

  it("lifts UV to XYZ using BVH", () => {
    const mesh = makeFlatBoxFace();
    const embedding = computeTutteEmbeddingRobust(mesh);
    const bvh = buildUVTriangleBVH(mesh, embedding.uv);

    // Lift center point
    const xyz = liftUvToXyzBVH(bvh, mesh, embedding.uv, 0.5, 0.5);
    expect(xyz).not.toBeNull();
    if (xyz) {
      expect(xyz.length).toBe(3);
      expect(typeof xyz[0]).toBe("number");
      expect(typeof xyz[1]).toBe("number");
      expect(typeof xyz[2]).toBe("number");
    }
  });

  it("returns null for UV point outside mesh", () => {
    const mesh = makeFlatBoxFace();
    const embedding = computeTutteEmbeddingRobust(mesh);
    const bvh = buildUVTriangleBVH(mesh, embedding.uv);

    // Query point outside
    const xyz = liftUvToXyzBVH(bvh, mesh, embedding.uv, 1.5, 1.5);
    expect(xyz).toBeNull();
  });
});
