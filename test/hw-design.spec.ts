/**
 * Hardware Design Workflow Tests
 * 
 * Comprehensive test suite for the 6-stage hardware design workflow.
 * Includes golden JSON examples for schema compliance.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import {
  InitialDesignSchema,
  DesignSpecSchema,
  MasterPlanSchema,
  ModulesResponseSchema,
  ActuatorEnrichmentResponseSchema,
  WiringResponseSchema
} from "../server/lib/llm";

// ===== GOLDEN JSON EXAMPLES =====

const goldenInitialDesign = {
  considerations: [
    "Indoor environment, WiFi connectivity required",
    "Low power consumption preferred",
    "Standard 3.3V/5V power supply"
  ],
  parts: [
    {
      role: "MCU",
      qty: 1,
      options: [
        {
          partNumber: "ESP32-S3",
          rank: 1,
          reason: "WiFi + Bluetooth + AI acceleration",
          estCostUSD: 3.5
        },
        {
          partNumber: "ESP32-WROOM-32",
          rank: 2,
          reason: "Proven, widely available, lower cost",
          estCostUSD: 2.8
        },
        {
          partNumber: "RP2040+ESP8266",
          rank: 3,
          reason: "Split MCU+WiFi design for flexibility",
          estCostUSD: 3.2
        }
      ],
      notes: "Choose ESP32-S3 for optimal performance"
    },
    {
      role: "sensor",
      qty: 1,
      options: [
        {
          partNumber: "DHT22",
          rank: 1,
          reason: "Temperature and humidity, simple I2C",
          estCostUSD: 4.5
        },
        {
          partNumber: "BME280",
          rank: 2,
          reason: "Temp, humidity, pressure; higher accuracy",
          estCostUSD: 6.2
        }
      ],
      notes: "DHT22 sufficient for most applications"
    },
    {
      role: "power",
      qty: 1,
      options: [
        {
          partNumber: "AMS1117-3.3",
          rank: 1,
          reason: "Standard 3.3V LDO regulator",
          estCostUSD: 0.5
        }
      ],
      notes: "5V USB input to 3.3V regulated output"
    }
  ],
  estimated: {
    dimensionsMm: {
      width: 60,
      height: 80,
      depth: 25
    },
    bomCostUSD: 15.8,
    powerBudgetW: 1.5
  },
  assumptions: [
    "USB power supply available",
    "Standard temperature/humidity sensing requirements",
    "Indoor deployment"
  ],
  warnings: [
    "WiFi power consumption may require additional filtering capacitors"
  ]
};

const goldenDesignSpec = {
  components: [
    {
      role: "MCU",
      primary: {
        partNumber: "ESP32-S3",
        qty: 1
      },
      alternates: [
        {
          partNumber: "ESP32-WROOM-32",
          reason: "Cost optimization option"
        }
      ]
    },
    {
      role: "sensor",
      primary: {
        partNumber: "DHT22",
        qty: 1
      },
      alternates: [
        {
          partNumber: "BME280",
          reason: "Higher accuracy if needed"
        }
      ]
    },
    {
      role: "power",
      primary: {
        partNumber: "AMS1117-3.3",
        qty: 1
      },
      alternates: []
    }
  ],
  connectors: [
    {
      kind: "USB-C",
      count: 1,
      notes: "Power and programming interface"
    }
  ],
  wires: [
    {
      gauge: "24AWG",
      count: 10,
      notes: "Internal signal wiring"
    }
  ],
  deviceFootprint: {
    widthMm: 60,
    heightMm: 80,
    depthMm: 25
  },
  finalRefinedPrompt: "IoT temperature and humidity monitor with WiFi connectivity, ESP32-S3 based, DHT22 sensor, USB-C powered",
  assumptions: [
    "USB power always available",
    "WiFi network within range",
    "Standard indoor conditions"
  ],
  warnings: []
};

const goldenMasterPlan = {
  projectId: "test-project-id",
  version: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  llmModel: "gpt-4o",
  summary: "IoT sensor system with WiFi connectivity and cloud integration",
  steps: [
    {
      id: "power_setup",
      label: "Set up power regulation",
      subsystem: "power",
      status: "todo" as const,
      dependsOn: [],
      notes: "Configure 5V to 3.3V regulation"
    },
    {
      id: "mcu_init",
      label: "Initialize ESP32-S3",
      subsystem: "control",
      status: "todo" as const,
      dependsOn: ["power_setup"],
      notes: "Configure WiFi and GPIO"
    },
    {
      id: "sensor_config",
      label: "Configure DHT22 sensor",
      subsystem: "sensing",
      status: "todo" as const,
      dependsOn: ["mcu_init"],
      notes: "Set up I2C communication"
    },
    {
      id: "wifi_connect",
      label: "Establish WiFi connection",
      subsystem: "communication",
      status: "todo" as const,
      dependsOn: ["mcu_init"],
      notes: "Connect to local network"
    },
    {
      id: "data_loop",
      label: "Implement data collection loop",
      subsystem: "software",
      status: "todo" as const,
      dependsOn: ["sensor_config", "wifi_connect"],
      notes: "Read sensor and transmit data"
    }
  ]
};

const goldenModulesResponse = {
  modules: [
    {
      id: "mod-esp32-1",
      projectId: "test-project-id",
      componentName: "ESP32-S3",
      componentId: "comp-esp32-s3",
      type: "microcontroller",
      voltage: 3300,
      maxVoltage: 3600,
      maxCurrent: 500,
      avgPowerDraw: 240,
      wifi: true,
      bluetooth: true,
      firmwareLanguage: "cpp",
      softwareLanguage: "cpp",
      computeRating: 6,
      componentType: "MCU",
      isMotorOrServo: false,
      servoMotorProps: null,
      notes: "Main controller with WiFi/BT",
      pinLayout: "Standard ESP32-S3 pinout",
      presets: ["default", "low_power"],
      pins: [
        {
          id: "mod-esp32-1-vcc",
          moduleId: "mod-esp32-1",
          name: "3V3",
          type: "power" as const,
          enabled: true,
          voltage: 3300,
          maxVoltage: 3600,
          maxCurrent: 500,
          notes: "Power input",
          layoutIndex: 0,
          connectionHints: ["Connect to 3.3V rail"]
        },
        {
          id: "mod-esp32-1-gnd",
          moduleId: "mod-esp32-1",
          name: "GND",
          type: "ground" as const,
          enabled: true,
          notes: "Ground",
          layoutIndex: 1,
          connectionHints: ["Connect to ground plane"]
        },
        {
          id: "mod-esp32-1-gpio21",
          moduleId: "mod-esp32-1",
          name: "GPIO21",
          type: "communication" as const,
          enabled: true,
          voltage: 3300,
          maxVoltage: 3600,
          maxCurrent: 25,
          notes: "I2C SDA",
          layoutIndex: 2,
          connectionHints: ["Use for I2C data"]
        },
        {
          id: "mod-esp32-1-gpio22",
          moduleId: "mod-esp32-1",
          name: "GPIO22",
          type: "communication" as const,
          enabled: true,
          voltage: 3300,
          maxVoltage: 3600,
          maxCurrent: 25,
          notes: "I2C SCL",
          layoutIndex: 3,
          connectionHints: ["Use for I2C clock"]
        }
      ]
    },
    {
      id: "mod-dht22-1",
      projectId: "test-project-id",
      componentName: "DHT22",
      componentId: "comp-dht22",
      type: "sensor",
      voltage: 3300,
      maxVoltage: 3600,
      maxCurrent: 50,
      avgPowerDraw: 30,
      wifi: false,
      bluetooth: false,
      firmwareLanguage: null,
      softwareLanguage: null,
      computeRating: 1,
      componentType: "temperature_humidity_sensor",
      isMotorOrServo: false,
      servoMotorProps: null,
      notes: "DHT22 temperature and humidity sensor",
      pinLayout: "4-pin sensor",
      presets: [],
      pins: [
        {
          id: "mod-dht22-1-vcc",
          moduleId: "mod-dht22-1",
          name: "VCC",
          type: "power" as const,
          enabled: true,
          voltage: 3300,
          maxVoltage: 3600,
          maxCurrent: 50,
          notes: "Power input",
          layoutIndex: 0,
          connectionHints: ["Connect to 3.3V"]
        },
        {
          id: "mod-dht22-1-gnd",
          moduleId: "mod-dht22-1",
          name: "GND",
          type: "ground" as const,
          enabled: true,
          notes: "Ground",
          layoutIndex: 1,
          connectionHints: ["Connect to ground"]
        },
        {
          id: "mod-dht22-1-data",
          moduleId: "mod-dht22-1",
          name: "DATA",
          type: "communication" as const,
          enabled: true,
          voltage: 3300,
          notes: "Data pin",
          layoutIndex: 2,
          connectionHints: ["Connect to GPIO with pull-up"]
        }
      ]
    }
  ],
  unmatched: []
};

const goldenActuatorEnrichment = {
  enrichments: [
    {
      moduleId: "mod-servo-1",
      servoMotorProps: {
        controlCompatibilityClass: "Standard PWM Servo",
        rangeOfMotion: "0-180 degrees",
        torque: "5 kg-cm",
        controlType: "PWM"
      },
      controllerRequired: false,
      additionalPins: [
        {
          id: "mod-servo-1-pwm",
          moduleId: "mod-servo-1",
          name: "PWM",
          type: "pwm" as const,
          enabled: true,
          voltage: 3300,
          notes: "PWM control signal at 50Hz",
          connectionHints: ["Connect to PWM-capable GPIO"]
        }
      ]
    }
  ],
  warnings: []
};

const goldenWiringResponse = {
  connections: [
    {
      id: "conn-power-1",
      projectId: "test-project-id",
      fromPinId: "mod-esp32-1-vcc",
      toPinId: "mod-dht22-1-vcc",
      kind: "power" as const,
      netName: "3V3",
      notes: "Power distribution"
    },
    {
      id: "conn-gnd-1",
      projectId: "test-project-id",
      fromPinId: "mod-esp32-1-gnd",
      toPinId: "mod-dht22-1-gnd",
      kind: "ground" as const,
      netName: "GND",
      notes: "Ground connection"
    },
    {
      id: "conn-i2c-sda",
      projectId: "test-project-id",
      fromPinId: "mod-esp32-1-gpio21",
      toPinId: "mod-dht22-1-data",
      kind: "signal" as const,
      netName: "I2C_SDA",
      notes: "I2C data line"
    }
  ],
  powerDistribution: {
    voltageRails: ["3.3V"],
    totalCurrentMa: 550,
    warnings: []
  },
  notes: [
    "All power connections verified",
    "I2C pull-up resistors required on SDA/SCL",
    "Total power budget: 550mA"
  ]
};

// ===== SCHEMA VALIDATION TESTS =====

describe("Hardware Design Schema Validation", () => {
  describe("InitialDesign Schema", () => {
    it("should validate golden initial design", () => {
      const result = InitialDesignSchema.safeParse(goldenInitialDesign);
      expect(result.success).toBe(true);
    });

    it("should require all mandatory fields", () => {
      const invalid = { considerations: [] };
      const result = InitialDesignSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should validate part options with ranks 1-3", () => {
      const invalidRank = {
        ...goldenInitialDesign,
        parts: [
          {
            role: "test",
            qty: 1,
            options: [{ partNumber: "TEST", rank: 4, reason: "test", estCostUSD: 1 }],
            notes: ""
          }
        ]
      };
      const result = InitialDesignSchema.safeParse(invalidRank);
      expect(result.success).toBe(false);
    });
  });

  describe("DesignSpec Schema", () => {
    it("should validate golden design spec", () => {
      const result = DesignSpecSchema.safeParse(goldenDesignSpec);
      expect(result.success).toBe(true);
    });

    it("should require components array", () => {
      const invalid = { ...goldenDesignSpec, components: undefined };
      const result = DesignSpecSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("MasterPlan Schema", () => {
    it("should validate golden master plan", () => {
      const result = MasterPlanSchema.safeParse(goldenMasterPlan);
      expect(result.success).toBe(true);
    });

    it("should enforce step status enum", () => {
      const invalidStatus = {
        ...goldenMasterPlan,
        steps: [
          { ...goldenMasterPlan.steps[0], status: "invalid" }
        ]
      };
      const result = MasterPlanSchema.safeParse(invalidStatus);
      expect(result.success).toBe(false);
    });

    it("should validate DAG dependencies", () => {
      // This is a semantic check, schema only validates types
      const plan = goldenMasterPlan;
      const stepIds = new Set(plan.steps.map(s => s.id));
      
      for (const step of plan.steps) {
        for (const dep of step.dependsOn) {
          expect(stepIds.has(dep)).toBe(true);
        }
      }
    });
  });

  describe("ModulesResponse Schema", () => {
    it("should validate golden modules response", () => {
      const result = ModulesResponseSchema.safeParse(goldenModulesResponse);
      expect(result.success).toBe(true);
    });

    it("should validate pin types", () => {
      const invalidPinType = {
        modules: [
          {
            ...goldenModulesResponse.modules[0],
            pins: [
              { ...goldenModulesResponse.modules[0].pins[0], type: "invalid" }
            ]
          }
        ],
        unmatched: []
      };
      const result = ModulesResponseSchema.safeParse(invalidPinType);
      expect(result.success).toBe(false);
    });

    it("should enforce compute rating 1-10", () => {
      const invalidRating = {
        modules: [
          { ...goldenModulesResponse.modules[0], computeRating: 11 }
        ],
        unmatched: []
      };
      const result = ModulesResponseSchema.safeParse(invalidRating);
      expect(result.success).toBe(false);
    });
  });

  describe("ActuatorEnrichmentResponse Schema", () => {
    it("should validate golden actuator enrichment", () => {
      const result = ActuatorEnrichmentResponseSchema.safeParse(goldenActuatorEnrichment);
      expect(result.success).toBe(true);
    });

    it("should allow optional controller module", () => {
      const withoutController = {
        enrichments: [
          { ...goldenActuatorEnrichment.enrichments[0], controllerModule: undefined }
        ],
        warnings: []
      };
      const result = ActuatorEnrichmentResponseSchema.safeParse(withoutController);
      expect(result.success).toBe(true);
    });
  });

  describe("WiringResponse Schema", () => {
    it("should validate golden wiring response", () => {
      const result = WiringResponseSchema.safeParse(goldenWiringResponse);
      expect(result.success).toBe(true);
    });

    it("should enforce connection kind enum", () => {
      const invalidKind = {
        ...goldenWiringResponse,
        connections: [
          { ...goldenWiringResponse.connections[0], kind: "invalid" }
        ]
      };
      const result = WiringResponseSchema.safeParse(invalidKind);
      expect(result.success).toBe(false);
    });
  });
});

// ===== ID STABILITY TESTS =====

describe("ID Stability and Uniqueness", () => {
  it("should have stable pin IDs prefixed with module ID", () => {
    for (const module of goldenModulesResponse.modules) {
      for (const pin of module.pins) {
        expect(pin.id).toContain(module.id);
        expect(pin.moduleId).toBe(module.id);
      }
    }
  });

  it("should have unique IDs across all modules", () => {
    const ids = new Set<string>();
    
    for (const module of goldenModulesResponse.modules) {
      expect(ids.has(module.id)).toBe(false);
      ids.add(module.id);
      
      for (const pin of module.pins) {
        expect(ids.has(pin.id)).toBe(false);
        ids.add(pin.id);
      }
    }
  });

  it("should reference valid pin IDs in connections", () => {
    const pinIds = new Set<string>();
    
    for (const module of goldenModulesResponse.modules) {
      for (const pin of module.pins) {
        pinIds.add(pin.id);
      }
    }
    
    for (const conn of goldenWiringResponse.connections) {
      expect(pinIds.has(conn.fromPinId)).toBe(true);
      expect(pinIds.has(conn.toPinId)).toBe(true);
    }
  });
});

// ===== VOLTAGE SAFETY TESTS =====

describe("Voltage and Current Safety", () => {
  it("should not exceed pin voltage limits", () => {
    for (const conn of goldenWiringResponse.connections) {
      const fromPin = goldenModulesResponse.modules
        .flatMap(m => m.pins)
        .find(p => p.id === conn.fromPinId);
      const toPin = goldenModulesResponse.modules
        .flatMap(m => m.pins)
        .find(p => p.id === conn.toPinId);
      
      if (fromPin && toPin && fromPin.voltage && toPin.maxVoltage) {
        expect(fromPin.voltage).toBeLessThanOrEqual(toPin.maxVoltage);
      }
    }
  });

  it("should calculate total current within budget", () => {
    const totalCurrent = goldenWiringResponse.powerDistribution.totalCurrentMa;
    const budgetCurrent = 1000; // 1A typical USB budget
    
    expect(totalCurrent).toBeLessThanOrEqual(budgetCurrent);
  });

  it("should have unified ground connections", () => {
    const groundConnections = goldenWiringResponse.connections.filter(
      c => c.kind === "ground"
    );
    
    // All ground connections should use same net
    const groundNets = new Set(groundConnections.map(c => c.netName));
    expect(groundNets.size).toBeLessThanOrEqual(1);
  });
});

// ===== DEPENDENCY DAG TESTS =====

describe("Master Plan DAG Validation", () => {
  it("should form a valid DAG with no cycles", () => {
    const plan = goldenMasterPlan;
    
    // Build adjacency list
    const graph = new Map<string, string[]>();
    for (const step of plan.steps) {
      graph.set(step.id, step.dependsOn);
    }
    
    // DFS to detect cycles
    const visited = new Set<string>();
    const recStack = new Set<string>();
    
    function hasCycle(node: string): boolean {
      visited.add(node);
      recStack.add(node);
      
      const deps = graph.get(node) || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          if (hasCycle(dep)) return true;
        } else if (recStack.has(dep)) {
          return true;
        }
      }
      
      recStack.delete(node);
      return false;
    }
    
    for (const step of plan.steps) {
      if (!visited.has(step.id)) {
        expect(hasCycle(step.id)).toBe(false);
      }
    }
  });

  it("should have valid dependency references", () => {
    const plan = goldenMasterPlan;
    const stepIds = new Set(plan.steps.map(s => s.id));
    
    for (const step of plan.steps) {
      for (const dep of step.dependsOn) {
        expect(stepIds.has(dep)).toBe(true);
      }
    }
  });
});

// ===== UNITS AND FORMATS TESTS =====

describe("Units and Format Consistency", () => {
  it("should use millivolts for voltages", () => {
    for (const module of goldenModulesResponse.modules) {
      if (module.voltage) {
        expect(module.voltage).toBeGreaterThan(1000); // mV, not V
      }
    }
  });

  it("should use milliamps for currents", () => {
    for (const module of goldenModulesResponse.modules) {
      if (module.maxCurrent) {
        expect(module.maxCurrent).toBeGreaterThan(0);
      }
    }
  });

  it("should use millimeters for dimensions", () => {
    const dims = goldenDesignSpec.deviceFootprint;
    expect(dims.widthMm).toBeGreaterThan(0);
    expect(dims.heightMm).toBeGreaterThan(0);
    expect(dims.depthMm).toBeGreaterThan(0);
  });

  it("should use USD for costs", () => {
    expect(goldenInitialDesign.estimated.bomCostUSD).toBeGreaterThan(0);
  });
});

// ===== JSON SERIALIZATION TESTS =====

describe("JSON Serialization", () => {
  it("should serialize and deserialize InitialDesign", () => {
    const json = JSON.stringify(goldenInitialDesign);
    const parsed = JSON.parse(json);
    const result = InitialDesignSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("should serialize and deserialize ModulesResponse", () => {
    const json = JSON.stringify(goldenModulesResponse);
    const parsed = JSON.parse(json);
    const result = ModulesResponseSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("should serialize and deserialize WiringResponse", () => {
    const json = JSON.stringify(goldenWiringResponse);
    const parsed = JSON.parse(json);
    const result = WiringResponseSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });
});

// Export golden examples for use in other tests
export {
  goldenInitialDesign,
  goldenDesignSpec,
  goldenMasterPlan,
  goldenModulesResponse,
  goldenActuatorEnrichment,
  goldenWiringResponse
};
