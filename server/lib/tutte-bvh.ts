/**
 * BVH (Bounding Volume Hierarchy) for efficient UV triangle queries
 * Used for barycentric lift (UV -> XYZ)
 */

import type { Mesh, MeshVertex } from "./shape-operations";

export interface BVHNode {
  bounds: { uMin: number; uMax: number; vMin: number; vMax: number };
  triangles: number[]; // Triangle indices
  left?: BVHNode;
  right?: BVHNode;
}

export interface UVTriangle {
  id: number; // Triangle index
  uv: [[number, number], [number, number], [number, number]];
  xyz: [[number, number, number], [number, number, number], [number, number, number]];
}

/**
 * Build BVH for UV triangles
 */
export function buildUVTriangleBVH(
  mesh: Mesh,
  embedding: Map<number, { u: number; v: number }>
): BVHNode {
  // Build triangle list with UV bounds
  const triangles: Array<{
    id: number;
    bounds: { uMin: number; uMax: number; vMin: number; vMax: number };
    uv: [[number, number], [number, number], [number, number]];
    xyz: [[number, number, number], [number, number, number], [number, number, number]];
  }> = [];

  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    if (face.length < 3) continue;

    // Get UV coordinates
    const uv0 = embedding.get(face[0]);
    const uv1 = embedding.get(face[1]);
    const uv2 = embedding.get(face[2]);

    if (!uv0 || !uv1 || !uv2) continue;

    const uv: [[number, number], [number, number], [number, number]] = [
      [uv0.u, uv0.v],
      [uv1.u, uv1.v],
      [uv2.u, uv2.v],
    ];

    // Get XYZ coordinates
    const v0 = mesh.vertices[face[0]];
    const v1 = mesh.vertices[face[1]];
    const v2 = mesh.vertices[face[2]];

    const xyz: [[number, number, number], [number, number, number], [number, number, number]] =
      [
        [v0.x, v0.y, v0.z],
        [v1.x, v1.y, v1.z],
        [v2.x, v2.y, v2.z],
      ];

    // Compute bounds
    const uMin = Math.min(uv[0][0], uv[1][0], uv[2][0]);
    const uMax = Math.max(uv[0][0], uv[1][0], uv[2][0]);
    const vMin = Math.min(uv[0][1], uv[1][1], uv[2][1]);
    const vMax = Math.max(uv[0][1], uv[1][1], uv[2][1]);

    triangles.push({
      id: fi,
      bounds: { uMin, uMax, vMin, vMax },
      uv,
      xyz,
    });
  }

  // Build BVH recursively
  return buildBVHRecursive(triangles, 0);
}

function buildBVHRecursive(
  triangles: Array<{
    id: number;
    bounds: { uMin: number; uMax: number; vMin: number; vMax: number };
    uv: [[number, number], [number, number], [number, number]];
    xyz: [[number, number, number], [number, number, number], [number, number, number]];
  }>,
  depth: number,
  maxDepth: number = 10,
  maxTrianglesPerLeaf: number = 4
): BVHNode {
  if (triangles.length === 0) {
    return {
      bounds: { uMin: 0, uMax: 1, vMin: 0, vMax: 1 },
      triangles: [],
    };
  }

  // Compute overall bounds
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;

  for (const tri of triangles) {
    uMin = Math.min(uMin, tri.bounds.uMin);
    uMax = Math.max(uMax, tri.bounds.uMax);
    vMin = Math.min(vMin, tri.bounds.vMin);
    vMax = Math.max(vMax, tri.bounds.vMax);
  }

  const bounds = { uMin, uMax, vMin, vMax };

  // Leaf node if small enough or max depth
  if (
    triangles.length <= maxTrianglesPerLeaf ||
    depth >= maxDepth
  ) {
    return {
      bounds,
      triangles: triangles.map((t) => t.id),
    };
  }

  // Split along longest axis
  const uSpan = uMax - uMin;
  const vSpan = vMax - vMin;
  const splitAxis = uSpan > vSpan ? "u" : "v";
  const splitPos = splitAxis === "u" ? (uMin + uMax) / 2 : (vMin + vMax) / 2;

  // Partition triangles
  const left: typeof triangles = [];
  const right: typeof triangles = [];

  for (const tri of triangles) {
    const triCenter =
      splitAxis === "u"
        ? (tri.bounds.uMin + tri.bounds.uMax) / 2
        : (tri.bounds.vMin + tri.bounds.vMax) / 2;

    if (triCenter < splitPos) {
      left.push(tri);
    } else {
      right.push(tri);
    }
  }

  // If partition failed, make leaf
  if (left.length === 0 || right.length === 0) {
    return {
      bounds,
      triangles: triangles.map((t) => t.id),
    };
  }

  // Recurse
  return {
    bounds,
    triangles: [],
    left: buildBVHRecursive(left, depth + 1, maxDepth, maxTrianglesPerLeaf),
    right: buildBVHRecursive(right, depth + 1, maxDepth, maxTrianglesPerLeaf),
  };
}

/**
 * Query BVH for triangles containing UV point
 */
export function queryBVH(
  node: BVHNode,
  u: number,
  v: number,
  mesh: Mesh,
  embedding: Map<number, { u: number; v: number }>
): UVTriangle[] {
  const results: UVTriangle[] = [];

  // Check bounds
  if (
    u < node.bounds.uMin ||
    u > node.bounds.uMax ||
    v < node.bounds.vMin ||
    v > node.bounds.vMax
  ) {
    return results;
  }

  // Leaf node: test triangles
  if (node.triangles.length > 0) {
    for (const fi of node.triangles) {
      const face = mesh.faces[fi];
      if (face.length < 3) continue;

      const uv0 = embedding.get(face[0]);
      const uv1 = embedding.get(face[1]);
      const uv2 = embedding.get(face[2]);

      if (!uv0 || !uv1 || !uv2) continue;

      // Barycentric test
      const uv: [[number, number], [number, number], [number, number]] = [
        [uv0.u, uv0.v],
        [uv1.u, uv1.v],
        [uv2.u, uv2.v],
      ];

      if (pointInTriangleUV([u, v], uv[0], uv[1], uv[2])) {
        const v0 = mesh.vertices[face[0]];
        const v1 = mesh.vertices[face[1]];
        const v2 = mesh.vertices[face[2]];

        results.push({
          id: fi,
          uv,
          xyz: [
            [v0.x, v0.y, v0.z],
            [v1.x, v1.y, v1.z],
            [v2.x, v2.y, v2.z],
          ],
        });
      }
    }
    return results;
  }

  // Internal node: recurse
  if (node.left) {
    results.push(...queryBVH(node.left, u, v, mesh, embedding));
  }
  if (node.right) {
    results.push(...queryBVH(node.right, u, v, mesh, embedding));
  }

  return results;
}

function pointInTriangleUV(
  p: [number, number],
  v0: [number, number],
  v1: [number, number],
  v2: [number, number]
): boolean {
  const v0v1 = [v1[0] - v0[0], v1[1] - v0[1]];
  const v0v2 = [v2[0] - v0[0], v2[1] - v0[1]];
  const v0p = [p[0] - v0[0], p[1] - v0[1]];

  const dot00 = v0v2[0] * v0v2[0] + v0v2[1] * v0v2[1];
  const dot01 = v0v2[0] * v0v1[0] + v0v2[1] * v0v1[1];
  const dot02 = v0v2[0] * v0p[0] + v0v2[1] * v0p[1];
  const dot11 = v0v1[0] * v0v1[0] + v0v1[1] * v0v1[1];
  const dot12 = v0v1[0] * v0p[0] + v0v1[1] * v0p[1];

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  return u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6;
}

/**
 * Lift UV point to XYZ using BVH
 */
export function liftUvToXyzBVH(
  bvh: BVHNode,
  mesh: Mesh,
  embedding: Map<number, { u: number; v: number }>,
  u: number,
  v: number
): [number, number, number] | null {
  const triangles = queryBVH(bvh, u, v, mesh, embedding);

  if (triangles.length === 0) {
    return null;
  }

  // Use first triangle found
  const tri = triangles[0];

  // Barycentric coordinates
  const [v0, v1, v2] = tri.uv;
  const v0v1 = [v1[0] - v0[0], v1[1] - v0[1]];
  const v0v2 = [v2[0] - v0[0], v2[1] - v0[1]];
  const v0p = [u - v0[0], v - v0[1]];

  const dot00 = v0v2[0] * v0v2[0] + v0v2[1] * v0v2[1];
  const dot01 = v0v2[0] * v0v1[0] + v0v2[1] * v0v1[1];
  const dot02 = v0v2[0] * v0p[0] + v0v2[1] * v0p[1];
  const dot11 = v0v1[0] * v0v1[0] + v0v1[1] * v0v1[1];
  const dot12 = v0v1[0] * v0p[0] + v0v1[1] * v0p[1];

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const w0 = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const w1 = (dot00 * dot12 - dot01 * dot02) * invDenom;
  const w2 = 1 - w0 - w1;

  // Interpolate XYZ
  const [xyz0, xyz1, xyz2] = tri.xyz;
  const x = w0 * xyz0[0] + w1 * xyz1[0] + w2 * xyz2[0];
  const y = w0 * xyz0[1] + w1 * xyz1[1] + w2 * xyz2[1];
  const z = w0 * xyz0[2] + w1 * xyz1[2] + w2 * xyz2[2];

  return [x, y, z];
}
