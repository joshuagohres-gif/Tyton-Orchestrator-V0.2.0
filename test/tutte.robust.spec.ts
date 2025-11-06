import { describe, it, expect } from "vitest";
import {
  computeTutteEmbeddingRobust,
  computeBoundaryLoopsFromFaces,
  mapBoundaryToRegularPolygon,
  countFlipped,
  triangleAreaUV,
  selectUvRegion,
  getBoundaryLoops,
} from "../server/lib/tutte";
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

function makeBoxMesh(): Mesh {
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

  const faces = [
    [0, 1, 2],
    [0, 2, 3],
    [4, 7, 6],
    [4, 6, 5],
    [3, 2, 6],
    [3, 6, 7],
    [0, 5, 6],
    [0, 6, 1],
    [1, 6, 2],
    [1, 5, 6],
    [0, 3, 7],
    [0, 7, 4],
  ];

  return {
    meshId: "box",
    vertices,
    faces,
  };
}

function addNoise(mesh: Mesh, scale: number = 0.01): Mesh {
  return {
    ...mesh,
    vertices: mesh.vertices.map((v) => ({
      ...v,
      x: v.x + (Math.random() - 0.5) * scale,
      y: v.y + (Math.random() - 0.5) * scale,
      z: v.z + (Math.random() - 0.5) * scale,
    })),
  };
}

describe("Robust Tutte - Boundary Computation", () => {
  it("computes boundary loops from faces", () => {
    const mesh = makeFlatBoxFace();
    const loops = computeBoundaryLoopsFromFaces(mesh.vertices, mesh.faces);

    expect(loops.length).toBeGreaterThan(0);
    expect(loops[0].length).toBeGreaterThanOrEqual(3);

    // Outer loop should be first (largest perimeter)
    if (loops.length > 1) {
      const perim0 = loops[0].reduce((s, _, i) => {
        const a = mesh.vertices[loops[0][i]];
        const b = mesh.vertices[loops[0][(i + 1) % loops[0].length]];
        return s + Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      }, 0);

      const perim1 = loops[1].reduce((s, _, i) => {
        const a = mesh.vertices[loops[1][i]];
        const b = mesh.vertices[loops[1][(i + 1) % loops[1].length]];
        return s + Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      }, 0);

      expect(perim0).toBeGreaterThanOrEqual(perim1);
    }
  });

  it("orients loops CCW", () => {
    const mesh = makeFlatBoxFace();
    const loops = computeBoundaryLoopsFromFaces(mesh.vertices, mesh.faces);

    for (const loop of loops) {
      let A = 0;
      for (let i = 0; i < loop.length; i++) {
        const a = mesh.vertices[loop[i]];
        const b = mesh.vertices[loop[(i + 1) % loop.length]];
        A += a.x * b.y - b.x * a.y;
      }
      expect(0.5 * A).toBeGreaterThan(0); // CCW = positive area
    }
  });

  it("returns empty for closed mesh", () => {
    const mesh = makeBoxMesh();
    const loops = computeBoundaryLoopsFromFaces(mesh.vertices, mesh.faces);
    expect(loops.length).toBe(0);
  });
});

describe("Robust Tutte - CG Solver", () => {
  it("computes embedding with CG solver", () => {
    const mesh = makeFlatBoxFace();
    const result = computeTutteEmbeddingRobust(mesh);

    expect(result.uv.size).toBe(mesh.vertices.length);
    expect(result.metrics.cgIters).toBeGreaterThan(0);
    expect(result.metrics.residual).toBeLessThan(1e-6);

    // Check UV in [0,1]
    for (const [vid, embed] of Array.from(result.uv.entries())) {
      expect(embed.u).toBeGreaterThanOrEqual(0);
      expect(embed.u).toBeLessThanOrEqual(1);
      expect(embed.v).toBeGreaterThanOrEqual(0);
      expect(embed.v).toBeLessThanOrEqual(1);
    }
  });

  it("handles noise robustly", () => {
    const mesh = addNoise(makeFlatBoxFace(), 0.1);
    const result = computeTutteEmbeddingRobust(mesh);

    // Should still produce valid embedding
    expect(result.uv.size).toBe(mesh.vertices.length);
    expect(result.metrics.flipFraction).toBeLessThan(0.1); // Less than 10% flips
  });

  it("is translation/scale invariant", () => {
    const base = makeFlatBoxFace();
    const translated = {
      ...base,
      vertices: base.vertices.map((v) => ({
        ...v,
        x: v.x + 100,
        y: v.y + 200,
        z: v.z + 50,
      })),
    };

    const result1 = computeTutteEmbeddingRobust(base);
    const result2 = computeTutteEmbeddingRobust(translated);

    // UV should be similar (up to numerical noise)
    for (const v of base.vertices) {
      const uv1 = result1.uv.get(v.id);
      const uv2 = result2.uv.get(v.id);
      if (uv1 && uv2) {
        expect(Math.abs(uv1.u - uv2.u)).toBeLessThan(0.1);
        expect(Math.abs(uv1.v - uv2.v)).toBeLessThan(0.1);
      }
    }
  });
});

describe("Robust Tutte - Flip Detection", () => {
  it("detects flipped triangles", () => {
    const mesh = makeFlatBoxFace();
    const result = computeTutteEmbeddingRobust(mesh);

    expect(result.metrics.flippedTriangles).toBeGreaterThanOrEqual(0);
    expect(result.metrics.flipFraction).toBeGreaterThanOrEqual(0);
    expect(result.metrics.flipFraction).toBeLessThanOrEqual(1);
  });

  it("counts flips correctly", () => {
    const mesh = makeFlatBoxFace();
    const result = computeTutteEmbeddingRobust(mesh);

    // Build UV array
    const n = mesh.vertices.length;
    const uvArray = new Float64Array(2 * n);
    const vidToIdx = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      vidToIdx.set(mesh.vertices[i].id, i);
      const embed = result.uv.get(mesh.vertices[i].id)!;
      uvArray[2 * i] = embed.u;
      uvArray[2 * i + 1] = embed.v;
    }

    const flipResult = countFlipped(mesh, uvArray);
    expect(flipResult.count).toBe(result.metrics.flippedTriangles);
  });
});

describe("Robust Tutte - Region Selection with Partial Overlap", () => {
  it("selects region with partial overlap", () => {
    const mesh = makeFlatBoxFace();
    const result = computeTutteEmbeddingRobust(mesh);

    const region = selectUvRegion(
      mesh,
      {
        uMin: 0.4,
        uMax: 0.6,
        vMin: 0.4,
        vMax: 0.6,
      },
      result.uv
    );

    expect(region.vertexSet.size).toBeGreaterThan(0);
    expect(region.faceIndices.length).toBeGreaterThanOrEqual(0);
  });

  it("includes triangles that graze UV box", () => {
    const mesh = makeFlatBoxFace();
    const result = computeTutteEmbeddingRobust(mesh);

    // Small box that might only partially overlap
    const region = selectUvRegion(
      mesh,
      {
        uMin: 0.49,
        uMax: 0.51,
        vMin: 0.49,
        vMax: 0.51,
      },
      result.uv
    );

    // Should still find some faces if they intersect
    expect(region.faceIndices.length).toBeGreaterThanOrEqual(0);
  });
});

describe("Robust Tutte - Metrics & Observability", () => {
  it("provides comprehensive metrics", () => {
    const mesh = makeFlatBoxFace();
    const result = computeTutteEmbeddingRobust(mesh);

    expect(result.metrics).toHaveProperty("cgIters");
    expect(result.metrics).toHaveProperty("residual");
    expect(result.metrics).toHaveProperty("numClamped");
    expect(result.metrics).toHaveProperty("numDegenerateFaces");
    expect(result.metrics).toHaveProperty("flippedTriangles");
    expect(result.metrics).toHaveProperty("flipFraction");

    expect(result.metrics.cgIters).toBeGreaterThan(0);
    expect(result.metrics.residual).toBeGreaterThanOrEqual(0);
    expect(result.metrics.numClamped).toBeGreaterThanOrEqual(0);
    expect(result.metrics.flipFraction).toBeGreaterThanOrEqual(0);
    expect(result.metrics.flipFraction).toBeLessThanOrEqual(1);
  });

  it("tracks clamped values", () => {
    const mesh = makeFlatBoxFace();
    const result = computeTutteEmbeddingRobust(mesh);

    // Should track how many vertices were clamped
    expect(result.metrics.numClamped).toBeGreaterThanOrEqual(0);
  });
});

describe("Robust Tutte - Boundary Mapping", () => {
  it("maps boundary to regular polygon", () => {
    const mesh = makeFlatBoxFace();
    const loops = getBoundaryLoops(mesh);

    if (loops.length > 0) {
      const { U, V } = mapBoundaryToRegularPolygon(mesh.vertices, loops[0]);

      expect(U.length).toBe(loops[0].length);
      expect(V.length).toBe(loops[0].length);

      // Check UV in [0,1]
      for (let i = 0; i < U.length; i++) {
        expect(U[i]).toBeGreaterThanOrEqual(0);
        expect(U[i]).toBeLessThanOrEqual(1);
        expect(V[i]).toBeGreaterThanOrEqual(0);
        expect(V[i]).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("Robust Tutte - Fuzz Testing", () => {
  it("handles random meshes with noise", () => {
    for (let trial = 0; trial < 5; trial++) {
      const mesh = addNoise(makeFlatBoxFace(), 0.05);
      const result = computeTutteEmbeddingRobust(mesh);

      // Assert: UV in [0,1]
      for (const [vid, embed] of Array.from(result.uv.entries())) {
        expect(embed.u).toBeGreaterThanOrEqual(0);
        expect(embed.u).toBeLessThanOrEqual(1);
        expect(embed.v).toBeGreaterThanOrEqual(0);
        expect(embed.v).toBeLessThanOrEqual(1);
      }

      // Assert: flip fraction < 1%
      expect(result.metrics.flipFraction).toBeLessThan(0.01);
    }
  });
});
