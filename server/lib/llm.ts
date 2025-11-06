/**
 * LLM Service Wrapper
 * 
 * Provides validated LLM calls with schema enforcement, JSON repair, and error handling.
 * All hardware design endpoints use this service to ensure strict JSON conformance.
 */

import OpenAI from "openai";
import { z, ZodSchema } from "zod";
import { openAIConfig } from "../config";

const openai = new OpenAI({
  apiKey: openAIConfig.apiKey
});

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface LLMCallOptions {
  messages: Message[];
  schema?: ZodSchema;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
}

export interface LLMCallResult<T = any> {
  success: boolean;
  data?: T;
  rawResponse?: string;
  error?: string;
  validationErrors?: string[];
}

/**
 * Call LLM with JSON validation
 */
export async function callLLM<T = any>(
  options: LLMCallOptions
): Promise<LLMCallResult<T>> {
  const {
    messages,
    schema,
    model = "gpt-4o",
    temperature = 1,
    maxTokens = 3000,
    responseFormat = "json_object"
  } = options;

  try {
    // Make OpenAI call
    const response = await openai.chat.completions.create({
      model,
      messages: messages as any,
      response_format: responseFormat === "json_object" ? { type: "json_object" } : undefined,
      temperature,
      max_completion_tokens: maxTokens
    });

    const rawResponse = response.choices[0]?.message?.content || "{}";

    // Parse JSON
    let parsedData: any;
    try {
      parsedData = JSON.parse(rawResponse);
    } catch (parseError) {
      // Attempt JSON repair
      console.warn("JSON parse failed, attempting repair...");
      const repaired = repairJSON(rawResponse);
      try {
        parsedData = JSON.parse(repaired);
      } catch (repairError) {
        return {
          success: false,
          rawResponse,
          error: `Failed to parse JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
        };
      }
    }

    // Validate with schema if provided
    if (schema) {
      const validation = schema.safeParse(parsedData);
      if (!validation.success) {
        console.warn("Schema validation failed:", validation.error.issues);
        
        // Attempt to repair common schema issues
        const repaired = repairSchemaIssues(parsedData, validation.error.issues);
        const revalidation = schema.safeParse(repaired);
        
        if (revalidation.success) {
          return {
            success: true,
            data: revalidation.data as T,
            rawResponse
          };
        }

        return {
          success: false,
          data: parsedData,
          rawResponse,
          error: "Schema validation failed",
          validationErrors: validation.error.issues.map(issue => 
            `${issue.path.join('.')}: ${issue.message}`
          )
        };
      }

      return {
        success: true,
        data: validation.data as T,
        rawResponse
      };
    }

    // No schema validation
    return {
      success: true,
      data: parsedData as T,
      rawResponse
    };

  } catch (error) {
    console.error("LLM call failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown LLM error"
    };
  }
}

/**
 * Basic JSON repair for common issues
 */
function repairJSON(jsonString: string): string {
  let repaired = jsonString;

  // Remove markdown code fences
  repaired = repaired.replace(/```json\s*/g, '');
  repaired = repaired.replace(/```\s*/g, '');

  // Remove trailing commas
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // Fix unclosed strings (basic attempt)
  const stringMatches = repaired.match(/"[^"]*$/);
  if (stringMatches) {
    repaired += '"';
  }

  // Fix unclosed objects/arrays
  const openBraces = (repaired.match(/{/g) || []).length;
  const closeBraces = (repaired.match(/}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/]/g) || []).length;

  repaired += '}'.repeat(Math.max(0, openBraces - closeBraces));
  repaired += ']'.repeat(Math.max(0, openBrackets - closeBrackets));

  return repaired;
}

/**
 * Attempt to repair common schema validation issues
 */
function repairSchemaIssues(data: any, issues: z.ZodIssue[]): any {
  const repaired = JSON.parse(JSON.stringify(data)); // Deep clone

  for (const issue of issues) {
    const path = issue.path;
    
    if (issue.code === 'invalid_type') {
      // Try to coerce types
      if (issue.expected === 'array' && path.length > 0) {
        setNestedValue(repaired, path, []);
      } else if (issue.expected === 'object' && path.length > 0) {
        setNestedValue(repaired, path, {});
      } else if (issue.expected === 'string' && path.length > 0) {
        const value = getNestedValue(repaired, path);
        if (value !== undefined && value !== null) {
          setNestedValue(repaired, path, String(value));
        } else {
          setNestedValue(repaired, path, '');
        }
      } else if (issue.expected === 'number' && path.length > 0) {
        const value = getNestedValue(repaired, path);
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) {
          setNestedValue(repaired, path, parsed);
        }
      }
    } else if (issue.code === 'invalid_enum_value') {
      // Set to first allowed value if available
      if ('options' in issue && issue.options.length > 0) {
        setNestedValue(repaired, path, issue.options[0]);
      }
    }
  }

  return repaired;
}

/**
 * Get nested value from object by path
 */
function getNestedValue(obj: any, path: (string | number)[]): any {
  let current = obj;
  for (const key of path) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Set nested value in object by path
 */
function setNestedValue(obj: any, path: (string | number)[], value: any): void {
  if (path.length === 0) return;
  
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current) || current[key] === null || typeof current[key] !== 'object') {
      current[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    current = current[key];
  }
  
  current[path[path.length - 1]] = value;
}

// ===== ZOD SCHEMAS FOR HARDWARE DESIGN =====

export const InitialDesignSchema = z.object({
  considerations: z.array(z.string()),
  parts: z.array(z.object({
    role: z.string(),
    qty: z.number(),
    options: z.array(z.object({
      partNumber: z.string(),
      rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      reason: z.string(),
      estCostUSD: z.number()
    })),
    notes: z.string()
  })),
  estimated: z.object({
    dimensionsMm: z.object({
      width: z.number(),
      height: z.number(),
      depth: z.number()
    }),
    bomCostUSD: z.number(),
    powerBudgetW: z.number()
  }),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string())
});

export const DesignSpecSchema = z.object({
  components: z.array(z.object({
    role: z.string(),
    primary: z.object({
      partNumber: z.string(),
      qty: z.number()
    }),
    alternates: z.array(z.object({
      partNumber: z.string(),
      reason: z.string()
    }))
  })),
  connectors: z.array(z.object({
    kind: z.string(),
    count: z.number(),
    notes: z.string()
  })),
  wires: z.array(z.object({
    gauge: z.string(),
    count: z.number(),
    notes: z.string()
  })),
  deviceFootprint: z.object({
    widthMm: z.number(),
    heightMm: z.number(),
    depthMm: z.number()
  }),
  finalRefinedPrompt: z.string(),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string())
});

export const MasterPlanStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  subsystem: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done"]),
  dependsOn: z.array(z.string()),
  notes: z.string().optional()
});

export const MasterPlanSchema = z.object({
  projectId: z.string(),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  llmModel: z.string(),
  summary: z.string(),
  steps: z.array(MasterPlanStepSchema)
});

export const PinSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  name: z.string(),
  type: z.enum(["power", "ground", "io", "analog", "pwm", "communication", "other"]),
  enabled: z.boolean(),
  voltage: z.number().optional(),
  maxVoltage: z.number().optional(),
  maxCurrent: z.number().optional(),
  notes: z.string().optional(),
  layoutIndex: z.number().optional(),
  connectionHints: z.array(z.string()).optional()
});

export const ModuleSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  componentName: z.string(),
  componentId: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  voltage: z.number().optional().nullable(),
  maxVoltage: z.number().optional().nullable(),
  maxCurrent: z.number().optional().nullable(),
  avgPowerDraw: z.number().optional().nullable(),
  wifi: z.boolean().optional().nullable(),
  bluetooth: z.boolean().optional().nullable(),
  firmwareLanguage: z.string().optional().nullable(),
  softwareLanguage: z.string().optional().nullable(),
  computeRating: z.number().min(1).max(10).optional().nullable(),
  componentType: z.string().optional().nullable(),
  isMotorOrServo: z.boolean().optional().nullable(),
  servoMotorProps: z.object({
    controlCompatibilityClass: z.string().optional().nullable(),
    rangeOfMotion: z.string().optional().nullable(),
    torque: z.string().optional().nullable(),
    controlType: z.string().optional().nullable()
  }).optional().nullable(),
  notes: z.string().optional().nullable(),
  pinLayout: z.string().optional().nullable(),
  presets: z.array(z.string()).default([]),
  pins: z.array(PinSchema)
});

export const ModulesResponseSchema = z.object({
  modules: z.array(ModuleSchema),
  unmatched: z.array(z.string())
});

export const ActuatorEnrichmentSchema = z.object({
  moduleId: z.string(),
  servoMotorProps: z.object({
    controlCompatibilityClass: z.string().optional(),
    rangeOfMotion: z.string().optional(),
    torque: z.string().optional(),
    controlType: z.string().optional()
  }),
  controllerRequired: z.boolean(),
  controllerModule: ModuleSchema.optional(),
  additionalPins: z.array(PinSchema).optional()
});

export const ActuatorEnrichmentResponseSchema = z.object({
  enrichments: z.array(ActuatorEnrichmentSchema),
  warnings: z.array(z.string())
});

export const ConnectionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  fromPinId: z.string(),
  toPinId: z.string(),
  kind: z.enum(["power", "signal", "ground", "bus"]),
  netName: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const WiringResponseSchema = z.object({
  connections: z.array(ConnectionSchema),
  powerDistribution: z.object({
    voltageRails: z.array(z.string()),
    totalCurrentMa: z.number(),
    warnings: z.array(z.string())
  }),
  notes: z.array(z.string())
});

// Type exports
export type InitialDesign = z.infer<typeof InitialDesignSchema>;
export type DesignSpec = z.infer<typeof DesignSpecSchema>;
export type MasterPlan = z.infer<typeof MasterPlanSchema>;
export type MasterPlanStep = z.infer<typeof MasterPlanStepSchema>;
export type Module = z.infer<typeof ModuleSchema>;
export type Pin = z.infer<typeof PinSchema>;
export type ModulesResponse = z.infer<typeof ModulesResponseSchema>;
export type ActuatorEnrichment = z.infer<typeof ActuatorEnrichmentSchema>;
export type ActuatorEnrichmentResponse = z.infer<typeof ActuatorEnrichmentResponseSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type WiringResponse = z.infer<typeof WiringResponseSchema>;
