/**
 * Robust Tutte-based utilities for mesh processing
 * 
 * Provides adjacency building, UV embedding with CG solver,
 * region selection with partial overlap, and edge loop validation.
 * Includes flip detection, numerical hygiene, and observability metrics.
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

export interface TutteMetrics {
  cgIters: number;
  residual: number;
  numClamped: number;
  numDegenerateFaces: number;
  flippedTriangles: number;
  flipFraction: number;
}

export interface TutteResult {
  uv: Map<number, TutteEmbedding>;
  boundaryVertices: Set<number>;
  adjacency: AdjacencyMap;
  flippedTriangles: number[];
  metrics: TutteMetrics;
}

// CSR (Compressed Sparse Row) matrix format
interface CSR {
  n: number;
  rowPtr: Uint32Array;
  colIdx: Uint32Array;
  vals: Float64Array;
}

// Edge key helper
const ekey = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

/**
 * Build adjacency structure from mesh
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
      const edgeKey = ekey(a, b);
      if (!edgeToFaces.has(edgeKey)) {
        edgeToFaces.set(edgeKey, new Set());
      }
      edgeToFaces.get(edgeKey)!.add(fi);
    }
  }

  return { vertexToNeighbors, edgeToFaces };
}

/**
 * Compute boundary loops from faces (robust, doesn't trust input boundaryLoops)
 * Returns loops oriented CCW, sorted by perimeter (largest first)
 */
export function computeBoundaryLoopsFromFaces(
  vertices: MeshVertex[],
  faces: number[][]
): number[][] {
  const edgeUse = new Map<string, { a: number; b: number; count: number }>();

  // Count edge usage
  for (const f of faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i];
      const b = f[(i + 1) % f.length];
      const k = ekey(a, b);
      const ent = edgeUse.get(k) ?? { a, b, count: 0 };
      ent.count += 1;
      edgeUse.set(k, ent);
    }
  }

  // Boundary edges are used once
  const adj = new Map<number, number[]>();
  for (const ent of Array.from(edgeUse.values())) {
    if (ent.count === 1) {
      if (!adj.has(ent.a)) adj.set(ent.a, []);
      if (!adj.has(ent.b)) adj.set(ent.b, []);
      adj.get(ent.a)!.push(ent.b);
      adj.get(ent.b)!.push(ent.a);
    }
  }

  // Walk loops
  const visited = new Set<string>();
  const loops: number[][] = [];

  for (const [start, nbrs] of Array.from(adj.entries())) {
    for (const n of nbrs) {
      const k = ekey(start, n);
      if (visited.has(k)) continue;

      const loop = [start, n];
      visited.add(k);
      let prev = start;
      let cur = n;

      while (true) {
        const nexts = (adj.get(cur) ?? []).filter((x) => x !== prev);
        if (!nexts.length) break;

        const nx = nexts[0];
        const kk = ekey(cur, nx);
        if (visited.has(kk)) break;

        loop.push(nx);
        visited.add(kk);
        prev = cur;
        cur = nx;

        if (nx === loop[0]) break; // Closed
      }

      if (loop.length >= 3) {
        // Remove duplicate start if present
        const cleaned = loop[0] === loop[loop.length - 1] ? loop.slice(0, -1) : loop;
        loops.push(cleaned);
      }
    }
  }

  // Orient loops CCW by signed area in XY projection
  const signedAreaXY = (L: number[]): number => {
    let A = 0;
    for (let i = 0; i < L.length; i++) {
      const a = vertices[L[i]];
      const b = vertices[L[(i + 1) % L.length]];
      A += a.x * b.y - b.x * a.y;
    }
    return 0.5 * A;
  };

  for (const L of loops) {
    if (signedAreaXY(L) < 0) L.reverse();
  }

  // Sort by perimeter (largest first - outer loop first)
  const perim = (L: number[]): number => {
    let s = 0;
    for (let i = 0; i < L.length; i++) {
      const a = vertices[L[i]];
      const b = vertices[L[(i + 1) % L.length]];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      s += Math.hypot(dx, dy, dz);
    }
    return s;
  };

  loops.sort((A, B) => perim(B) - perim(A));
  return loops;
}

/**
 * Map boundary to regular polygon (convex, arc-length parameterized)
 */
export function mapBoundaryToRegularPolygon(
  vertices: MeshVertex[],
  loop: number[]
): { U: Float64Array; V: Float64Array } {
  const n = loop.length;
  const U = new Float64Array(n);
  const V = new Float64Array(n);

  // Arc-length parameter for uniform spacing
  const len: number[] = [0];
  for (let i = 0; i < n; i++) {
    const a = vertices[loop[i]];
    const b = vertices[loop[(i + 1) % n]];
    len.push(len[i] + Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
  }

  const L = len[n];
  for (let i = 0; i < n; i++) {
    const t = len[i] / L;
    const ang = 2 * Math.PI * t;
    U[i] = 0.5 + 0.5 * Math.cos(ang);
    V[i] = 0.5 + 0.5 * Math.sin(ang);
  }

  return { U, V };
}

/**
 * Build uniform Laplacian in CSR format
 */
function buildUniformLaplacianCSR(
  n: number,
  adj: number[][],
  boundarySet: Set<number>
): CSR {
  const rows: number[] = [];
  const cols: number[] = [];
  const vals: number[] = [];

  for (let i = 0; i < n; i++) {
    if (boundarySet.has(i)) {
      // Dirichlet boundary condition: u_i = boundary value (identity row)
      rows.push(i);
      cols.push(i);
      vals.push(1);
      continue;
    }

    // Interior: Laplacian row (degree on diagonal, -1 for neighbors)
    const nb = adj[i];
    rows.push(i);
    cols.push(i);
    vals.push(nb.length);

    for (const j of nb) {
      rows.push(i);
      cols.push(j);
      vals.push(-1);
    }
  }

  // Convert to CSR format
  const pairs = rows
    .map((r, k) => [r, cols[k], vals[k]] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const rowPtr = new Uint32Array(n + 1);
  const colIdx: number[] = [];
  const v: number[] = [];

  let curRow = 0;
  rowPtr[0] = 0;

  for (const [r, c, x] of pairs) {
    while (curRow < r) {
      rowPtr[++curRow] = colIdx.length;
    }
    colIdx.push(c);
    v.push(x);
  }

  while (curRow < n) {
    rowPtr[++curRow] = colIdx.length;
  }

  return {
    n,
    rowPtr,
    colIdx: new Uint32Array(colIdx),
    vals: new Float64Array(v),
  };
}

/**
 * Sparse matrix-vector product
 */
function spmv(A: CSR, x: Float64Array, y: Float64Array): void {
  y.fill(0);
  for (let i = 0; i < A.n; i++) {
    for (let k = A.rowPtr[i]; k < A.rowPtr[i + 1]; k++) {
      y[i] += A.vals[k] * x[A.colIdx[k]];
    }
  }
}

/**
 * Dot product
 */
function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i] * b[i];
  }
  return s;
}

/**
 * axpy: y = y + a * x
 */
function axpy(a: number, x: Float64Array, y: Float64Array): void {
  for (let i = 0; i < x.length; i++) {
    y[i] += a * x[i];
  }
}

/**
 * L2 norm
 */
function norm2(x: Float64Array): number {
  return Math.sqrt(dot(x, x));
}

/**
 * Diagonal preconditioner (Jacobi)
 */
function diagPrecond(A: CSR): Float64Array {
  const d = new Float64Array(A.n).fill(1);
  for (let i = 0; i < A.n; i++) {
    for (let k = A.rowPtr[i]; k < A.rowPtr[i + 1]; k++) {
      if (A.colIdx[k] === i) {
        d[i] = Math.max(1e-12, A.vals[k]);
        break;
      }
    }
  }
  return d;
}

/**
 * Conjugate Gradient solver
 */
function cgSolve(
  A: CSR,
  b: Float64Array,
  tol = 1e-10,
  maxIt = 2000
): { x: Float64Array; iters: number; residual: number } {
  const x = new Float64Array(b.length); // Zero init
  const r = b.slice(0); // r = b - A x = b
  const z = new Float64Array(b.length);
  const Mdiag = diagPrecond(A);

  for (let i = 0; i < z.length; i++) {
    z[i] = r[i] / Mdiag[i];
  }

  let p = z.slice(0);
  let rz_old = dot(r, z);
  const Ap = new Float64Array(b.length);

  let k = 0;
  for (k = 0; k < maxIt; k++) {
    spmv(A, p, Ap);
    const alpha = rz_old / dot(p, Ap);
    axpy(alpha, p, x); // x += alpha p
    axpy(-alpha, Ap, r); // r -= alpha A p

    const res = norm2(r);
    if (res < tol) break;

    for (let i = 0; i < z.length; i++) {
      z[i] = r[i] / Mdiag[i];
    }

    const rz_new = dot(r, z);
    const beta = rz_new / rz_old;
    for (let i = 0; i < p.length; i++) {
      p[i] = z[i] + beta * p[i];
    }
    rz_old = rz_new;
  }

  return { x, iters: k + 1, residual: norm2(r) };
}

/**
 * Compute triangle area in UV space
 */
export function triangleAreaUV(
  uv: Float64Array,
  a: number,
  b: number,
  c: number
): number {
  const ax = uv[2 * a];
  const ay = uv[2 * a + 1];
  const bx = uv[2 * b];
  const by = uv[2 * b + 1];
  const cx = uv[2 * c];
  const cy = uv[2 * c + 1];
  return 0.5 * ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
}

/**
 * Count flipped triangles
 */
export function countFlipped(mesh: Mesh, uv: Float64Array): {
  count: number;
  flippedIndices: number[];
} {
  let flips = 0;
  const flippedIndices: number[] = [];

  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi];
    for (let i = 1; i + 1 < f.length; i++) {
      const A = triangleAreaUV(uv, f[0], f[i], f[i + 1]);
      if (!(A > 1e-14)) {
        flips++;
        flippedIndices.push(fi);
      }
    }
  }

  return { count: flips, flippedIndices };
}

/**
 * Compute robust Tutte embedding with CG solver
 */
export function computeTutteEmbeddingRobust(mesh: Mesh): TutteResult {
  const adj = buildAdjacency(mesh);

  // Compute boundary loops from faces (don't trust input)
  const boundaryLoops = computeBoundaryLoopsFromFaces(mesh.vertices, mesh.faces);

  if (boundaryLoops.length === 0) {
    // Closed mesh - use existing UV if available
    const embedding = new Map<number, TutteEmbedding>();
    for (const v of mesh.vertices) {
      embedding.set(v.id, { u: v.u ?? 0.5, v: v.v ?? 0.5 });
    }

    return {
      uv: embedding,
      boundaryVertices: new Set(),
      adjacency: adj,
      flippedTriangles: [],
      metrics: {
        cgIters: 0,
        residual: 0,
        numClamped: 0,
        numDegenerateFaces: 0,
        flippedTriangles: 0,
        flipFraction: 0,
      },
    };
  }

  // Use outer loop (first, largest perimeter)
  const outerLoop = boundaryLoops[0];
  const boundarySet = new Set(outerLoop);

  // Map boundary to regular polygon
  const { U: boundaryU, V: boundaryV } = mapBoundaryToRegularPolygon(
    mesh.vertices,
    outerLoop
  );

  // Build vertex index map
  const vidToIdx = new Map<number, number>();
  for (let i = 0; i < mesh.vertices.length; i++) {
    vidToIdx.set(mesh.vertices[i].id, i);
  }

  const n = mesh.vertices.length;

  // Build adjacency list (by index)
  const adjList: number[][] = [];
  for (let i = 0; i < n; i++) {
    const vid = mesh.vertices[i].id;
    const neighbors = Array.from(adj.vertexToNeighbors.get(vid) ?? []);
    adjList.push(neighbors.map((nvid) => vidToIdx.get(nvid)!));
  }

  // Build boundary set (by index)
  const boundarySetIdx = new Set<number>();
  for (const vid of outerLoop) {
    const idx = vidToIdx.get(vid);
    if (idx !== undefined) boundarySetIdx.add(idx);
  }

  // Build Laplacian
  const L = buildUniformLaplacianCSR(n, adjList, boundarySetIdx);

  // Build RHS for u and v
  const b_u = new Float64Array(n);
  const b_v = new Float64Array(n);

  for (let i = 0; i < outerLoop.length; i++) {
    const vid = outerLoop[i];
    const idx = vidToIdx.get(vid);
    if (idx !== undefined) {
      b_u[idx] = boundaryU[i];
      b_v[idx] = boundaryV[i];
    }
  }

  // Solve for u and v
  const sol_u = cgSolve(L, b_u, 1e-10, 2000);
  const sol_v = cgSolve(L, b_v, 1e-10, 2000);

  // Build embedding map
  const embedding = new Map<number, TutteEmbedding>();
  let numClamped = 0;

  for (let i = 0; i < n; i++) {
    let u = sol_u.x[i];
    let v = sol_v.x[i];

    // Clamp to [0,1]
    const uClamped = Math.max(0, Math.min(1, u));
    const vClamped = Math.max(0, Math.min(1, v));

    if (u !== uClamped || v !== vClamped) numClamped++;

    const vid = mesh.vertices[i].id;
    embedding.set(vid, { u: uClamped, v: vClamped });
  }

  // Build UV array for flip detection
  const uvArray = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const vid = mesh.vertices[i].id;
    const embed = embedding.get(vid)!;
    uvArray[2 * i] = embed.u;
    uvArray[2 * i + 1] = embed.v;
  }

  // Count degenerate faces
  let numDegenerate = 0;
  for (const f of mesh.faces) {
    if (f.length >= 3) {
      const a = vidToIdx.get(f[0])!;
      const b = vidToIdx.get(f[1])!;
      const c = vidToIdx.get(f[2])!;
      const area = triangleAreaUV(uvArray, a, b, c);
      if (Math.abs(area) < 1e-14) numDegenerate++;
    }
  }

  // Count flipped triangles
  const flipResult = countFlipped(mesh, uvArray);
  const flipFraction =
    mesh.faces.length > 0 ? flipResult.count / mesh.faces.length : 0;

  return {
    uv: embedding,
    boundaryVertices: boundarySet,
    adjacency: adj,
    flippedTriangles: flipResult.flippedIndices,
    metrics: {
      cgIters: Math.max(sol_u.iters, sol_v.iters),
      residual: Math.max(sol_u.residual, sol_v.residual),
      numClamped,
      numDegenerateFaces: numDegenerate,
      flippedTriangles: flipResult.count,
      flipFraction,
    },
  };
}

/**
 * Legacy wrapper for backward compatibility
 */
export function computeTutteEmbedding(mesh: Mesh): Map<number, TutteEmbedding> {
  return computeTutteEmbeddingRobust(mesh).uv;
}

/**
 * SAT (Separating Axis Theorem) test for triangle-box intersection
 * Higher precision than AABB test
 */
function satTriangleBox(
  pts: number[][],
  box: { uMin: number; uMax: number; vMin: number; vMax: number }
): boolean {
  // Box corners
  const boxCorners = [
    [box.uMin, box.vMin],
    [box.uMax, box.vMin],
    [box.uMax, box.vMax],
    [box.uMin, box.vMax],
  ];

  // Test axes: triangle edges and box edges
  const axes: number[][] = [];

  // Triangle edge normals
  for (let i = 0; i < 3; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % 3];
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    // Normal (perpendicular)
    const len = Math.hypot(dx, dy);
    if (len > 1e-10) {
      axes.push([-dy / len, dx / len]);
    }
  }

  // Box edge normals (axis-aligned)
  axes.push([1, 0]); // Horizontal
  axes.push([0, 1]); // Vertical

  // Project and test separation
  for (const axis of axes) {
    // Project triangle
    let triMin = Infinity;
    let triMax = -Infinity;
    for (const pt of pts) {
      const proj = pt[0] * axis[0] + pt[1] * axis[1];
      triMin = Math.min(triMin, proj);
      triMax = Math.max(triMax, proj);
    }

    // Project box
    let boxMin = Infinity;
    let boxMax = -Infinity;
    for (const corner of boxCorners) {
      const proj = corner[0] * axis[0] + corner[1] * axis[1];
      boxMin = Math.min(boxMin, proj);
      boxMax = Math.max(boxMax, proj);
    }

    // Check separation
    if (triMax < boxMin || triMin > boxMax) {
      return false; // Separated on this axis
    }
  }

  return true; // No separation found, must intersect
}

/**
 * Check if triangle intersects UV box (partial overlap support with SAT)
 */
function triIntersectsUvBox(
  uv: Float64Array,
  tri: [number, number, number],
  box: { uMin: number; uMax: number; vMin: number; vMax: number }
): boolean {
  // Fast AABB test first
  const pts = tri.map((i) => [uv[2 * i], uv[2 * i + 1]]);
  const umin = Math.min(pts[0][0], pts[1][0], pts[2][0]);
  const umax = Math.max(pts[0][0], pts[1][0], pts[2][0]);
  const vmin = Math.min(pts[0][1], pts[1][1], pts[2][1]);
  const vmax = Math.max(pts[0][1], pts[1][1], pts[2][1]);

  if (umax < box.uMin || umin > box.uMax || vmax < box.vMin || vmin > box.vMax) {
    return false;
  }

  // Cheap acceptance: any vertex inside
  for (const [u, v] of pts) {
    if (u >= box.uMin && u <= box.uMax && v >= box.vMin && v <= box.vMax) {
      return true;
    }
  }

  // SAT test for higher precision
  return satTriangleBox(pts, box);
}

/**
 * Select UV region with partial overlap support
 */
export function selectUvRegion(
  mesh: Mesh,
  uvBox: { uMin: number; uMax: number; vMin: number; vMax: number },
  embedding?: Map<number, TutteEmbedding>
): {
  vertexSet: Set<number>;
  faceIndices: number[];
  triangles: Array<[number, number, number]>;
} {
  // Use provided embedding or compute on-the-fly
  const uv = embedding ?? computeTutteEmbedding(mesh);

  // Build UV array
  const vidToIdx = new Map<number, number>();
  for (let i = 0; i < mesh.vertices.length; i++) {
    vidToIdx.set(mesh.vertices[i].id, i);
  }

  const n = mesh.vertices.length;
  const uvArray = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const vid = mesh.vertices[i].id;
    const embed = uv.get(vid)!;
    uvArray[2 * i] = embed.u;
    uvArray[2 * i + 1] = embed.v;
  }

  const vertexSet = new Set<number>();
  const faceIndices: number[] = [];

  // Find vertices within UV box
  for (const v of mesh.vertices) {
    const embed = uv.get(v.id);
    if (embed) {
      if (
        embed.u >= uvBox.uMin &&
        embed.u <= uvBox.uMax &&
        embed.v >= uvBox.vMin &&
        embed.v <= uvBox.vMax
      ) {
        vertexSet.add(v.id);
      }
    }
  }

  // Find faces with partial overlap
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    let include = false;

    // Check if all vertices inside
    if (face.every((vid) => vertexSet.has(vid))) {
      include = true;
    } else {
      // Check triangle-box intersection
      if (face.length >= 3) {
        const tri: [number, number, number] = [
          vidToIdx.get(face[0])!,
          vidToIdx.get(face[1])!,
          vidToIdx.get(face[2])!,
        ];
        if (triIntersectsUvBox(uvArray, tri, uvBox)) {
          include = true;
        }
      }
    }

    if (include) {
      faceIndices.push(fi);
      // Add all vertices of included faces
      for (const vid of face) {
        vertexSet.add(vid);
      }
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
 * Get boundary loops from mesh (uses robust computation)
 */
export function getBoundaryLoops(mesh: Mesh): number[][] {
  return computeBoundaryLoopsFromFaces(mesh.vertices, mesh.faces);
}
