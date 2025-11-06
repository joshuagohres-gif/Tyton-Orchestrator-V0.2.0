# Geometric Improvements Summary

This document summarizes the geometric improvements implemented for the Tutte generator and shape operations pipeline.

## 1. Robust Tutte Embedding

### Improvements
- **CG Solver**: Replaced Gauss-Seidel with Conjugate Gradient for faster convergence
- **Sparse Laplacian**: CSR format for efficient matrix operations
- **Boundary Computation**: Robust computation from faces (doesn't trust input)
- **Convex Mapping**: Regular polygon boundary mapping with arc-length parameterization
- **Flip Detection**: Automatic detection and tracking of inverted triangles

### API
```typescript
const result = computeTutteEmbeddingRobust(mesh);
// Returns: { uv, boundaryVertices, adjacency, flippedTriangles, metrics }
```

### Metrics
- CG iterations and residual
- Number of clamped UV values
- Degenerate face count
- Flip fraction

## 2. SAT Test for Triangle-Box Intersection

### Implementation
- **Separating Axis Theorem**: Higher precision than AABB test
- Tests triangle edge normals and box edge normals
- Used in `selectUvRegion()` for partial overlap detection

### Benefits
- Catches triangles that graze UV box edges
- More accurate region selection
- Handles thin slivers correctly

## 3. BVH Spatial Index

### Purpose
Efficient UV→XYZ lifting for barycentric interpolation in executor.

### Implementation
- **Location**: `server/lib/tutte-bvh.ts`
- **Build**: `buildUVTriangleBVH(mesh, embedding)`
- **Query**: `queryBVH(node, u, v, mesh, embedding)`
- **Lift**: `liftUvToXyzBVH(bvh, mesh, embedding, u, v)`

### Performance
- O(log n) query time vs O(n) linear scan
- Cached structure reusable across operations
- Reduces mismatches near seams

## 4. Native Model Integration

### Feature Flag
```bash
NATIVE_GEOM_MODEL=true
NATIVE_GEOM_SERVICE_URL=http://localhost:8001
NATIVE_CONFIDENCE_THRESHOLD=0.7
```

### Flow
1. LLM generates initial proposal
2. For each operation, call native model `/refine`
3. If confidence > threshold, merge refined params
4. Otherwise, use LLM params

### Benefits
- Improved IoU on region masks
- Better parameter accuracy
- Reduced violation rates

## 5. Region Selection Improvements

### Partial Overlap Support
- AABB test (fast rejection)
- Vertex-in-box check (fast acceptance)
- SAT test (high precision for edge cases)

### Result
- Includes triangles that partially overlap UV box
- Handles thin slivers and grazing triangles
- More robust region selection

## Testing

### Test Files
- `test/tutte.robust.spec.ts` - Robust embedding tests
- `test/selection.partialoverlap.spec.ts` - Partial overlap tests
- `test/executor.roundtrip.spec.ts` - Roundtrip tests
- `test/tutte-bvh.spec.ts` - BVH tests
- `test/native-geo.spec.ts` - Native model integration tests

### Coverage
- Fuzz testing with noise
- Translation/scale invariance
- Manifoldness preservation
- Flip detection accuracy

## Usage Examples

### Robust Embedding
```typescript
import { computeTutteEmbeddingRobust } from "./lib/tutte";

const result = computeTutteEmbeddingRobust(mesh);
console.log(`CG iterations: ${result.metrics.cgIters}`);
console.log(`Flip fraction: ${result.metrics.flipFraction}`);
```

### BVH Query
```typescript
import { buildUVTriangleBVH, liftUvToXyzBVH } from "./lib/tutte-bvh";

const bvh = buildUVTriangleBVH(mesh, embedding.uv);
const xyz = liftUvToXyzBVH(bvh, mesh, embedding.uv, 0.5, 0.5);
```

### Region Selection
```typescript
import { selectUvRegion } from "./lib/tutte";

const region = selectUvRegion(mesh, uvBox, embedding.uv);
// Automatically uses SAT test for partial overlap
```

## Performance

### Benchmarks
- CG solver: ~10-50 iterations (vs 100+ for Gauss-Seidel)
- BVH query: O(log n) vs O(n) linear scan
- SAT test: ~5-10x slower than AABB, but more accurate

### Memory
- BVH: ~O(n) space for n triangles
- Sparse Laplacian: ~O(n) for n vertices
- UV arrays: Float64Array for precision

## Future Enhancements

1. **Cotangent Weights**: More shape-preserving than uniform weights
2. **LSCM Fallback**: For high flip rates, switch to Least Squares Conformal Maps
3. **Multi-resolution BVH**: For very large meshes
4. **GPU Acceleration**: For CG solver on large meshes
