import OpenAI from "openai";
import { z } from "zod";
import { openAIConfig } from "../config";

// Initialize OpenAI with validated configuration
const openai = new OpenAI({
  apiKey: openAIConfig.apiKey
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
  powerRequirements?: {
    totalPower: string;
    voltageRails: string[];
  };
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
    },
    {
      "category": "sensor",
      "required": true,
      "count": { "min": 1, "max": 3 },
      "allowedTypes": ["DHT22", "BME280", "DS18B20"],
      "specifications": {
        "type": "temperature and humidity",
        "interface": "I2C or OneWire"
      }
    }
  ],

IMPORTANT: Use only these standard component categories for "category" field:
- microcontroller (MCUs, Arduino, ESP32, etc.)
- sensor (temperature, humidity, motion, light, etc.)
- communication (WiFi, Bluetooth, LoRa, etc.)
- power (batteries, regulators, chargers, etc.)
- passive (resistors, capacitors, inductors, etc.)
- actuator (motors, LEDs, buzzers, relays, etc.)
- display (LCD, OLED, e-ink, etc.)
- connector (headers, terminals, jacks, etc.)

Use specific sensor types in "allowedTypes" and "specifications" but keep "category" as "sensor".

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
      model: "gpt-4o",
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
      temperature: 1, // Default temperature required by the model
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


// ===== MODULE DETECTION AND FIRMWARE GENERATION =====

// Detect if a component is programmable and determine its language
export function detectProgrammableModule(component: any): {
  isProgrammable: boolean;
  language: string;
  platform: string;
  capabilities: string[];
} {
  const typeLC = component.type?.toLowerCase() || '';
  const labelLC = component.label?.toLowerCase() || '';
  const mpnLC = component.mpn?.toLowerCase() || '';
  const combinedText = `${typeLC} ${labelLC} ${mpnLC}`.toLowerCase();
  
  // Check for FPGAs first (by label/MPN since type enum doesn't include FPGA)
  if (combinedText.match(/fpga|cpld|xilinx|artix|spartan|lattice|ice40|cyclone|altera|zynq/)) {
    if (combinedText.includes('ice40') || combinedText.includes('lattice')) {
      return {
        isProgrammable: true,
        language: 'verilog',
        platform: 'Lattice iCE40',
        capabilities: ['Configurable Logic', 'Block RAM', 'PLLs', 'GPIO']
      };
    }
    if (combinedText.match(/artix|spartan|xilinx|zynq/)) {
      return {
        isProgrammable: true,
        language: 'vhdl',
        platform: 'Xilinx',
        capabilities: ['Configurable Logic', 'Block RAM', 'DSP', 'PLLs', 'GPIO']
      };
    }
    if (combinedText.match(/cyclone|altera|intel/)) {
      return {
        isProgrammable: true,
        language: 'verilog',
        platform: 'Intel/Altera',
        capabilities: ['Configurable Logic', 'Block RAM', 'DSP', 'PLLs', 'GPIO']
      };
    }
    // Generic FPGA
    return {
      isProgrammable: true,
      language: 'verilog',
      platform: 'Generic FPGA',
      capabilities: ['Configurable Logic', 'Block RAM', 'GPIO']
    };
  }
  
  // Check for SoCs and processors (by label/MPN)
  if (combinedText.match(/raspberry|bcm|soc|processor|zynq|imx|am335|rockchip/)) {
    if (combinedText.includes('raspberry') || combinedText.includes('bcm')) {
      return {
        isProgrammable: true,
        language: 'python',
        platform: 'Raspberry Pi',
        capabilities: ['Linux', 'GPIO', 'I2C', 'SPI', 'UART', 'USB', 'Ethernet', 'HDMI']
      };
    }
    if (combinedText.includes('zynq')) {
      return {
        isProgrammable: true,
        language: 'c',
        platform: 'Xilinx Zynq',
        capabilities: ['ARM Cortex-A9', 'FPGA Fabric', 'Linux', 'GPIO', 'I2C', 'SPI', 'UART']
      };
    }
    // Generic SoC
    return {
      isProgrammable: true,
      language: 'c',
      platform: 'Generic SoC',
      capabilities: ['Linux', 'GPIO', 'I2C', 'SPI', 'UART']
    };
  }
  
  // Check for microcontrollers (including by label/MPN when type is generic)
  if (typeLC.includes('microcontroller') || typeLC === 'mcu' || 
      combinedText.match(/esp32|esp8266|arduino|stm32|rp2040|pico|atmega|pic|msp430|nrf52/)) {
    // ESP32 variants
    if (mpnLC.includes('esp32') || labelLC.includes('esp32')) {
      return {
        isProgrammable: true,
        language: 'cpp', // Arduino/ESP-IDF
        platform: 'ESP32',
        capabilities: ['WiFi', 'Bluetooth', 'GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART']
      };
    }
    // ESP8266
    if (mpnLC.includes('esp8266') || labelLC.includes('esp8266')) {
      return {
        isProgrammable: true,
        language: 'cpp',
        platform: 'ESP8266',
        capabilities: ['WiFi', 'GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART']
      };
    }
    // Arduino boards
    if (mpnLC.includes('arduino') || labelLC.includes('arduino')) {
      return {
        isProgrammable: true,
        language: 'cpp',
        platform: 'Arduino',
        capabilities: ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART']
      };
    }
    // STM32
    if (mpnLC.includes('stm32') || labelLC.includes('stm32')) {
      return {
        isProgrammable: true,
        language: 'c',
        platform: 'STM32',
        capabilities: ['GPIO', 'ADC', 'DAC', 'PWM', 'I2C', 'SPI', 'UART', 'CAN', 'USB']
      };
    }
    // Raspberry Pi Pico
    if (mpnLC.includes('rp2040') || labelLC.includes('pico')) {
      return {
        isProgrammable: true,
        language: 'python', // MicroPython default
        platform: 'RP2040',
        capabilities: ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART', 'PIO']
      };
    }
    // Generic microcontroller
    return {
      isProgrammable: true,
      language: 'cpp',
      platform: 'Generic MCU',
      capabilities: ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART']
    };
    // Nordic nRF52
    if (combinedText.includes('nrf52') || combinedText.includes('nordic')) {
      return {
        isProgrammable: true,
        language: 'c',
        platform: 'Nordic nRF52',
        capabilities: ['Bluetooth LE', 'GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART']
      };
    }
    // PIC microcontrollers
    if (combinedText.match(/pic16|pic18|pic24|pic32|microchip/)) {
      return {
        isProgrammable: true,
        language: 'c',
        platform: 'PIC',
        capabilities: ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART']
      };
    }
  }
  
  // Not programmable
  return {
    isProgrammable: false,
    language: '',
    platform: '',
    capabilities: []
  };
}

// Generate firmware for a specific programmable module
export async function generateModuleFirmware({
  component,
  circuitContext,
  projectRequirements,
  connections
}: {
  component: any;
  circuitContext: any;
  projectRequirements: string;
  connections: any[];
}): Promise<{
  code: string;
  language: string;
  platform: string;
  setupInstructions: string;
  dependencies: string[];
}> {
  const moduleInfo = detectProgrammableModule(component);
  
  if (!moduleInfo.isProgrammable) {
    throw new Error(`Component ${component.label} is not programmable`);
  }
  
  // Find connected components
  const connectedComponents = connections
    .filter(conn => 
      conn.from?.componentId === component.id || 
      conn.to?.componentId === component.id
    )
    .map(conn => {
      const otherComponentId = conn.from?.componentId === component.id 
        ? conn.to?.componentId 
        : conn.from?.componentId;
      return circuitContext.components?.find((c: any) => c.id === otherComponentId);
    })
    .filter(Boolean);
  
  const prompt = `Generate firmware code for this programmable module:

Module: ${component.label} (${component.mpn || 'Generic'})
Type: ${component.type}
Platform: ${moduleInfo.platform}
Language: ${moduleInfo.language}
Capabilities: ${moduleInfo.capabilities.join(', ')}

Project Requirements:
${projectRequirements}

Connected Components:
${connectedComponents.map((c: any) => `- ${c.label} (${c.type})`).join('\n')}

Connections:
${connections.filter(conn => 
    conn.from?.componentId === component.id || 
    conn.to?.componentId === component.id
  ).map(conn => `- ${conn.from?.componentId}:${conn.from?.portId} -> ${conn.to?.componentId}:${conn.to?.portId}`).join('\n')}

Generate complete, production-ready firmware code that:
1. Initializes all connected peripherals
2. Implements the main functionality based on project requirements
3. Handles all I/O operations with connected components
4. Includes proper error handling and safety checks
5. Uses appropriate libraries for the platform
6. Includes setup/configuration instructions

Return JSON format:
{
  "code": "// Complete firmware code here",
  "language": "${moduleInfo.language}",
  "platform": "${moduleInfo.platform}",
  "setupInstructions": "Step-by-step setup guide",
  "dependencies": ["library1", "library2"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an embedded systems expert specializing in ${moduleInfo.platform} firmware development. Generate production-ready, well-commented code.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 3000
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      code: result.code || `// ${moduleInfo.platform} firmware\nvoid setup() { }\nvoid loop() { }`,
      language: result.language || moduleInfo.language,
      platform: result.platform || moduleInfo.platform,
      setupInstructions: result.setupInstructions || "No setup instructions provided",
      dependencies: result.dependencies || []
    };
  } catch (error) {
    console.error("Firmware generation failed:", error);
    
    // Return fallback firmware based on platform
    return {
      code: generateFallbackFirmware(moduleInfo),
      language: moduleInfo.language,
      platform: moduleInfo.platform,
      setupInstructions: "Basic setup for " + moduleInfo.platform,
      dependencies: []
    };
  }
}

// Generate fallback firmware for when AI generation fails
function generateFallbackFirmware(moduleInfo: any): string {
  if (moduleInfo.platform === 'ESP32') {
    return `// ESP32 Firmware
#include <WiFi.h>

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32 initialized");
  
  // Initialize GPIO pins
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}`;
  } else if (moduleInfo.platform === 'Arduino') {
    return `// Arduino Firmware
void setup() {
  Serial.begin(9600);
  Serial.println("Arduino initialized");
  
  // Initialize GPIO pins
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}`;
  } else if (moduleInfo.platform === 'RP2040') {
    return `# MicroPython firmware for RP2040
import machine
import time

# Initialize LED
led = machine.Pin(25, machine.Pin.OUT)

print("RP2040 initialized")

while True:
    led.on()
    time.sleep(1)
    led.off()
    time.sleep(1)`;
  } else if (moduleInfo.language === 'verilog') {
    return `// Verilog module for ${moduleInfo.platform}
module top(
    input clk,
    input rst,
    output reg led
);

reg [23:0] counter;

always @(posedge clk or posedge rst) begin
    if (rst) begin
        counter <= 0;
        led <= 0;
    end else begin
        counter <= counter + 1;
        if (counter == 24'hFFFFFF) begin
            led <= ~led;
            counter <= 0;
        end
    end
end

endmodule`;
  } else {
    return `// Generic firmware for ${moduleInfo.platform}\n// Language: ${moduleInfo.language}\n\nvoid setup() {\n  // Initialize\n}\n\nvoid loop() {\n  // Main loop\n}`;
  }
}

// ===== CUSTOM MODULE DESIGNER =====

export interface CustomModuleRequest {
  name: string;
  description: string;
  category: string; // microcontroller, sensor, actuator, etc.
  specifications: string; // User requirements for the module
  pinCount?: number;
  package?: string; // DIP, SMD, BGA, etc.
  features?: string[]; // List of required features
}

export interface CustomModuleDesign {
  name: string;
  mpn: string;
  manufacturer: string;
  category: string;
  description: string;
  specifications: Record<string, any>;
  pinout: Array<{
    number: number;
    name: string;
    type: string; // power, ground, gpio, analog, etc.
    description: string;
  }>;
  electricalCharacteristics: {
    operatingVoltage: string;
    currentConsumption: string;
    powerDissipation: string;
    temperature: { min: string; max: string; };
  };
  package: {
    type: string;
    dimensions: { width: string; height: string; depth?: string; };
    pitch?: string;
  };
  edaSymbol?: string; // KiCad symbol data
  edaFootprint?: string; // KiCad footprint data
}

export async function designCustomModule(request: CustomModuleRequest): Promise<CustomModuleDesign> {
  const prompt = `Design a custom electronic module based on these requirements:

Name: ${request.name}
Description: ${request.description}
Category: ${request.category}
Specifications: ${request.specifications}
${request.pinCount ? `Pin Count: ${request.pinCount}` : ''}
${request.package ? `Package Type: ${request.package}` : ''}
${request.features ? `Required Features: ${request.features.join(', ')}` : ''}

Generate a complete module design including:
1. Detailed specifications and electrical characteristics
2. Complete pinout with pin numbers, names, types, and descriptions
3. Package information with dimensions
4. Operating parameters (voltage, current, temperature)
5. Generate a realistic MPN (manufacturer part number)
6. Suggest an appropriate manufacturer

Return JSON format:
{
  "name": "Module Name",
  "mpn": "CUSTOM-XXXX-YY",
  "manufacturer": "Manufacturer Name",
  "category": "category",
  "description": "Detailed description",
  "specifications": {
    "feature1": "value1",
    "feature2": "value2"
  },
  "pinout": [
    {"number": 1, "name": "VCC", "type": "power", "description": "Power supply"}
  ],
  "electricalCharacteristics": {
    "operatingVoltage": "3.3V",
    "currentConsumption": "50mA",
    "powerDissipation": "165mW",
    "temperature": {"min": "-40°C", "max": "85°C"}
  },
  "package": {
    "type": "DIP-8",
    "dimensions": {"width": "7.62mm", "height": "9.8mm"},
    "pitch": "2.54mm"
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert electronic component designer. Create realistic, manufacturable custom modules with accurate specifications."
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
    
    // Generate EDA symbol and footprint if not provided
    if (!result.edaSymbol) {
      result.edaSymbol = generateKiCadSymbol(result);
    }
    if (!result.edaFootprint) {
      result.edaFootprint = generateKiCadFootprint(result);
    }
    
    return result;
  } catch (error) {
    console.error("Custom module design failed:", error);
    
    // Return a basic fallback module
    return {
      name: request.name || "Custom Module",
      mpn: `CUSTOM-${Date.now()}`,
      manufacturer: "Generic",
      category: request.category || "passive",
      description: request.description || "Custom designed module",
      specifications: {
        type: request.category,
        custom: true
      },
      pinout: [
        { number: 1, name: "PIN1", type: "gpio", description: "General purpose I/O" },
        { number: 2, name: "GND", type: "ground", description: "Ground" }
      ],
      electricalCharacteristics: {
        operatingVoltage: "3.3V",
        currentConsumption: "10mA",
        powerDissipation: "33mW",
        temperature: { min: "0°C", max: "70°C" }
      },
      package: {
        type: request.package || "DIP",
        dimensions: { width: "7.62mm", height: "10mm" },
        pitch: "2.54mm"
      },
      edaSymbol: "",
      edaFootprint: ""
    };
  }
}

// Generate KiCad symbol for custom module
function generateKiCadSymbol(module: CustomModuleDesign): string {
  const pinSpacing = 100; // 100 mils between pins
  const boxWidth = Math.max(module.name.length * 50, module.pinout.length * 50);
  const boxHeight = Math.ceil(module.pinout.length / 2) * pinSpacing + 200;
  
  let symbol = `(symbol "${module.mpn}" (pin_names (offset 1.016)) (in_bom yes) (on_board yes)\n`;
  symbol += `  (property "Reference" "U" (id 0) (at 0 ${boxHeight/2 + 100} 0)\n`;
  symbol += `    (effects (font (size 1.27 1.27))))\n`;
  symbol += `  (property "Value" "${module.name}" (id 1) (at 0 ${-boxHeight/2 - 100} 0)\n`;
  symbol += `    (effects (font (size 1.27 1.27))))\n`;
  symbol += `  (property "Footprint" "" (id 2) (at 0 0 0)\n`;
  symbol += `    (effects (font (size 1.27 1.27)) hide))\n`;
  
  // Draw rectangle
  symbol += `  (symbol "${module.mpn}_0_1"\n`;
  symbol += `    (rectangle (start ${-boxWidth/2} ${boxHeight/2}) (end ${boxWidth/2} ${-boxHeight/2})\n`;
  symbol += `      (stroke (width 0.254) (type default))\n`;
  symbol += `      (fill (type background))\n`;
  symbol += `    )\n`;
  symbol += `  )\n`;
  
  // Add pins
  symbol += `  (symbol "${module.mpn}_1_1"\n`;
  
  module.pinout.forEach((pin, index) => {
    const side = index < module.pinout.length / 2 ? 'left' : 'right';
    const yPos = side === 'left' 
      ? boxHeight/2 - (index + 1) * pinSpacing
      : boxHeight/2 - (index - Math.floor(module.pinout.length / 2) + 1) * pinSpacing;
    const xPos = side === 'left' ? -boxWidth/2 - 200 : boxWidth/2 + 200;
    
    const pinType = pin.type === 'power' ? 'power_in' : 
                   pin.type === 'ground' ? 'power_in' : 
                   pin.type === 'output' ? 'output' : 'bidirectional';
    
    symbol += `    (pin ${pinType} line (at ${xPos} ${yPos} ${side === 'left' ? '0' : '180'}) (length 200)\n`;
    symbol += `      (name "${pin.name}" (effects (font (size 1.27 1.27))))\n`;
    symbol += `      (number "${pin.number}" (effects (font (size 1.27 1.27))))\n`;
    symbol += `    )\n`;
  });
  
  symbol += `  )\n`;
  symbol += `)\n`;
  
  return symbol;
}

// Generate KiCad footprint for custom module
function generateKiCadFootprint(module: CustomModuleDesign): string {
  const pitch = parseFloat(module.package.pitch || "2.54");
  const padSize = pitch * 0.6;
  const drillSize = padSize * 0.6;
  
  let footprint = `(module "${module.mpn}" (layer F.Cu)\n`;
  footprint += `  (descr "${module.description}")\n`;
  footprint += `  (tags "${module.category} ${module.package.type}")\n`;
  
  // Add pads based on package type
  if (module.package.type.includes('DIP')) {
    const rows = 2;
    const pinsPerRow = Math.ceil(module.pinout.length / rows);
    
    module.pinout.forEach((pin, index) => {
      const row = index < pinsPerRow ? 0 : 1;
      const col = row === 0 ? index : index - pinsPerRow;
      const x = col * pitch;
      const y = row * pitch * 3; // 3x pitch between rows for DIP
      
      footprint += `  (pad "${pin.number}" thru_hole circle (at ${x} ${y}) (size ${padSize} ${padSize}) (drill ${drillSize}) (layers *.Cu *.Mask))\n`;
    });
  } else if (module.package.type.includes('SMD') || module.package.type.includes('QFN')) {
    // SMD pads
    module.pinout.forEach((pin, index) => {
      const side = Math.floor(index * 4 / module.pinout.length); // Which side (0-3)
      const posOnSide = index % (module.pinout.length / 4);
      
      let x = 0, y = 0;
      const packageWidth = parseFloat(module.package.dimensions.width) || 5;
      const packageHeight = parseFloat(module.package.dimensions.height) || 5;
      
      switch(side) {
        case 0: // Left
          x = -packageWidth/2;
          y = posOnSide * pitch - packageHeight/2;
          break;
        case 1: // Bottom
          x = posOnSide * pitch - packageWidth/2;
          y = packageHeight/2;
          break;
        case 2: // Right
          x = packageWidth/2;
          y = packageHeight/2 - posOnSide * pitch;
          break;
        case 3: // Top
          x = packageWidth/2 - posOnSide * pitch;
          y = -packageHeight/2;
          break;
      }
      
      footprint += `  (pad "${pin.number}" smd rect (at ${x} ${y}) (size ${padSize} ${padSize*0.5}) (layers F.Cu F.Paste F.Mask))\n`;
    });
  }
  
  // Add courtyard
  const width = parseFloat(module.package.dimensions.width) || 10;
  const height = parseFloat(module.package.dimensions.height) || 10;
  footprint += `  (fp_line (start ${-width/2-1} ${-height/2-1}) (end ${width/2+1} ${-height/2-1}) (layer F.CrtYd) (width 0.05))\n`;
  footprint += `  (fp_line (start ${width/2+1} ${-height/2-1}) (end ${width/2+1} ${height/2+1}) (layer F.CrtYd) (width 0.05))\n`;
  footprint += `  (fp_line (start ${width/2+1} ${height/2+1}) (end ${-width/2-1} ${height/2+1}) (layer F.CrtYd) (width 0.05))\n`;
  footprint += `  (fp_line (start ${-width/2-1} ${height/2+1}) (end ${-width/2-1} ${-height/2-1}) (layer F.CrtYd) (width 0.05))\n`;
  
  footprint += `)\n`;
  
  return footprint;
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
      model: "gpt-4o",
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
    
    // Parse with Zod schema for proper validation
    const parseResult = CircuitDesignSchema.safeParse(result);
    
    if (!parseResult.success) {
      console.warn("Circuit design validation issues:", parseResult.error.issues);
      
      // Attempt to fix common issues
      const fixedResult: CircuitGenerationResponse = {
        components: Array.isArray(result.components) ? result.components : [],
        connections: Array.isArray(result.connections) ? result.connections : [],
        firmwareCode: result.firmwareCode || "",
        explanation: result.explanation || "No explanation provided",
        powerRequirements: result.powerRequirements || {
          totalPower: "0W",
          voltageRails: ["3.3V"]
        }
      };
      
      // Re-validate after fixes
      const secondParse = CircuitDesignSchema.safeParse(fixedResult);
      if (secondParse.success) {
        return secondParse.data;
      }
      
      // If still invalid, use validated fallback
      console.warn("Using validated fallback circuit design");
    } else {
      return parseResult.data;
    }
    
    // Validated fallback structure
    const validatedResult: CircuitGenerationResponse = {
      components: Array.isArray(result.components) ? result.components : [],
      connections: Array.isArray(result.connections) ? result.connections : [],
      firmwareCode: result.firmwareCode || "",
      explanation: result.explanation || "No explanation provided",
      powerRequirements: {
        totalPower: "0W",
        voltageRails: ["3.3V"]
      }
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
      model: "gpt-4o",
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

// Map specific component categories to general circuit component types
function mapCategoryToComponentType(category: string): string {
  const categoryMappings: Record<string, string> = {
    // Sensor mappings
    'temperatureSensor': 'sensor',
    'humiditySensor': 'sensor',
    'pressureSensor': 'sensor',
    'lightSensor': 'sensor',
    'motionSensor': 'sensor',
    'proximitySensor': 'sensor',
    'accelerometer': 'sensor',
    'gyroscope': 'sensor',
    'magnetometer': 'sensor',
    'gps': 'sensor',
    'camera': 'sensor',
    // Communication mappings
    'wifi': 'communication',
    'bluetooth': 'communication',
    'zigbee': 'communication',
    'lora': 'communication',
    'ethernet': 'communication',
    // Power mappings
    'battery': 'power',
    'charger': 'power',
    'regulator': 'power',
    'converter': 'power',
    // Actuator mappings
    'motor': 'actuator',
    'servo': 'actuator',
    'led': 'actuator',
    'buzzer': 'actuator',
    'relay': 'actuator',
    // Display mappings
    'lcd': 'display',
    'oled': 'display',
    'eink': 'display',
    // Passive mappings
    'resistor': 'passive',
    'capacitor': 'passive',
    'inductor': 'passive',
    'crystal': 'passive',
  };
  
  return categoryMappings[category] || category;
}

// Validate circuit against guide sheet constraints
export function validateCircuitAgainstGuideSheet(
  circuit: CircuitGenerationResponse,
  guideSheet: GuideSheet
): { isValid: boolean; violations: string[]; warnings: string[] } {
  const violations: string[] = [];
  const warnings: string[] = [];
  
  // Check component types against allowed types
  const componentCategories = new Map<string, number>();
  for (const component of circuit.components) {
    const category = component.type;
    componentCategories.set(category, (componentCategories.get(category) || 0) + 1);
    
    // Find matching requirement (check both direct match and mapped match)
    const requirement = guideSheet.componentRequirements.find(r => 
      r.category === category || mapCategoryToComponentType(r.category) === category
    );
    if (requirement) {
      // Check if component type is allowed
      if (requirement.allowedTypes && requirement.allowedTypes.length > 0) {
        const isAllowed = requirement.allowedTypes.some(allowed => 
          component.label?.toLowerCase().includes(allowed.toLowerCase()) ||
          component.mpn?.toLowerCase().includes(allowed.toLowerCase())
        );
        if (!isAllowed) {
          violations.push(`Component '${component.label}' is not in allowed types for ${category}: ${requirement.allowedTypes.join(', ')}`);
        }
      }
    }
  }
  
  // Check component counts
  for (const requirement of guideSheet.componentRequirements) {
    // Map the guide sheet category to a general circuit component type
    const mappedCategory = mapCategoryToComponentType(requirement.category);
    const count = componentCategories.get(mappedCategory) || 0;
    
    if (requirement.required && count === 0) {
      violations.push(`Required component category '${requirement.category}' is missing`);
    }
    if (requirement.count) {
      if (count < requirement.count.min) {
        violations.push(`Too few ${requirement.category} components: ${count} < ${requirement.count.min}`);
      }
      if (count > requirement.count.max) {
        violations.push(`Too many ${requirement.category} components: ${count} > ${requirement.count.max}`);
      }
    }
  }
  
  // Check electrical constraints
  const electricalConstraints = guideSheet.electricalConstraints;
  if (circuit.powerRequirements) {
    // Parse total power
    const totalPowerMatch = circuit.powerRequirements.totalPower?.match(/([\d.]+)/);
    const totalPower = totalPowerMatch ? parseFloat(totalPowerMatch[1]) : 0;
    
    if (totalPower > electricalConstraints.powerBudget) {
      violations.push(`Power budget exceeded: ${totalPower}W > ${electricalConstraints.powerBudget}W`);
    }
  }
  
  // Check voltage rails
  if (circuit.powerRequirements?.voltageRails) {
    for (const railStr of circuit.powerRequirements.voltageRails) {
      const voltageMatch = railStr.match(/([\d.]+)/);
      const voltage = voltageMatch ? parseFloat(voltageMatch[1]) : 0;
      
      if (voltage > electricalConstraints.maxVoltage) {
        violations.push(`Voltage exceeds maximum: ${voltage}V > ${electricalConstraints.maxVoltage}V`);
      }
      
      // Check if voltage rail is defined in guide sheet
      const definedRail = electricalConstraints.voltageRails.find(r => 
        Math.abs(r.voltage - voltage) <= (r.tolerance || 0.1)
      );
      if (!definedRail && voltage > 0) {
        warnings.push(`Voltage rail ${voltage}V is not defined in guide sheet`);
      }
    }
  }
  
  // Check design rules
  for (const rule of guideSheet.designRules) {
    if (rule.severity === "error") {
      // Add specific checks based on rule category
      if (rule.category === "electrical" && rule.rule.includes("3.3V logic")) {
        // Check if any component uses different logic levels
        const non33vComponents = circuit.components.filter(c => 
          c.specifications?.voltage && 
          !c.specifications.voltage.includes("3.3")
        );
        if (non33vComponents.length > 0) {
          violations.push(`Design rule violation: ${rule.rule}. Found components with different voltages.`);
        }
      }
    } else if (rule.severity === "warning") {
      warnings.push(`Design rule warning: ${rule.rule}`);
    }
  }
  
  return {
    isValid: violations.length === 0,
    violations,
    warnings
  };
}

export async function validateCircuit(
  circuitData: any,
  guideSheet?: GuideSheet
): Promise<{ isValid: boolean; issues: string[]; suggestions: string[] }> {
  let guideSheetSection = "";
  let localValidation = { isValid: true, violations: [] as string[], warnings: [] as string[] };
  
  if (guideSheet) {
    // Perform local validation against guide sheet
    localValidation = validateCircuitAgainstGuideSheet(circuitData, guideSheet);
    
    guideSheetSection = `

GUIDE SHEET CONSTRAINTS:
${JSON.stringify(guideSheet, null, 2)}

GUIDE SHEET VIOLATIONS FOUND:
${localValidation.violations.length > 0 ? localValidation.violations.join('\n') : 'None'}

GUIDE SHEET WARNINGS:
${localValidation.warnings.length > 0 ? localValidation.warnings.join('\n') : 'None'}

Please also check if the circuit adheres to ALL guide sheet constraints.`;
  }
  
  const prompt = `Validate this hardware circuit design and identify any issues:

Circuit Data: ${JSON.stringify(circuitData, null, 2)}
${guideSheetSection}

Analyze for:
1. Power supply adequacy
2. GPIO pin conflicts
3. Electrical compatibility
4. Missing connections
5. Component availability
6. Design rule violations
${guideSheet ? '7. Guide sheet compliance' : ''}

Return JSON format:
{
  "isValid": true/false,
  "issues": ["Issue 1", "Issue 2"],
  "suggestions": ["Suggestion 1", "Suggestion 2"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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
