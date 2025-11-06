import OpenAI from "openai";
import { z } from "zod";
import { openAIConfig } from "../config";
import type { 
  MasterPlanStep, 
  ServoMotorProps, 
  DesignModule, 
  DesignPin 
} from "@shared/schema";

const openai = new OpenAI({
  apiKey: openAIConfig.apiKey
});

// ===== ZOD SCHEMAS FOR VALIDATION =====

// Schema for component alternates
const ComponentAlternateSchema = z.object({
  mpn: z.string(),
  manufacturer: z.string().optional(),
  price: z.number().optional(),
  availability: z.string().optional(),
  notes: z.string().optional(),
});

// Schema for component with alternates
const DesignComponentSchema = z.object({
  name: z.string(),
  category: z.string(),
  primaryMpn: z.string().optional(),
  alternates: z.array(ComponentAlternateSchema).optional(),
  specifications: z.record(z.any()).optional(),
  quantity: z.number().default(1),
});

// Schema for connectors/wires
const ConnectorSchema = z.object({
  type: z.string(), // USB, power jack, header, etc.
  count: z.number(),
  specifications: z.string().optional(),
});

// Schema for device footprint
const FootprintSchema = z.object({
  length: z.number(),
  width: z.number(),
  height: z.number(),
  unit: z.string().default("mm"),
});

// Schema for refined design spec
export const DesignSpecSchema = z.object({
  components: z.array(DesignComponentSchema),
  connectors: z.array(ConnectorSchema),
  footprint: FootprintSchema,
  refinedPrompt: z.string(),
  estimatedCost: z.number().optional(),
  powerRequirements: z.object({
    voltage: z.string(),
    estimatedCurrent: z.string(),
  }).optional(),
});

// Schema for Master Plan
const MasterPlanStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  subsystem: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done"]),
  dependsOn: z.array(z.string()),
  notes: z.string().optional(),
});

export const MasterPlanSchema = z.object({
  summary: z.string(),
  steps: z.array(MasterPlanStepSchema),
  estimatedDuration: z.string().optional(),
  complexity: z.enum(["low", "medium", "high"]).optional(),
});

// Schema for Module generation
const PinSchema = z.object({
  name: z.string(),
  type: z.enum(["power", "ground", "io", "analog", "pwm", "communication", "other"]),
  voltage: z.number().optional(),
  maxVoltage: z.number().optional(),
  maxCurrent: z.number().optional(),
  notes: z.string().optional(),
  connectionHints: z.array(z.string()).optional(),
});

export const ModuleSchema = z.object({
  componentName: z.string(),
  type: z.string(),
  voltage: z.number().optional(),
  maxVoltage: z.number().optional(),
  maxCurrent: z.number().optional(),
  avgPowerDraw: z.number().optional(),
  wifi: z.boolean().optional(),
  bluetooth: z.boolean().optional(),
  firmwareLanguage: z.string().optional(),
  softwareLanguage: z.string().optional(),
  computeRating: z.number().optional(),
  componentType: z.string().optional(),
  pins: z.array(PinSchema),
});

// Schema for motor/servo enrichment
export const ActuatorEnrichmentSchema = z.object({
  servoMotorProps: z.object({
    controlCompatibilityClass: z.string().optional(),
    rangeOfMotion: z.string().optional(),
    torque: z.string().optional(),
    controlType: z.string().optional(), // PWM, I2C, SPI, etc.
  }),
  controllerRequired: z.boolean(),
  controllerModule: ModuleSchema.optional(),
  additionalPins: z.array(PinSchema).optional(),
});

// Schema for wiring connections
const WiringConnectionSchema = z.object({
  fromModuleName: z.string(),
  fromPinName: z.string(),
  toModuleName: z.string(),
  toPinName: z.string(),
  kind: z.enum(["power", "signal", "ground", "bus"]),
  netName: z.string().optional(),
  notes: z.string().optional(),
});

export const WiringSchema = z.object({
  connections: z.array(WiringConnectionSchema),
  powerDistribution: z.object({
    voltageRails: z.array(z.string()),
    totalCurrent: z.string().optional(),
  }).optional(),
  notes: z.array(z.string()).optional(),
});

// Type exports
export type DesignSpec = z.infer<typeof DesignSpecSchema>;
export type MasterPlanData = z.infer<typeof MasterPlanSchema>;
export type ModuleData = z.infer<typeof ModuleSchema>;
export type ActuatorEnrichment = z.infer<typeof ActuatorEnrichmentSchema>;
export type WiringData = z.infer<typeof WiringSchema>;

// ===== INITIAL DESIGN GENERATION =====

export async function generateInitialDesign(prompt: string): Promise<{
  designConsiderations: string[];
  partSelections: Array<{
    partType: string;
    options: Array<{ name: string; pros: string; cons: string; estimatedCost: number }>;
  }>;
  dimensions: { length: number; width: number; height: number; unit: string };
  estimatedCost: number;
}> {
  const systemPrompt = `You are a product design engineering consultant for hardware projects. 
Analyze user requirements and provide design considerations, part options, dimensions, and cost estimates.
Create comprehensive lists intended for customer feedback before finalizing the design.`;

  const userPrompt = `Design prompt: ${prompt}

Please provide:
1. Key design considerations (functionality, constraints, manufacturability)
2. Part selections with 2-3 ranked options per component type
3. Estimated dimensions (length, width, height)
4. Total estimated cost

Return JSON format:
{
  "designConsiderations": ["consideration1", "consideration2", ...],
  "partSelections": [
    {
      "partType": "Microcontroller",
      "options": [
        {
          "name": "ESP32-WROOM-32",
          "pros": "WiFi/Bluetooth, low cost",
          "cons": "Higher power consumption",
          "estimatedCost": 4.50
        }
      ]
    }
  ],
  "dimensions": { "length": 100, "width": 80, "height": 30, "unit": "mm" },
  "estimatedCost": 45.00
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 3000
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result;
  } catch (error) {
    console.error('Initial design generation error:', error);
    throw new Error(`Failed to generate initial design: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ===== REFINED DESIGN SPEC GENERATION =====

export async function generateRefinedDesignSpec(
  originalPrompt: string,
  feedback: string,
  initialDesign?: any
): Promise<DesignSpec> {
  const systemPrompt = `You are a hardware design engineer. Based on customer feedback, 
refine the initial design and return a canonical JSON specification with components, connectors, 
wiring requirements, and device dimensions.`;

  const userPrompt = `Original design prompt: ${originalPrompt}

${initialDesign ? `Initial design:\n${JSON.stringify(initialDesign, null, 2)}\n` : ''}

Customer feedback: ${feedback}

Refine the design and return JSON format:
{
  "components": [
    {
      "name": "ESP32 Dev Board",
      "category": "microcontroller",
      "primaryMpn": "ESP32-DEVKITC-32D",
      "alternates": [
        {
          "mpn": "ESP32-WROOM-32",
          "manufacturer": "Espressif",
          "price": 4.50,
          "availability": "in_stock"
        }
      ],
      "specifications": {
        "voltage": "3.3V",
        "current": "500mA"
      },
      "quantity": 1
    }
  ],
  "connectors": [
    {
      "type": "USB-C",
      "count": 1,
      "specifications": "Power and data"
    }
  ],
  "footprint": {
    "length": 100,
    "width": 80,
    "height": 30,
    "unit": "mm"
  },
  "refinedPrompt": "Complete refined design description",
  "estimatedCost": 45.00,
  "powerRequirements": {
    "voltage": "5V",
    "estimatedCurrent": "1A"
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 3500
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Validate with Zod schema
    const validated = DesignSpecSchema.parse(result);
    return validated;
  } catch (error) {
    console.error('Refined design spec generation error:', error);
    
    // Attempt JSON repair on parse error
    if (error instanceof SyntaxError) {
      try {
        // Try basic JSON repair
        const content = (error as any).input || "";
        const repaired = repairJSON(content);
        const validated = DesignSpecSchema.parse(JSON.parse(repaired));
        return validated;
      } catch (repairError) {
        console.error('JSON repair failed:', repairError);
      }
    }
    
    throw new Error(`Failed to generate refined design spec: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ===== MASTER PLAN GENERATION =====

export async function generateMasterPlan(
  projectSummary: string,
  designSpec: DesignSpec
): Promise<MasterPlanData> {
  const systemPrompt = `You are a hardware project manager. Generate a structured master plan 
with incremental steps and subsystems for implementing the hardware design.`;

  const userPrompt = `Project summary: ${projectSummary}

Design specification:
${JSON.stringify(designSpec, null, 2)}

Generate a master plan with structured steps. Return JSON format:
{
  "summary": "High-level project summary",
  "steps": [
    {
      "id": "step-1",
      "label": "Initialize power subsystem",
      "subsystem": "power",
      "status": "todo",
      "dependsOn": [],
      "notes": "Set up voltage regulation and distribution"
    },
    {
      "id": "step-2",
      "label": "Configure MCU",
      "subsystem": "control",
      "status": "todo",
      "dependsOn": ["step-1"],
      "notes": "Initialize microcontroller and GPIO"
    }
  ],
  "estimatedDuration": "4 weeks",
  "complexity": "medium"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 2500
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Validate with Zod schema
    const validated = MasterPlanSchema.parse(result);
    return validated;
  } catch (error) {
    console.error('Master plan generation error:', error);
    throw new Error(`Failed to generate master plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ===== MODULE GENERATION =====

export async function generateModuleFromSpec(
  componentSpec: any,
  context: { projectSummary: string; designSpec: DesignSpec }
): Promise<ModuleData> {
  const systemPrompt = `You are a hardware engineer. Generate detailed module specifications 
with pin definitions based on the component specification.`;

  const userPrompt = `Component: ${JSON.stringify(componentSpec, null, 2)}

Project context:
${context.projectSummary}

Generate module JSON conforming to this schema:
{
  "componentName": "Component name",
  "type": "microcontroller|sensor|actuator|power|communication|passive|other",
  "voltage": 3300,
  "maxVoltage": 3600,
  "maxCurrent": 500,
  "avgPowerDraw": 250,
  "wifi": false,
  "bluetooth": false,
  "firmwareLanguage": "cpp",
  "softwareLanguage": "c",
  "computeRating": 5,
  "componentType": "MCU",
  "pins": [
    {
      "name": "VCC",
      "type": "power",
      "voltage": 3300,
      "maxVoltage": 3600,
      "maxCurrent": 500,
      "notes": "Power input",
      "connectionHints": ["Connect to 3.3V rail"]
    }
  ]
}

Pin types: power, ground, io, analog, pwm, communication, other
Voltage/current in integer millivolts/milliamps`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 2500
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Validate with Zod schema
    const validated = ModuleSchema.parse(result);
    return validated;
  } catch (error) {
    console.error('Module generation error:', error);
    throw new Error(`Failed to generate module: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ===== ACTUATOR ENRICHMENT =====

export async function enrichActuatorModule(
  module: DesignModule & { pins?: DesignPin[] },
  context: { projectSummary: string }
): Promise<ActuatorEnrichment> {
  const systemPrompt = `You are a robotics and motion control engineer. Analyze servo/motor 
requirements and determine control requirements, compatibility, and necessary driver modules.`;

  const userPrompt = `Actuator module: ${JSON.stringify(module, null, 2)}

Project context: ${context.projectSummary}

Determine:
1. Servo/motor control requirements (PWM frequency, control IC needed, etc.)
2. Compatibility class (standard servo, stepper, DC motor, etc.)
3. Range of motion or movement specifications
4. Whether a separate controller/driver module is required
5. Additional pins needed for control

Return JSON format:
{
  "servoMotorProps": {
    "controlCompatibilityClass": "Standard PWM Servo",
    "rangeOfMotion": "0-180 degrees",
    "torque": "5 kg-cm",
    "controlType": "PWM"
  },
  "controllerRequired": true,
  "controllerModule": {
    "componentName": "PCA9685 PWM Driver",
    "type": "driver",
    "pins": [...]
  },
  "additionalPins": [
    {
      "name": "PWM_CONTROL",
      "type": "pwm",
      "voltage": 3300,
      "notes": "50Hz PWM signal"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 2000
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Validate with Zod schema
    const validated = ActuatorEnrichmentSchema.parse(result);
    return validated;
  } catch (error) {
    console.error('Actuator enrichment error:', error);
    throw new Error(`Failed to enrich actuator: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ===== WIRING GENERATION =====

export async function generateWiring(
  modules: Array<DesignModule & { pins?: DesignPin[] }>,
  context: { projectSummary: string; designSpec: DesignSpec }
): Promise<WiringData> {
  const systemPrompt = `You are an electrical engineer specializing in PCB design and wiring. 
Analyze modules and their pins to generate complete wiring connections for power, ground, and signals.`;

  // Create simplified representation for LLM
  const modulesData = modules.map(m => ({
    name: m.componentName,
    type: m.type,
    pins: (m.pins || []).map(p => ({
      name: p.name,
      type: p.type,
      voltage: p.voltage,
      hints: p.connectionHints
    }))
  }));

  const userPrompt = `Modules and pins:
${JSON.stringify(modulesData, null, 2)}

Project context: ${context.projectSummary}

Generate wiring connections that:
1. Connect all power pins to appropriate voltage rails
2. Connect all ground pins together
3. Connect signal pins for communication (I2C, SPI, UART, etc.)
4. Connect control signals (PWM, GPIO, etc.)
5. Create proper power distribution

Return JSON format:
{
  "connections": [
    {
      "fromModuleName": "ESP32",
      "fromPinName": "3V3_OUT",
      "toModuleName": "Sensor",
      "toPinName": "VCC",
      "kind": "power",
      "netName": "3V3",
      "notes": "Power supply to sensor"
    }
  ],
  "powerDistribution": {
    "voltageRails": ["3.3V", "5V"],
    "totalCurrent": "1.5A"
  },
  "notes": ["Use decoupling capacitors on all power rails"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 3500
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Validate with Zod schema
    const validated = WiringSchema.parse(result);
    return validated;
  } catch (error) {
    console.error('Wiring generation error:', error);
    throw new Error(`Failed to generate wiring: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ===== UTILITY FUNCTIONS =====

// Basic JSON repair for common issues
function repairJSON(jsonString: string): string {
  // Remove trailing commas
  let repaired = jsonString.replace(/,(\s*[}\]])/g, '$1');
  
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

// Check for hazardous keywords in design outputs
export function checkHazardousContent(content: string): { 
  hasConcerns: boolean; 
  warnings: string[] 
} {
  const hazardousKeywords = [
    'high voltage',
    'mains voltage',
    '220v',
    '110v',
    'ac power',
    'lithium polymer',
    'lipo',
    'explosive',
    'flammable',
    'toxic',
    'radioactive'
  ];
  
  const warnings: string[] = [];
  const lowerContent = content.toLowerCase();
  
  for (const keyword of hazardousKeywords) {
    if (lowerContent.includes(keyword)) {
      warnings.push(`Detected potentially hazardous element: ${keyword}`);
    }
  }
  
  return {
    hasConcerns: warnings.length > 0,
    warnings
  };
}

// Identify if a module is a motor/servo
export function isMotorOrServo(module: { componentName: string; type?: string; componentType?: string }): boolean {
  const text = `${module.componentName} ${module.type || ''} ${module.componentType || ''}`.toLowerCase();
  
  return text.includes('motor') || 
         text.includes('servo') || 
         text.includes('stepper') ||
         text.includes('actuator');
}
