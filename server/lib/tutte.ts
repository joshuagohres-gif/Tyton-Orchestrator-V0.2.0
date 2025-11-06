/**
 * Tutte-based utilities for mesh processing
 * 
 * Provides adjacency building, UV embedding (disk topology MVP),
 * region selection, and edge loop validation for planar geometry operations.
 */

import type { Mesh, MeshVertex } from "./shape-operations";

export interface AdjacencyMap {
  vertexToNeighbors: Map<number, Set<number>>;
  edgeToFaces: Map<string, Set<number>>;
}

export interface TutteEmbedding {
  u: number;
  v: number;
}

/**
 * Build adjacency structure from mesh
 * Returns vertex-to-neighbors map and edge-to-faces map
 */
export function buildAdjacency(mesh: Mesh): AdjacencyMap {
  const vertexToNeighbors = new Map<number, Set<number>>();
  const edgeToFaces = new Map<string, Set<number>>();

  // Initialize vertex sets
  for (const v of mesh.vertices) {
    vertexToNeighbors.set(v.id, new Set());
  }

  // Process each face
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    const n = face.length;

    for (let i = 0; i < n; i++) {
      const a = face[i];
      const b = face[(i + 1) % n];

      // Add to adjacency
      vertexToNeighbors.get(a)!.add(b);
      vertexToNeighbors.get(b)!.add(a);

      // Track edge-to-face mapping
      const edgeKey = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (!edgeToFaces.has(edgeKey)) {
        edgeToFaces.set(edgeKey, new Set());
      }
      edgeToFaces.get(edgeKey)!.add(fi);
    }
  }

  return { vertexToNeighbors, edgeToFaces };
}

/**
 * Compute Tutte embedding for disk topology (MVP)
 * Maps mesh vertices to unit disk [0,1] x [0,1] UV space
 * 
 * Uses simple boundary mapping: boundary vertices mapped to unit square boundary,
 * interior vertices computed via harmonic weights (simplified Laplacian).
 */
export function computeTutteEmbedding(mesh: Mesh): Map<number, TutteEmbedding> {
  const embedding = new Map<number, TutteEmbedding>();
  const adj = buildAdjacency(mesh);

  // Identify boundary vertices
  const boundaryVerts = new Set<number>();
  const boundaryEdges = new Set<string>();

  // Find boundary edges (edges that appear in only one face)
  for (const [edgeKey, faces] of Array.from(adj.edgeToFaces.entries())) {
    if (faces.size === 1) {
      boundaryEdges.add(edgeKey);
      const [a, b] = edgeKey.split("_").map(Number);
      boundaryVerts.add(a);
      boundaryVerts.add(b);
    }
  }

  // If no boundary found, assume all vertices are interior (closed mesh)
  // In that case, use existing UV coordinates if available
  if (boundaryVerts.size === 0) {
    for (const v of mesh.vertices) {
      embedding.set(v.id, { u: v.u, v: v.v });
    }
    return embedding;
  }

  // Map boundary vertices to unit square boundary
  const boundaryList = Array.from(boundaryVerts);
  const boundaryMap = new Map<number, TutteEmbedding>();

  // Simple boundary mapping: walk boundary and map to square perimeter
  // For now, use a simple approach: map boundary vertices proportionally
  const boundaryCount = boundaryList.length;
  for (let i = 0; i < boundaryCount; i++) {
    const vid = boundaryList[i];
    const t = i / boundaryCount;
    let u: number, v: number;

    // Map to square perimeter
    if (t < 0.25) {
      // Top edge
      u = t * 4;
      v = 1;
    } else if (t < 0.5) {
      // Right edge
      u = 1;
      v = 1 - (t - 0.25) * 4;
    } else if (t < 0.75) {
      // Bottom edge
      u = 1 - (t - 0.5) * 4;
      v = 0;
    } else {
      // Left edge
      u = 0;
      v = (t - 0.75) * 4;
    }

    boundaryMap.set(vid, { u, v });
    embedding.set(vid, { u, v });
  }

  // Compute interior vertices using harmonic weights (simplified)
  // For interior vertex v: u(v) = average of neighbors' u coordinates
  const interiorVerts = mesh.vertices
    .filter(v => !boundaryVerts.has(v.id))
    .map(v => v.id);

  // Initialize interior vertices with existing UV or center
  for (const vid of interiorVerts) {
    const v = mesh.vertices[vid];
    embedding.set(vid, { u: v.u ?? 0.5, v: v.v ?? 0.5 });
  }

  // Iterative relaxation (Gauss-Seidel style)
  const maxIterations = 100;
  const tolerance = 1e-6;

  for (let iter = 0; iter < maxIterations; iter++) {
    let maxChange = 0;

    for (const vid of interiorVerts) {
      const neighbors = Array.from(adj.vertexToNeighbors.get(vid)!);
      if (neighbors.length === 0) continue;

      let uSum = 0;
      let vSum = 0;
      let count = 0;

      for (const nid of neighbors) {
        const nEmbed = embedding.get(nid);
        if (nEmbed) {
          uSum += nEmbed.u;
          vSum += nEmbed.v;
          count++;
        }
      }

      if (count > 0) {
        const newU = uSum / count;
        const newV = vSum / count;
        const oldEmbed = embedding.get(vid)!;
        const change = Math.max(
          Math.abs(newU - oldEmbed.u),
          Math.abs(newV - oldEmbed.v)
        );
        maxChange = Math.max(maxChange, change);
        embedding.set(vid, { u: newU, v: newV });
      }
    }

    if (maxChange < tolerance) break;
  }

  // Clamp to [0,1] range
  for (const [vid, embed] of Array.from(embedding.entries())) {
    embedding.set(vid, {
      u: Math.max(0, Math.min(1, embed.u)),
      v: Math.max(0, Math.min(1, embed.v)),
    });
  }

  return embedding;
}

/**
 * Select UV region from mesh based on UV box
 * Returns set of vertex IDs and face indices within the UV box
 */
export function selectUvRegion(
  mesh: Mesh,
  uvBox: { uMin: number; uMax: number; vMin: number; vMax: number }
): {
  vertexSet: Set<number>;
  faceIndices: number[];
  triangles: Array<[number, number, number]>;
} {
  const vertexSet = new Set<number>();

  // Find vertices within UV box
  for (const v of mesh.vertices) {
    if (
      v.u >= uvBox.uMin &&
      v.u <= uvBox.uMax &&
      v.v >= uvBox.vMin &&
      v.v <= uvBox.vMax
    ) {
      vertexSet.add(v.id);
    }
  }

  // Find faces where all vertices are in the region
  const faceIndices: number[] = [];
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    if (face.every((vid) => vertexSet.has(vid))) {
      faceIndices.push(fi);
    }
  }

  // Convert faces to triangles
  const triangles: Array<[number, number, number]> = [];
  for (const fi of faceIndices) {
    const face = mesh.faces[fi];
    if (face.length === 3) {
      triangles.push([face[0], face[1], face[2]]);
    } else {
      // Simple fan triangulation
      for (let i = 1; i < face.length - 1; i++) {
        triangles.push([face[0], face[i], face[i + 1]]);
      }
    }
  }

  return { vertexSet, faceIndices, triangles };
}

/**
 * Validate edge loop
 * Checks if a sequence of vertex IDs forms a valid closed loop
 * Returns true if valid, false otherwise
 */
export function validateEdgeLoop(
  mesh: Mesh,
  loop: number[]
): { valid: boolean; reason?: string } {
  if (loop.length < 3) {
    return { valid: false, reason: "Loop must have at least 3 vertices" };
  }

  const adj = buildAdjacency(mesh);

  // Check that consecutive vertices are adjacent
  for (let i = 0; i < loop.length; i++) {
    const curr = loop[i];
    const next = loop[(i + 1) % loop.length];

    const neighbors = adj.vertexToNeighbors.get(curr);
    if (!neighbors || !neighbors.has(next)) {
      return {
        valid: false,
        reason: `Vertices ${curr} and ${next} are not adjacent`,
      };
    }
  }

  // Check for duplicate vertices (except start/end)
  const seen = new Set<number>();
  for (let i = 0; i < loop.length - 1; i++) {
    if (seen.has(loop[i])) {
      return {
        valid: false,
        reason: `Duplicate vertex ${loop[i]} in loop`,
      };
    }
    seen.add(loop[i]);
  }

  // Check that loop is closed
  if (loop[0] !== loop[loop.length - 1]) {
    return { valid: false, reason: "Loop is not closed" };
  }

  return { valid: true };
}

/**
 * Get boundary loops from mesh
 * Returns array of boundary loops (each loop is an array of vertex IDs)
 */
export function getBoundaryLoops(mesh: Mesh): number[][] {
  const adj = buildAdjacency(mesh);
  const boundaryEdges = new Map<string, [number, number]>();

  // Find boundary edges
  for (const [edgeKey, faces] of Array.from(adj.edgeToFaces.entries())) {
    if (faces.size === 1) {
      const [a, b] = edgeKey.split("_").map(Number);
      boundaryEdges.set(edgeKey, [a, b]);
    }
  }

  if (boundaryEdges.size === 0) {
    return []; // Closed mesh, no boundary
  }

  // Build adjacency for boundary vertices
  const boundaryAdj = new Map<number, number[]>();
  for (const [a, b] of Array.from(boundaryEdges.values())) {
    if (!boundaryAdj.has(a)) boundaryAdj.set(a, []);
    if (!boundaryAdj.has(b)) boundaryAdj.set(b, []);
    boundaryAdj.get(a)!.push(b);
    boundaryAdj.get(b)!.push(a);
  }

  // Walk boundary loops
  const visited = new Set<string>();
  const loops: number[][] = [];

  for (const [start, neighbors] of Array.from(boundaryAdj.entries())) {
    for (const next of neighbors) {
      const edgeKey = start < next ? `${start}_${next}` : `${next}_${start}`;
      if (visited.has(edgeKey)) continue;

      // Start a new loop
      const loop: number[] = [start, next];
      visited.add(edgeKey);
      let prev = start;
      let curr = next;

      while (true) {
        const nexts = (boundaryAdj.get(curr) ?? []).filter((x) => x !== prev);
        if (nexts.length === 0) break;

        const nextV = nexts[0];
        const kk = curr < nextV ? `${curr}_${nextV}` : `${nextV}_${curr}`;
        if (visited.has(kk)) break;

        loop.push(nextV);
        visited.add(kk);
        prev = curr;
        curr = nextV;

        if (nextV === loop[0]) break; // Closed
      }

      // Ensure closed loop
      if (loop[0] === loop[loop.length - 1]) loop.pop();
      if (loop.length >= 3) loops.push(loop);
    }
  }

  return loops;
}
