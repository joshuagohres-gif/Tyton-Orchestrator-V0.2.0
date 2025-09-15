import OpenAI from "openai";
import { z } from "zod";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "" 
});

// ===== ZOD SCHEMAS FOR VALIDATION =====

// Schema for component port definitions
const PortSchema = z.object({
  id: z.string(),
  type: z.enum(["power", "data", "analog", "digital", "ground"]),
  label: z.string(),
  voltage: z.number().optional(),
  maxCurrent: z.number().optional()
});

// Schema for component specifications
const ComponentSpecSchema = z.object({
  voltage: z.string().optional(),
  current: z.string().optional(),
  frequency: z.string().optional(),
  power: z.string().optional(),
  resistance: z.string().optional(),
  capacitance: z.string().optional(),
  inductance: z.string().optional(),
  tolerance: z.string().optional()
}).passthrough(); // Allow additional fields

// Schema for circuit components
const ComponentSchema = z.object({
  id: z.string(),
  type: z.enum(["microcontroller", "sensor", "communication", "power", "passive", "actuator", "display", "connector"]),
  label: z.string(),
  mpn: z.string().optional(),
  manufacturer: z.string().optional(),
  specifications: ComponentSpecSchema,
  position: z.object({
    x: z.number(),
    y: z.number()
  }),
  ports: z.array(PortSchema)
});

// Schema for circuit connections
const ConnectionSchema = z.object({
  from: z.object({
    componentId: z.string(),
    portId: z.string()
  }),
  to: z.object({
    componentId: z.string(),
    portId: z.string()
  }),
  type: z.enum(["power", "data", "analog", "digital", "ground"])
});

// Complete circuit design schema
export const CircuitDesignSchema = z.object({
  components: z.array(ComponentSchema),
  connections: z.array(ConnectionSchema),
  firmwareCode: z.string(),
  explanation: z.string(),
  powerRequirements: z.object({
    totalPower: z.string(),
    voltageRails: z.array(z.string())
  }).optional()
});

// Guide sheet constraint schemas
const ComponentConstraintSchema = z.object({
  category: z.string(),
  required: z.boolean(),
  count: z.object({
    min: z.number(),
    max: z.number()
  }),
  allowedTypes: z.array(z.string()),
  specifications: z.record(z.any()).optional(),
  recommendedParts: z.array(z.string()).optional()
});

const PinMappingSchema = z.object({
  function: z.string(),
  allowedPins: z.array(z.string()),
  constraints: z.array(z.string()).optional()
});

const DesignRuleSchema = z.object({
  category: z.enum(["electrical", "thermal", "mechanical", "layout"]),
  rule: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  validation: z.string().optional()
});

// Complete guide sheet schema
export const GuideSheetSchema = z.object({
  projectRequirements: z.object({
    title: z.string(),
    description: z.string(),
    functionality: z.array(z.string()),
    constraints: z.array(z.string())
  }),
  componentRequirements: z.array(ComponentConstraintSchema),
  electricalConstraints: z.object({
    maxVoltage: z.number(),
    maxCurrent: z.number(),
    powerBudget: z.number(),
    voltageRails: z.array(z.object({
      voltage: z.number(),
      tolerance: z.number(),
      maxCurrent: z.number()
    }))
  }),
  pinMappings: z.array(PinMappingSchema),
  designRules: z.array(DesignRuleSchema),
  validationCriteria: z.array(z.string())
});

// Type exports from schemas
export type GuideSheet = z.infer<typeof GuideSheetSchema>;
export type CircuitDesign = z.infer<typeof CircuitDesignSchema>;

export interface CircuitGenerationRequest {
  userBrief: string;
  projectTitle: string;
  existingComponents?: any[];
  guideSheet?: GuideSheet; // Add guide sheet parameter
}

export interface CircuitGenerationResponse {
  components: {
    id: string;
    type: string;
    label: string;
    mpn?: string;
    specifications: Record<string, any>;
    position: { x: number; y: number };
    ports: { id: string; type: string; label: string }[];
  }[];
  connections: {
    from: { componentId: string; portId: string };
    to: { componentId: string; portId: string };
    type: string;
  }[];
  firmwareCode: string;
  explanation: string;
}

// ===== PHASE 1: GUIDE SHEET GENERATION =====

export async function generateGuideSheet(userBrief: string, projectTitle: string): Promise<GuideSheet> {
  const prompt = `You are an expert hardware design architect. Analyze the following requirements and generate a comprehensive guide sheet that will constrain and guide the circuit design.

Project: ${projectTitle}
Requirements: ${userBrief}

Generate a JSON guide sheet with the following structure:
{
  "projectRequirements": {
    "title": "Project title",
    "description": "Detailed project description",
    "functionality": ["List of required functions"],
    "constraints": ["Physical, cost, or other constraints"]
  },
  "componentRequirements": [
    {
      "category": "microcontroller",
      "required": true,
      "count": { "min": 1, "max": 1 },
      "allowedTypes": ["ESP32", "Arduino", "STM32"],
      "specifications": {
        "minRAM": "4KB",
        "minFlash": "32KB",
        "features": ["WiFi", "GPIO"]
      },
      "recommendedParts": ["ESP32-DEVKITC-32D", "Arduino Uno R3"]
    }
  ],
  "electricalConstraints": {
    "maxVoltage": 12,
    "maxCurrent": 2,
    "powerBudget": 10,
    "voltageRails": [
      {
        "voltage": 3.3,
        "tolerance": 0.1,
        "maxCurrent": 0.5
      },
      {
        "voltage": 5,
        "tolerance": 0.25,
        "maxCurrent": 1
      }
    ]
  },
  "pinMappings": [
    {
      "function": "I2C_SDA",
      "allowedPins": ["GPIO21", "GPIO4"],
      "constraints": ["Must have pull-up resistor"]
    },
    {
      "function": "PWM_OUTPUT",
      "allowedPins": ["GPIO2", "GPIO15", "GPIO13"],
      "constraints": ["Max frequency 1kHz"]
    }
  ],
  "designRules": [
    {
      "category": "electrical",
      "rule": "All digital signals must be 3.3V logic level",
      "severity": "error"
    },
    {
      "category": "thermal",
      "rule": "Components dissipating >0.5W need heatsinking",
      "severity": "warning"
    }
  ],
  "validationCriteria": [
    "Circuit must operate from single power supply",
    "Total cost must be under $50",
    "Must fit on 100x100mm PCB"
  ]
}

Focus on creating practical, manufacturable constraints that will guide the circuit design while allowing flexibility for implementation.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are a hardware design architect specializing in creating design constraints and specifications. Generate structured guide sheets that ensure circuits meet requirements while being manufacturable and cost-effective."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7, // Lower temperature for more consistent constraints
      max_completion_tokens: 3000
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Validate with Zod schema
    try {
      const validatedGuideSheet = GuideSheetSchema.parse(result);
      return validatedGuideSheet;
    } catch (zodError) {
      console.warn("Guide sheet validation warning:", zodError);
      
      // Return a minimal valid guide sheet on validation failure
      const fallbackGuideSheet: GuideSheet = {
        projectRequirements: {
          title: projectTitle || "Hardware Project",
          description: userBrief || "Create a functional circuit",
          functionality: ["Basic circuit functionality"],
          constraints: ["Standard constraints apply"]
        },
        componentRequirements: [
          {
            category: "microcontroller",
            required: true,
            count: { min: 1, max: 2 },
            allowedTypes: ["ESP32", "Arduino", "STM32"],
            specifications: {},
            recommendedParts: ["ESP32-DEVKITC-32D"]
          }
        ],
        electricalConstraints: {
          maxVoltage: 12,
          maxCurrent: 2,
          powerBudget: 10,
          voltageRails: [
            {
              voltage: 3.3,
              tolerance: 0.1,
              maxCurrent: 0.5
            }
          ]
        },
        pinMappings: [],
        designRules: [
          {
            category: "electrical",
            rule: "Use standard voltage levels",
            severity: "warning"
          }
        ],
        validationCriteria: ["Circuit must be functional"]
      };
      
      return fallbackGuideSheet;
    }
  } catch (error) {
    console.error('Guide sheet generation error:', error);
    
    // Return minimal guide sheet on error
    const minimalGuideSheet: GuideSheet = {
      projectRequirements: {
        title: projectTitle || "Hardware Project",
        description: userBrief || "Create a circuit",
        functionality: ["Basic functionality"],
        constraints: []
      },
      componentRequirements: [
        {
          category: "microcontroller",
          required: true,
          count: { min: 1, max: 1 },
          allowedTypes: ["ESP32"],
          specifications: {}
        }
      ],
      electricalConstraints: {
        maxVoltage: 5,
        maxCurrent: 1,
        powerBudget: 5,
        voltageRails: [
          {
            voltage: 3.3,
            tolerance: 0.1,
            maxCurrent: 0.5
          }
        ]
      },
      pinMappings: [],
      designRules: [],
      validationCriteria: []
    };
    
    return minimalGuideSheet;
  }
}

// ===== PHASE 2: CONSTRAINED CIRCUIT GENERATION =====

export async function generateCircuit(request: CircuitGenerationRequest): Promise<CircuitGenerationResponse> {
  // Build prompt based on whether guide sheet is provided
  let prompt: string;
  
  if (request.guideSheet) {
    // Phase 2: Constrained generation with guide sheet
    prompt = `You are an expert hardware design engineer. Generate a complete circuit design that STRICTLY adheres to the provided guide sheet constraints.

Project: ${request.projectTitle}
Requirements: ${request.userBrief}

GUIDE SHEET CONSTRAINTS (MUST FOLLOW):
${JSON.stringify(request.guideSheet, null, 2)}

IMPORTANT RULES:
1. You MUST only use components that match the componentRequirements in the guide sheet
2. You MUST respect the electrical constraints (voltage, current, power budget)
3. You MUST follow all design rules specified in the guide sheet
4. Pin mappings MUST match the allowedPins specified for each function
5. The circuit MUST meet all validation criteria

Generate a JSON response with the following structure:
{
  "components": [
    {
      "id": "unique_component_id",
      "type": "microcontroller|sensor|communication|power|passive|actuator|display|connector",
      "label": "Human readable label",
      "mpn": "Manufacturer part number (MUST be from recommendedParts if provided)",
      "manufacturer": "Component manufacturer",
      "specifications": {
        "voltage": "3.3V",
        "current": "100mA",
        "other_specs": "..."
      },
      "position": { "x": 100, "y": 100 },
      "ports": [
        { "id": "port_id", "type": "power|data|analog|digital|ground", "label": "GPIO0" }
      ]
    }
  ],
  "connections": [
    {
      "from": { "componentId": "comp1", "portId": "port1" },
      "to": { "componentId": "comp2", "portId": "port2" },
      "type": "power|data|analog|digital|ground"
    }
  ],
  "firmwareCode": "Complete Arduino/ESP32 firmware code that uses the specified pin mappings",
  "explanation": "Detailed explanation of how the circuit meets all guide sheet requirements",
  "powerRequirements": {
    "totalPower": "Calculated total power in watts",
    "voltageRails": ["List of voltage rails used"]
  }
}`;
  } else {
    // Legacy path: Original unconstrained generation
    prompt = `You are an expert hardware design engineer. Generate a complete circuit design based on the following requirements:

Project: ${request.projectTitle}
Requirements: ${request.userBrief}

Generate a JSON response with the following structure:
{
  "components": [
    {
      "id": "unique_component_id",
      "type": "microcontroller|sensor|communication|power|passive|actuator|display|connector",
      "label": "Human readable label",
      "mpn": "Manufacturer part number if known",
      "manufacturer": "Component manufacturer",
      "specifications": {
        "voltage": "3.3V",
        "current": "100mA",
        "other_specs": "..."
      },
      "position": { "x": 100, "y": 100 },
      "ports": [
        { "id": "port_id", "type": "power|data|analog|digital|ground", "label": "GPIO0" }
      ]
    }
  ],
  "connections": [
    {
      "from": { "componentId": "comp1", "portId": "port1" },
      "to": { "componentId": "comp2", "portId": "port2" },
      "type": "power|data|analog|digital|ground"
    }
  ],
  "firmwareCode": "Complete Arduino/ESP32 firmware code",
  "explanation": "Detailed explanation of the circuit design"
}

Focus on:
1. Practical, manufacturable components with real part numbers when possible
2. Proper power distribution and decoupling
3. Appropriate GPIO assignments
4. Complete, compilable firmware code
5. Clear, educational explanations`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert hardware design engineer specializing in IoT and embedded systems. Generate practical, manufacturable circuit designs with real components. Always respond with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 4000
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Validate and ensure proper structure
    const validatedResult: CircuitGenerationResponse = {
      components: Array.isArray(result.components) ? result.components : [],
      connections: Array.isArray(result.connections) ? result.connections : [],
      firmwareCode: result.firmwareCode || "",
      explanation: result.explanation || "No explanation provided"
    };

    // Ensure each component has required fields
    validatedResult.components = validatedResult.components.map((comp: any, index: number) => ({
      id: comp.id || `component_${index}`,
      type: comp.type || "passive",
      label: comp.label || `Component ${index + 1}`,
      mpn: comp.mpn,
      specifications: comp.specifications || {},
      position: comp.position || { x: 100 + index * 150, y: 100 },
      ports: Array.isArray(comp.ports) ? comp.ports : []
    }));

    // Validate connections reference existing components
    const componentIds = new Set(validatedResult.components.map(c => c.id));
    validatedResult.connections = validatedResult.connections.filter((conn: any) => {
      return conn?.from?.componentId && conn?.to?.componentId &&
             componentIds.has(conn.from.componentId) && 
             componentIds.has(conn.to.componentId);
    });

    return validatedResult;
  } catch (error) {
    console.error('Circuit generation error:', error);
    
    // Return a default minimal circuit on error
    return {
      components: [
        {
          id: "mcu_1",
          type: "microcontroller",
          label: "ESP32 Development Board",
          mpn: "ESP32-DEVKITC-32D",
          specifications: {
            voltage: "3.3V",
            current: "500mA",
            cpu: "Dual-core 240MHz",
            memory: "520KB SRAM"
          },
          position: { x: 200, y: 200 },
          ports: [
            { id: "vcc", type: "power", label: "3.3V" },
            { id: "gnd", type: "power", label: "GND" },
            { id: "gpio0", type: "digital", label: "GPIO0" }
          ]
        }
      ],
      connections: [],
      firmwareCode: "// Basic ESP32 firmware\nvoid setup() {\n  Serial.begin(115200);\n  Serial.println(\"ESP32 Ready\");\n}\n\nvoid loop() {\n  delay(1000);\n}",
      explanation: "Default circuit with ESP32 microcontroller. AI generation failed, please try again."
    };
  }
}

export interface ComponentSuggestionRequest {
  requirements: string;
  category: string;
  existingComponents?: string[];
}

export interface ComponentSuggestionResponse {
  suggestions: {
    mpn: string;
    manufacturer: string;
    name: string;
    description: string;
    specifications: Record<string, any>;
    reasoning: string;
    alternatives: string[];
  }[];
}

export async function suggestComponents(request: ComponentSuggestionRequest): Promise<ComponentSuggestionResponse> {
  const prompt = `Suggest hardware components for the following requirements:

Category: ${request.category}
Requirements: ${request.requirements}
${request.existingComponents ? `Existing components: ${request.existingComponents.join(', ')}` : ''}

Provide real, available components with manufacturer part numbers. Response in JSON format:
{
  "suggestions": [
    {
      "mpn": "ESP32-S3-WROOM-1",
      "manufacturer": "Espressif",
      "name": "ESP32-S3 WiFi/BLE Module",
      "description": "Dual-core WiFi and Bluetooth module",
      "specifications": {
        "voltage": "3.3V",
        "current": "240mA",
        "frequency": "240MHz",
        "connectivity": ["WiFi", "Bluetooth"]
      },
      "reasoning": "Perfect for IoT applications requiring both WiFi and Bluetooth",
      "alternatives": ["ESP32-WROOM-32", "ESP8266-12F"]
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are a hardware component specialist with extensive knowledge of electronic components, their specifications, and availability."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 2000
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result as ComponentSuggestionResponse;
  } catch (error) {
    throw new Error(`Component suggestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function validateCircuit(circuitData: any): Promise<{ isValid: boolean; issues: string[]; suggestions: string[] }> {
  const prompt = `Validate this hardware circuit design and identify any issues:

Circuit Data: ${JSON.stringify(circuitData, null, 2)}

Analyze for:
1. Power supply adequacy
2. GPIO pin conflicts
3. Electrical compatibility
4. Missing connections
5. Component availability
6. Design rule violations

Return JSON format:
{
  "isValid": true/false,
  "issues": ["Issue 1", "Issue 2"],
  "suggestions": ["Suggestion 1", "Suggestion 2"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are a circuit validation expert. Identify electrical and design issues in hardware circuits."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 1500
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result;
  } catch (error) {
    throw new Error(`Circuit validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
