/**
 * Shape Operations Route
 * 
 * POST /api/shape/operations
 * Planner endpoint that validates LLM output and returns OperationEnvelope
 */

import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { openAIConfig } from "../config";
import { logger } from "../logger";
import { aiRateLimit } from "../rateLimiter";
import type {
  Mesh,
  OperationEnvelope,
  Operation,
  UvRegionTarget,
  AddHoleParams,
  ExtrudeRegionParams,
} from "../lib/shape-operations";

const openai = new OpenAI({
  apiKey: openAIConfig.apiKey,
});

// ===== ZOD SCHEMAS =====

const UvBoxSchema = z.object({
  uMin: z.number().min(0).max(1),
  uMax: z.number().min(0).max(1),
  vMin: z.number().min(0).max(1),
  vMax: z.number().min(0).max(1),
});

const UvRegionTargetSchema: z.ZodType<UvRegionTarget> = z.object({
  kind: z.literal("uv_region"),
  uvBox: UvBoxSchema,
});

const AddHoleParamsSchema: z.ZodType<AddHoleParams> = z.object({
  shape: z.enum(["circular", "rectangular", "custom"]),
  diameterMm: z.number().min(0.1),
  throughAll: z.boolean(),
  normalDirection: z.enum([
    "outward_surface_normal",
    "inward_surface_normal",
    "axis_x",
    "axis_y",
    "axis_z",
  ]),
  offsetFromRegionCenterMm: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  chamferEntranceMm: z.number().min(0).optional(),
  chamferExitMm: z.number().min(0).optional(),
});

const ExtrudeRegionParamsSchema: z.ZodType<ExtrudeRegionParams> = z.object({
  mode: z.enum(["solid", "shell"]),
  direction: z.enum([
    "outward_surface_normal",
    "inward_surface_normal",
    "axis_x",
    "axis_y",
    "axis_z",
  ]),
  heightMm: z.number().min(0.1),
  taperAngleDegrees: z.number().min(0).max(89).optional(),
  capType: z.enum(["flat", "rounded"]),
});

const OperationSchema: z.ZodType<Operation> = z.object({
  opId: z.string(),
  type: z.enum(["add_hole", "extrude_region", "round_corner", "add_vents", "add_ribs"]),
  description: z.string(),
  target: UvRegionTargetSchema,
  params: z.union([AddHoleParamsSchema, ExtrudeRegionParamsSchema, z.any()]),
  priority: z.number().int().min(1),
  dependsOn: z.array(z.string()).default([]),
  notes: z.string().default(""),
});

const OperationEnvelopeSchema: z.ZodType<OperationEnvelope> = z.object({
  schemaVersion: z.literal(1),
  operations: z.array(OperationSchema),
});

const ShapeOpsRequestSchema = z.object({
  schemaVersion: z.number().int().default(1),
  mesh: z.any(), // Mesh type - validated separately if needed
  userIntent: z.string(),
  constraints: z
    .object({
      wallThicknessMm: z.number().min(0).optional(),
      minFeatureSizeMm: z.number().min(0).optional(),
      manufacturingMethod: z.enum(["3D_PRINT", "CNC", "INJECTION_MOLD"]).optional(),
    })
    .optional(),
  style: z.string().optional(),
  allowedOperationTypes: z
    .array(z.enum(["add_hole", "extrude_region", "round_corner", "add_vents", "add_ribs"]))
    .default(["add_hole", "extrude_region"]),
});

type ShapeOpsRequest = z.infer<typeof ShapeOpsRequestSchema>;

// ===== PLANNER PROMPT =====

function buildPlannerPrompt(request: ShapeOpsRequest): string {
  const systemPrompt = `You are a geometric operations planner. Read mesh + intent + constraints. Use ONLY allowedOperationTypes. Return strictly one JSON object matching OperationEnvelopeSchema: { "schemaVersion": 1, "operations": Operation[] }. Prefer conservative parameters that respect wall thickness.

Rules:
- Return JSON ONLY, no markdown fences or commentary
- All UV coordinates must be in [0,1] range
- Priority must be >= 1
- Operations must reference valid UV regions
- Respect wall thickness constraints
- Use conservative diameters/heights to avoid breaking geometry`;

  const userPrompt = `REQUEST:
${JSON.stringify({
  schemaVersion: request.schemaVersion,
  mesh: {
    meshId: request.mesh.meshId,
    vertexCount: request.mesh.vertices?.length || 0,
    faceCount: request.mesh.faces?.length || 0,
  },
  userIntent: request.userIntent,
  constraints: request.constraints,
  style: request.style,
  allowedOperationTypes: request.allowedOperationTypes,
})}

Return JSON ONLY.`;

  return `${systemPrompt}\n\n${userPrompt}`;
}

// ===== REPAIR & VALIDATION =====

function repairOperationEnvelope(
  data: any,
  allowedTypes: string[]
): OperationEnvelope | null {
  try {
    // Clamp UV boxes to [0,1]
    if (data.operations && Array.isArray(data.operations)) {
      for (const op of data.operations) {
        if (op.target?.uvBox) {
          const box = op.target.uvBox;
          op.target.uvBox = {
            uMin: Math.max(0, Math.min(1, box.uMin ?? 0)),
            uMax: Math.max(0, Math.min(1, box.uMax ?? 1)),
            vMin: Math.max(0, Math.min(1, box.vMin ?? 0)),
            vMax: Math.max(0, Math.min(1, box.vMax ?? 1)),
          };
        }

        // Enforce priority >= 1
        if (typeof op.priority !== "number" || op.priority < 1) {
          op.priority = 1;
        }

        // Ensure dependsOn is array
        if (!Array.isArray(op.dependsOn)) {
          op.dependsOn = [];
        }

        // Ensure notes is string
        if (typeof op.notes !== "string") {
          op.notes = "";
        }
      }

      // Filter by allowed types
      data.operations = data.operations.filter((op: any) =>
        allowedTypes.includes(op.type)
      );

      // Ensure schemaVersion
      if (data.schemaVersion !== 1) {
        data.schemaVersion = 1;
      }

      // Reject if no valid ops remain
      if (!data.operations || data.operations.length === 0) {
        return null;
      }
    }

    // Validate with Zod
    const result = OperationEnvelopeSchema.safeParse(data);
    if (result.success) {
      return result.data;
    }

    logger.warn("Repair failed validation", { errors: result.error.errors });
    return null;
  } catch (error) {
    logger.error("Repair error", {}, error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

// ===== ROUTE HANDLER =====

export function registerShapeOpsRoutes(app: Express): void {
  app.post(
    "/api/shape/operations",
    aiRateLimit,
    async (req: Request, res: Response) => {
      try {
        // Validate request
        const requestValidation = ShapeOpsRequestSchema.safeParse(req.body);
        if (!requestValidation.success) {
          return res.status(400).json({
            error: "Invalid request",
            details: requestValidation.error.errors,
          });
        }

        const request = requestValidation.data;

        // Build prompt
        const prompt = buildPlannerPrompt(request);

        // Call LLM
        const completion = await openai.chat.completions.create({
          model: openAIConfig.model,
          messages: [
            {
              role: "system",
              content:
                "You are a geometric operations planner. Return ONLY valid JSON matching the OperationEnvelope schema. No markdown, no commentary.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.3, // Lower temperature for more deterministic output
          max_tokens: openAIConfig.maxTokens,
          response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          return res.status(500).json({ error: "No response from LLM" });
        }

        // Parse JSON
        let parsed: any;
        try {
          // Remove markdown fences if present
          const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          parsed = JSON.parse(cleaned);
        } catch (parseError) {
          logger.error("JSON parse error", { content }, parseError instanceof Error ? parseError : new Error(String(parseError)));
          return res.status(500).json({
            error: "Failed to parse LLM response as JSON",
            details: parseError instanceof Error ? parseError.message : String(parseError),
          });
        }

        // Repair and validate
        const repaired = repairOperationEnvelope(
          parsed,
          request.allowedOperationTypes
        );

        if (!repaired) {
          return res.status(422).json({
            error: "LLM response failed validation and repair",
            received: parsed,
          });
        }

        // Return validated envelope
        res.json(repaired);
      } catch (error) {
        logger.error(
          "Shape operations planner error",
          {},
          error instanceof Error ? error : new Error(String(error))
        );
        res.status(500).json({
          error: "Failed to plan shape operations",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );
}
