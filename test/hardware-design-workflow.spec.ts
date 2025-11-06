import { describe, it, expect } from "vitest";
import { HardwareDesignPrompts, wrapPrompt } from "../server/prompts/hwDesign";

describe("Hardware Design Prompts", () => {
  describe("Start Design", () => {
    it("generates valid prompt structure", () => {
      const userPrompt = HardwareDesignPrompts.startDesign.makeUser(
        "test-proj-1",
        "Create a WiFi temperature sensor with OLED display"
      );

      expect(userPrompt).toContain("PROJECT_ID: test-proj-1");
      expect(userPrompt).toContain("WiFi temperature sensor");
      expect(userPrompt).toContain("USER_PROMPT");
      expect(userPrompt).toContain("InitialDesign");
    });

    it("wraps messages correctly", () => {
      const msgs = wrapPrompt(
        HardwareDesignPrompts.startDesign.system,
        HardwareDesignPrompts.startDesign.makeUser(
          "test-1",
          "Test prompt"
        )
      );

      expect(msgs).toHaveLength(2);
      expect(msgs[0].role).toBe("system");
      expect(msgs[1].role).toBe("user");
      expect(msgs[0].content).toContain("senior product design");
      expect(msgs[1].content).toContain("Test prompt");
    });

    it("includes few-shot example", () => {
      const fewShot = HardwareDesignPrompts.startDesign.fewShot;

      expect(fewShot).toHaveLength(2);
      expect(fewShot[0].role).toBe("system");
      expect(fewShot[1].role).toBe("user");
      expect(fewShot[1].content).toContain("smart doorbell");
    });
  });

  describe("Refine Design", () => {
    it("includes feedback and initial design", () => {
      const initialDesign = {
        considerations: ["WiFi connectivity", "Battery power"],
        parts: [],
        estimated: {
          dimensionsMm: { width: 50, height: 80, depth: 20 },
          bomCostUSD: 25,
          powerBudgetW: 1.5
        },
        assumptions: [],
        warnings: []
      };

      const userPrompt = HardwareDesignPrompts.refineDesign.makeUser(
        "test-proj-1",
        "Use ESP32 and add USB-C charging",
        initialDesign
      );

      expect(userPrompt).toContain("FEEDBACK");
      expect(userPrompt).toContain("ESP32");
      expect(userPrompt).toContain("USB-C charging");
      expect(userPrompt).toContain("INITIAL_DESIGN");
      expect(userPrompt).toContain("WiFi connectivity");
    });

    it("includes schema validation checklist", () => {
      const userPrompt = HardwareDesignPrompts.refineDesign.makeUser(
        "test-1",
        "Feedback",
        {}
      );

      expect(userPrompt).toContain("DesignSpec");
      expect(userPrompt).toContain("schema exactly");
    });
  });

  describe("Master Plan", () => {
    it("generates master plan prompt with design spec", () => {
      const designSpec = {
        components: [
          {
            role: "MCU",
            primary: { partNumber: "ESP32-S3", qty: 1 },
            alternates: []
          }
        ],
        connectors: [],
        wires: [],
        deviceFootprint: { widthMm: 50, heightMm: 80, depthMm: 20 },
        finalRefinedPrompt: "Test design",
        assumptions: [],
        warnings: []
      };

      const userPrompt = HardwareDesignPrompts.masterPlan.makeUser(
        "test-proj-1",
        designSpec,
        "gpt-4o"
      );

      expect(userPrompt).toContain("PROJECT_ID: test-proj-1");
      expect(userPrompt).toContain("LLM_MODEL: gpt-4o");
      expect(userPrompt).toContain("ESP32-S3");
      expect(userPrompt).toContain("MasterPlan");
    });
  });

  describe("Modules", () => {
    it("includes design spec and component matches", () => {
      const designSpec = {
        components: [
          { role: "MCU", primary: { partNumber: "ESP32-S3", qty: 1 } }
        ]
      };

      const matchedComponents = {
        matched: [
          {
            role: "MCU",
            partNumber: "ESP32-S3",
            componentId: "comp-123",
            pinouts: [
              { name: "VCC", type: "power" },
              { name: "GND", type: "ground" }
            ]
          }
        ],
        unmatched: []
      };

      const userPrompt = HardwareDesignPrompts.modules.makeUser(
        "test-proj-1",
        designSpec,
        matchedComponents
      );

      expect(userPrompt).toContain("INPUT designSpec");
      expect(userPrompt).toContain("COMPONENT DB MATCHES");
      expect(userPrompt).toContain("ESP32-S3");
      expect(userPrompt).toContain("comp-123");
    });
  });

  describe("Actuators", () => {
    it("generates actuator enrichment prompt", () => {
      const actuatorModules = [
        {
          id: "mod-1",
          componentName: "SG90 Servo",
          type: "actuator",
          isMotorOrServo: true
        }
      ];

      const userPrompt = HardwareDesignPrompts.actuators.makeUser(
        "test-proj-1",
        actuatorModules,
        "Robotics arm project with 3 servos"
      );

      expect(userPrompt).toContain("ACTUATOR MODULES");
      expect(userPrompt).toContain("SG90 Servo");
      expect(userPrompt).toContain("PROJECT CONTEXT");
      expect(userPrompt).toContain("Robotics arm");
    });
  });

  describe("Wiring", () => {
    it("generates wiring prompt with modules", () => {
      const modules = [
        {
          id: "mod-1",
          componentName: "ESP32",
          pins: [
            { id: "pin-1", name: "VCC", type: "power" },
            { id: "pin-2", name: "GND", type: "ground" },
            { id: "pin-3", name: "GPIO21", type: "io" }
          ]
        },
        {
          id: "mod-2",
          componentName: "BME280 Sensor",
          pins: [
            { id: "pin-4", name: "VCC", type: "power" },
            { id: "pin-5", name: "GND", type: "ground" },
            { id: "pin-6", name: "SDA", type: "communication" },
            { id: "pin-7", name: "SCL", type: "communication" }
          ]
        }
      ];

      const userPrompt = HardwareDesignPrompts.wiring.makeUser(
        "test-proj-1",
        modules,
        "Use I2C for sensor communication"
      );

      expect(userPrompt).toContain("MODULES");
      expect(userPrompt).toContain("ESP32");
      expect(userPrompt).toContain("BME280");
      expect(userPrompt).toContain("USER_HINTS");
      expect(userPrompt).toContain("I2C for sensor");
    });

    it("works without hints", () => {
      const userPrompt = HardwareDesignPrompts.wiring.makeUser(
        "test-1",
        [],
        undefined
      );

      expect(userPrompt).toContain("USER_HINTS");
      expect(userPrompt).toContain("None");
    });
  });

  describe("Common utilities", () => {
    it("includes strict JSON preamble in system prompts", () => {
      expect(HardwareDesignPrompts.startDesign.system).toContain("MUST return a single JSON");
      expect(HardwareDesignPrompts.refineDesign.system).toContain("MUST return");
      expect(HardwareDesignPrompts.masterPlan.system).toContain("MUST return");
    });

    it("includes self-check in user prompts", () => {
      const prompt = HardwareDesignPrompts.startDesign.makeUser("test", "test prompt");
      expect(prompt).toContain("mental checklist");
      expect(prompt).toContain("schema exactly");
    });

    it("includes style nits about units", () => {
      expect(HardwareDesignPrompts.startDesign.system).toContain('use "mm"');
      expect(HardwareDesignPrompts.startDesign.system).toContain('use "USD"');
    });
  });
});

describe("Prompt validation", () => {
  it("all system prompts mention schema name", () => {
    const prompts = [
      HardwareDesignPrompts.startDesign.system,
      HardwareDesignPrompts.refineDesign.system,
      HardwareDesignPrompts.masterPlan.system,
      HardwareDesignPrompts.modules.system,
      HardwareDesignPrompts.actuators.system,
      HardwareDesignPrompts.wiring.system
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain("schema");
    }
  });

  it("all user prompt builders include project ID", () => {
    const builders = [
      HardwareDesignPrompts.startDesign.makeUser,
      HardwareDesignPrompts.refineDesign.makeUser,
      HardwareDesignPrompts.masterPlan.makeUser,
      HardwareDesignPrompts.modules.makeUser,
      HardwareDesignPrompts.actuators.makeUser,
      HardwareDesignPrompts.wiring.makeUser
    ];

    for (const builder of builders) {
      // Call with minimal args
      let result: string;
      if (builder === HardwareDesignPrompts.startDesign.makeUser) {
        result = builder("proj-123", "test");
      } else if (builder === HardwareDesignPrompts.refineDesign.makeUser) {
        result = builder("proj-123", "feedback", {});
      } else if (builder === HardwareDesignPrompts.masterPlan.makeUser) {
        result = builder("proj-123", {});
      } else if (builder === HardwareDesignPrompts.modules.makeUser) {
        result = builder("proj-123", {}, {});
      } else if (builder === HardwareDesignPrompts.actuators.makeUser) {
        result = builder("proj-123", [], "context");
      } else {
        result = builder("proj-123", []);
      }

      expect(result).toContain("proj-123");
    }
  });
});
