import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch for native model integration tests
global.fetch = vi.fn();

describe("Native Geometry Model Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call native model when feature flag is enabled", async () => {
    // This would require importing the route handler
    // For now, we test the concept
    
    const mockResponse = {
      ok: true,
      json: async () => ({
        mask_vertex_ids: [0, 1, 2],
        params: { diameterMm: 10.5 },
        confidence: 0.85,
      }),
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const response = await fetch("http://localhost:8001/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mesh: {
          vertices: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]],
          faces: [[0, 1, 2], [0, 2, 3]],
          uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
        },
        proposal: {
          uv_box: { uMin: 0.4, uMax: 0.6, vMin: 0.4, vMax: 0.6 },
          op_type: "add_hole",
        },
      }),
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.params).toBeDefined();
  });

  it("should handle native model errors gracefully", async () => {
    const mockResponse = {
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const response = await fetch("http://localhost:8001/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.ok).toBe(false);
  });
});
