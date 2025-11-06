/**
 * Robust Planar Boolean Operations & Re-triangulation Executor
 * 
 * Performs deterministic cutting and extruding on planar regions.
 * Uses robust 2D polygon clipping and triangulation in UV space.
 */

import earcut from "earcut";
import * as polyclip from "polygon-clipping";
import { vec3, mat3 } from "gl-matrix";
import {
  Mesh,
  OperationEnvelope,
  Operation,
  MeshVertex,
  AddHoleParams,
  ExtrudeRegionParams
} from "./shape-operations";

/** ----------------- Utility: selection in UV ----------------- */

type Region = {
  vertexSet: Set<number>;
  faceIndices: number[];
  triangles: Array<[number, number, number]>;
};

function selectRegionByUvBox(
  mesh: Mesh,
  uvBox: { uMin: number; uMax: number; vMin: number; vMax: number }
): Region {
  const vset = new Set<number>();
  for (const v of mesh.vertices) {
    if (v.u >= uvBox.uMin && v.u <= uvBox.uMax && v.v >= uvBox.vMin && v.v <= uvBox.vMax) {
      vset.add(v.id);
    }
  }

  const faceIndices: number[] = [];
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi];
    if (f.every(id => vset.has(id))) faceIndices.push(fi);
  }

  // Ensure triangles (executor assumes tris)
  const triangles: Array<[number, number, number]> = [];
  for (const fi of faceIndices) {
    const f = mesh.faces[fi];
    if (f.length === 3) {
      triangles.push([f[0], f[1], f[2]]);
    } else {
      // Simple fan triangulation fallback
      for (let i = 1; i < f.length - 1; i++) {
        triangles.push([f[0], f[i], f[i + 1]]);
      }
    }
  }

  return { vertexSet: vset, faceIndices, triangles };
}

/** ----------------- Utility: boundary loops in UV ----------------- */

type EdgeKey = string;
function ek(a: number, b: number): EdgeKey {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function boundaryLoopsUV(mesh: Mesh, region: Region): number[][] {
  const edgeCount = new Map<EdgeKey, { a: number; b: number; count: number }>();

  for (const [a, b, c] of region.triangles) {
    const edges = [[a, b], [b, c], [c, a]];
    for (const [p, q] of edges) {
      const key = ek(p, q);
      const ent = edgeCount.get(key) ?? { a: p, b: q, count: 0 };
      ent.count += 1;
      edgeCount.set(key, ent);
    }
  }

  // Boundary edges occur once
  const adj = new Map<number, number[]>();
  for (const ent of edgeCount.values()) {
    if (ent.count === 1) {
      if (!adj.has(ent.a)) adj.set(ent.a, []);
      if (!adj.has(ent.b)) adj.set(ent.b, []);
      adj.get(ent.a)!.push(ent.b);
      adj.get(ent.b)!.push(ent.a);
    }
  }

  // Walk loops
  const visited = new Set<EdgeKey>();
  const loops: number[][] = [];

  for (const [start, nbrs] of adj.entries()) {
    for (const n of nbrs) {
      const k = ek(start, n);
      if (visited.has(k)) continue;

      // Start a loop
      const loop: number[] = [start, n];
      visited.add(k);
      let prev = start, curr = n;

      while (true) {
        const nexts = (adj.get(curr) ?? []).filter(x => x !== prev);
        if (!nexts.length) break;

        const next = nexts[0];
        const kk = ek(curr, next);
        if (visited.has(kk)) break;

        loop.push(next);
        visited.add(kk);
        prev = curr;
        curr = next;

        if (next === loop[0]) break; // Closed
      }

      // Ensure closed loop
      if (loop[0] === loop[loop.length - 1]) loop.pop();
      if (loop.length >= 3) loops.push(loop);
    }
  }

  // Orient CCW in UV
  function signedArea(loop: number[]): number {
    let A = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = mesh.vertices[loop[i]];
      const b = mesh.vertices[loop[(i + 1) % loop.length]];
      A += (a.u * b.v - b.u * a.v);
    }
    return 0.5 * A;
  }

  for (const L of loops) {
    if (signedArea(L) < 0) L.reverse(); // CCW
  }

  return loops;
}

/** ----------------- UV -> XYZ lift via barycentric ----------------- */

type UvTri = {
  ids: [number, number, number];
  uv: [[number, number], [number, number], [number, number]];
  xyz: [[number, number, number], [number, number, number], [number, number, number]];
};

function regionUvTris(mesh: Mesh, region: Region): UvTri[] {
  const tris: UvTri[] = [];
  for (const [a, b, c] of region.triangles) {
    const va = mesh.vertices[a], vb = mesh.vertices[b], vc = mesh.vertices[c];
    tris.push({
      ids: [a, b, c],
      uv: [[va.u, va.v], [vb.u, vb.v], [vc.u, vc.v]],
      xyz: [[va.x, va.y, va.z], [vb.x, vb.y, vb.z], [vc.x, vc.y, vc.z]],
    });
  }
  return tris;
}

function barycentric(
  u: number,
  v: number,
  tri: UvTri
): { w0: number; w1: number; w2: number } | null {
  const [A, B, C] = tri.uv;
  const x = u, y = v;
  const x1 = A[0], y1 = A[1], x2 = B[0], y2 = B[1], x3 = C[0], y3 = C[1];
  const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);

  if (Math.abs(det) < 1e-12) return null;

  const w0 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det;
  const w1 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det;
  const w2 = 1 - w0 - w1;

  if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) {
    return { w0, w1, w2 };
  }

  return null;
}

function liftUvToXyz(
  mesh: Mesh,
  uvTris: UvTri[],
  u: number,
  v: number
): [number, number, number] | null {
  for (const t of uvTris) {
    const bc = barycentric(u, v, t);
    if (!bc) continue;

    const [A, B, C] = t.xyz;
    const X = bc.w0 * A[0] + bc.w1 * B[0] + bc.w2 * C[0];
    const Y = bc.w0 * A[1] + bc.w1 * B[1] + bc.w2 * C[1];
    const Z = bc.w0 * A[2] + bc.w1 * B[2] + bc.w2 * C[2];

    return [X, Y, Z];
  }

  return null;
}

/** ----------------- Geometry helpers ----------------- */

function circlePolygonUV(
  center: [number, number],
  radius: number,
  segments = 64
): [number, number][] {
  const [cx, cy] = center;
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t)]);
  }
  return pts;
}

function uvBoxCenter(uvBox: {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}): [number, number] {
  return [0.5 * (uvBox.uMin + uvBox.uMax), 0.5 * (uvBox.vMin + uvBox.vMax)];
}

function addVertex(
  mesh: Mesh,
  u: number,
  v: number,
  xyz: [number, number, number],
  tags?: string[]
): number {
  const id = mesh.vertices.length;
  const mv: MeshVertex = {
    id,
    u,
    v,
    x: xyz[0],
    y: xyz[1],
    z: xyz[2],
    tags,
  };
  mesh.vertices.push(mv);
  return id;
}

/** ----------------- ADD_HOLE (circular, through-all) ----------------- */

function executeAddHoleUV(
  mesh: Mesh,
  region: Region,
  params: {
    centerUV: [number, number];
    radiusUV: number;
    chamferEntranceMm?: number;
    chamferExitMm?: number;
  }
) {
  // Build region outer polygon in UV
  const loops = boundaryLoopsUV(mesh, region);
  if (loops.length < 1) return;

  // Pick loop that contains the center
  const [cx, cy] = params.centerUV;
  const contains = (loop: number[]) => {
    let wn = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = mesh.vertices[loop[i]];
      const b = mesh.vertices[loop[(i + 1) % loop.length]];
      if (((a.v <= cy) && (b.v > cy)) || ((a.v > cy) && (b.v <= cy))) {
        const t = (cy - a.v) / (b.v - a.v);
        const x = a.u + t * (b.u - a.u);
        if (x > cx) wn++;
      }
    }
    return (wn % 2) === 1;
  };

  const outer = loops.find(contains) ?? loops[0];

  // Construct clipping polygons
  const outerPoly: number[][][] = [
    [...outer.map(i => [mesh.vertices[i].u, mesh.vertices[i].v])],
  ];
  const holeRing = circlePolygonUV(params.centerUV, params.radiusUV);
  const holePoly: number[][][] = [[holeRing]];

  // Boolean difference (outer - hole)
  const diff = polyclip.difference(outerPoly, holePoly) as number[][][] | null;
  if (!diff || diff.length === 0) return;

  // Triangulate each polygon piece and lift to 3D
  const uvTris = regionUvTris(mesh, region);
  const newFaces: number[][] = [];

  for (const poly of diff) {
    const outerRing = poly[0];
    const holes = poly.slice(1);

    const flat: number[] = [];
    const holeIndices: number[] = [];

    for (const p of outerRing) {
      flat.push(p[0], p[1]);
    }

    let idx = outerRing.length;
    for (const h of holes) {
      holeIndices.push(idx);
      for (const p of h) {
        flat.push(p[0], p[1]);
      }
      idx += h.length;
    }

    // Map 2D vertices to 3D
    const uvToVid: number[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      const u = flat[i], v = flat[i + 1];
      const xyz = liftUvToXyz(mesh, uvTris, u, v);
      if (!xyz) continue;
      const id = addVertex(mesh, u, v, xyz, ["hole_boundary"]);
      uvToVid.push(id);
    }

    const triIdx = earcut(flat, holes.length ? holeIndices : undefined, 2);
    for (let t = 0; t < triIdx.length; t += 3) {
      const a = uvToVid[triIdx[t]];
      const b = uvToVid[triIdx[t + 1]];
      const c = uvToVid[triIdx[t + 2]];
      if (a != null && b != null && c != null) {
        newFaces.push([a, b, c]);
      }
    }
  }

  // Remove old region faces & add new faces
  const keep: number[][] = [];
  const regionFaceSet = new Set(region.faceIndices);
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    if (!regionFaceSet.has(fi)) keep.push(mesh.faces[fi]);
  }
  mesh.faces = [...keep, ...newFaces];
}

/** ----------------- EXTRUDE_REGION (solid, outward|inward) ----------------- */

function averageNormal(mesh: Mesh, tris: Array<[number, number, number]>): vec3 {
  const n = vec3.fromValues(0, 0, 0);
  const tmp1 = vec3.create();
  const tmp2 = vec3.create();
  const cr = vec3.create();

  for (const [a, b, c] of tris) {
    const A = mesh.vertices[a], B = mesh.vertices[b], C = mesh.vertices[c];
    vec3.set(tmp1, B.x - A.x, B.y - A.y, B.z - A.z);
    vec3.set(tmp2, C.x - A.x, C.y - A.y, C.z - A.z);
    vec3.cross(cr, tmp1, tmp2);
    vec3.add(n, n, cr);
  }

  if (vec3.length(n) < 1e-9) vec3.set(n, 0, 0, 1);
  vec3.normalize(n, n);
  return n;
}

function extrudeRegionSolid(
  mesh: Mesh,
  region: Region,
  params: {
    heightMm: number;
    direction: string;
    taperAngleDegrees?: number;
  }
) {
  const baseNormal = averageNormal(mesh, region.triangles);

  const dir = vec3.create();
  switch (params.direction) {
    case "inward_surface_normal":
      vec3.scale(dir, baseNormal, -1);
      break;
    case "outward_surface_normal":
      vec3.copy(dir, baseNormal);
      break;
    case "axis_x":
      vec3.set(dir, 1, 0, 0);
      break;
    case "axis_y":
      vec3.set(dir, 0, 1, 0);
      break;
    case "axis_z":
      vec3.set(dir, 0, 0, 1);
      break;
    default:
      vec3.copy(dir, baseNormal);
  }
  vec3.normalize(dir, dir);

  // Determine boundary loops and compute centroid
  const loops = boundaryLoopsUV(mesh, region);
  const regionVertIds = new Set<number>();
  for (const fi of region.faceIndices) {
    for (const vid of mesh.faces[fi]) regionVertIds.add(vid);
  }
  const regionVerts = Array.from(regionVertIds).map(i => mesh.vertices[i]);

  const centroid = vec3.fromValues(0, 0, 0);
  for (const v of regionVerts) {
    vec3.add(centroid, centroid, vec3.fromValues(v.x, v.y, v.z));
  }
  vec3.scale(centroid, centroid, 1 / regionVerts.length);

  // Tangent basis for taper
  const t = vec3.create(), b = vec3.create();
  if (Math.abs(baseNormal[2]) > 0.707) {
    vec3.set(t, 1, 0, 0);
    vec3.set(b, 0, 1, 0);
  } else {
    vec3.cross(t, baseNormal, vec3.fromValues(0, 0, 1));
    vec3.normalize(t, t);
    vec3.cross(b, baseNormal, t);
    vec3.normalize(b, b);
  }

  const tan = Math.tan(((params.taperAngleDegrees ?? 0) * Math.PI) / 180);
  let rmean = 0;
  for (const v of regionVerts) {
    const vx = v.x - centroid[0], vy = v.y - centroid[1], vz = v.z - centroid[2];
    const qx = vx * t[0] + vy * t[1] + vz * t[2];
    const qy = vx * b[0] + vy * b[1] + vz * b[2];
    rmean += Math.hypot(qx, qy);
  }
  rmean = Math.max(1e-6, rmean / regionVerts.length);
  const scaleTop = 1 + (params.heightMm * tan) / rmean;

  // Map original vertex -> top vertex
  const topMap = new Map<number, number>();
  for (const vid of regionVertIds) {
    const v = mesh.vertices[vid];
    const vx = v.x - centroid[0], vy = v.y - centroid[1], vz = v.z - centroid[2];
    const qx = vx * t[0] + vy * t[1] + vz * t[2];
    const qy = vx * b[0] + vy * b[1] + vz * b[2];
    const qz = vx * baseNormal[0] + vy * baseNormal[1] + vz * baseNormal[2];

    const sx = qx * scaleTop, sy = qy * scaleTop, sz = qz;
    const wx =
      centroid[0] +
      sx * t[0] +
      sy * b[0] +
      sz * baseNormal[0] +
      params.heightMm * dir[0];
    const wy =
      centroid[1] +
      sx * t[1] +
      sy * b[1] +
      sz * baseNormal[1] +
      params.heightMm * dir[1];
    const wz =
      centroid[2] +
      sx * t[2] +
      sy * b[2] +
      sz * baseNormal[2] +
      params.heightMm * dir[2];

    const idTop = addVertex(mesh, v.u, v.v, [wx, wy, wz], ["extrude_top"]);
    topMap.set(vid, idTop);
  }

  // Build top cap faces
  const topFaces: number[][] = [];
  for (const fi of region.faceIndices) {
    const f = mesh.faces[fi];
    topFaces.push(f.map(vid => topMap.get(vid)!));
  }

  // Build side quads along boundary loops
  const sideFaces: number[][] = [];
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const aTop = topMap.get(a)!, bTop = topMap.get(b)!;
      sideFaces.push([a, b, bTop]);
      sideFaces.push([a, bTop, aTop]);
    }
  }

  // Remove original region faces
  const keep: number[][] = [];
  const regionFaceSet = new Set(region.faceIndices);
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    if (!regionFaceSet.has(fi)) keep.push(mesh.faces[fi]);
  }
  mesh.faces = [...keep, ...topFaces, ...sideFaces];
}

/** ----------------- MAIN: apply operations ----------------- */

export function applyOperationsRobust(mesh: Mesh, env: OperationEnvelope): Mesh {
  // Clone mesh to avoid mutating caller
  const out: Mesh = {
    meshId: mesh.meshId + "|ops",
    vertices: mesh.vertices.map(v => ({
      ...v,
      tags: v.tags ? [...v.tags] : undefined,
    })),
    faces: mesh.faces.map(f => [...f]),
    boundaryLoops: mesh.boundaryLoops ? mesh.boundaryLoops.map(L => [...L]) : undefined,
  };

  for (const op of [...env.operations].sort((a, b) => a.priority - b.priority)) {
    if (op.target.kind !== "uv_region") continue;

    const region = selectRegionByUvBox(out, op.target.uvBox);
    if (region.faceIndices.length === 0) continue;

    if (op.type === "add_hole") {
      const holeParams = op.params as AddHoleParams;
      if (holeParams.shape !== "circular" || !holeParams.throughAll) continue;

      const [uc, vc] = uvBoxCenter(op.target.uvBox);
      const uSpan = Math.max(1e-6, op.target.uvBox.uMax - op.target.uvBox.uMin);
      const vSpan = Math.max(1e-6, op.target.uvBox.vMax - op.target.uvBox.vMin);
      const span = Math.min(uSpan, vSpan);

      // Conservative UV radius
      const radiusUV = Math.min(
        0.5 * span * 0.95,
        (0.5 * span * holeParams.diameterMm) / Math.max(1, holeParams.diameterMm)
      );

      executeAddHoleUV(out, region, {
        centerUV: [
          uc + (holeParams.offsetFromRegionCenterMm?.x ?? 0) * 0,
          vc + (holeParams.offsetFromRegionCenterMm?.y ?? 0) * 0,
        ],
        radiusUV,
        chamferEntranceMm: holeParams.chamferEntranceMm,
        chamferExitMm: holeParams.chamferExitMm,
      });
    }

    if (op.type === "extrude_region") {
      const extParams = op.params as ExtrudeRegionParams;
      extrudeRegionSolid(out, region, {
        heightMm: extParams.heightMm,
        direction: extParams.direction,
        taperAngleDegrees: extParams.taperAngleDegrees,
      });
    }
  }

  return out;
}
