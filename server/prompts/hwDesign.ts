/* eslint-disable max-len */
/**
 * Hardware Design Assistant - Production Prompt Pack
 * 
 * This pack enforces pure JSON outputs, schema keys, and self-check sections.
 * Includes few-shot exemplars for unit testing.
 */

type Msg = { role: "system" | "user"; content: string };

// ---------- COMMON UTILITIES ----------

export const StrictJsonPreamble = `
You MUST return a single JSON object that conforms EXACTLY to the requested schema.
Do NOT include markdown code fences, comments, or any text outside the JSON object.
If you are uncertain, use conservative defaults and add a "warnings" array.
`.trim();

export const StyleNits = `
Style rules:
- Units: use "mm" for physical lengths, "USD" for costs.
- All arrays must exist (use [] if empty).
- Strings must be plain ASCII where possible.
- Never invent part numbers; if unknown, use "TBD" and explain in "warnings".
`.trim();

export const SelfCheck = (schemaName: string) => `
Before you respond, run this mental checklist:
1) Does the output conform to the ${schemaName} schema exactly, with all required keys present?
2) Are numeric fields numbers (not strings)? Are units consistent?
3) Are IDs unique and stable? Do references point to existing items?
4) If you made assumptions, did you add them to "assumptions" and "warnings"?
Return JSON only.`.trim();

function wrap(system: string, user: string): Msg[] {
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ---------- 1) START DESIGN ----------

export const StartDesignSystem = `
You are a senior product design engineering consultant for an embedded hardware project.
Your task: from a plain-English product prompt, produce an initial hardware design brief with ranked part options.
Return strictly JSON as per InitialDesign schema.
${StrictJsonPreamble}

InitialDesign schema:
{
  "considerations": string[],                     // design/market/tech constraints
  "parts": [                                      // 2–3 ranked options per role
    {
      "role": string,                             // e.g., "MCU", "camera_sensor"
      "qty": number,                              // typical quantity per device
      "options": [
        { "partNumber": string, "rank": 1|2|3, "reason": string, "estCostUSD": number }
      ],
      "notes": string
    }
  ],
  "estimated": {
    "dimensionsMm": { "width": number, "height": number, "depth": number },
    "bomCostUSD": number,
    "powerBudgetW": number
  },
  "assumptions": string[],
  "warnings": string[]
}

${StyleNits}
`.trim();

export function makeStartDesignUser(projectId: string, userPrompt: string): string {
  return `
PROJECT_ID: ${projectId}

USER_PROMPT:
${userPrompt}

CONTEXT HINTS (non-binding):
- Optimize for manufacturability and availability.
- Suggest 2–3 options per core role.
- Provide a realistic BOM and power estimate with assumptions.

${SelfCheck("InitialDesign")}
`.trim();
}

// Few-shot exemplar
export const StartDesignFewShot: Msg[] = wrap(
  StartDesignSystem,
  makeStartDesignUser(
    "demo-1",
    "Build me a smart doorbell camera with night vision and Wi-Fi streaming."
  ),
);

// ---------- 2) REFINE DESIGN ----------

export const RefineDesignSystem = `
You refine the initial design into a canonical "designSpec" JSON used by downstream services.
Return the canonical object ONLY.

DesignSpec schema:
{
  "components": [
    {
      "role": string,                                         // "MCU","camera_sensor","wifi_module"
      "primary": { "partNumber": string, "qty": number },
      "alternates": [ { "partNumber": string, "reason": string } ]
    }
  ],
  "connectors": [ { "kind": string, "count": number, "notes": string } ],
  "wires": [ { "gauge": string, "count": number, "notes": string } ],
  "deviceFootprint": { "widthMm": number, "heightMm": number, "depthMm": number },
  "finalRefinedPrompt": string,
  "assumptions": string[],
  "warnings": string[]
}

${StrictJsonPreamble}
${StyleNits}
`.trim();

export function makeRefineDesignUser(
  projectId: string,
  feedback: string,
  initialDesignJson: unknown
): string {
  return `
PROJECT_ID: ${projectId}

FEEDBACK:
${feedback}

INITIAL_DESIGN:
${JSON.stringify(initialDesignJson, null, 2)}

REFINEMENT INSTRUCTIONS:
- Apply the feedback faithfully.
- Resolve to a single primary per component role; provide alternates with rationale.
- Provide realistic connector+wire counts.
- Produce a coherent deviceFootprint.

${SelfCheck("DesignSpec")}
`.trim();
}

export const RefineFewShot: Msg[] = wrap(
  RefineDesignSystem,
  makeRefineDesignUser(
    "demo-1",
    "Optimize more for cost; prefer ESP32-family MCUs; keep 50×120×20 mm envelope.",
    {
      considerations: ["Outdoor, IP54", "Wi-Fi stream"],
      parts: [
        {
          role: "MCU",
          qty: 1,
          options: [
            { partNumber: "ESP32-S3", rank: 1, reason: "Wi-Fi + AI accel", estCostUSD: 3.2 },
            { partNumber: "RP2040+ESP8266", rank: 2, reason: "Split MCU+Wi-Fi", estCostUSD: 2.9 }
          ],
          notes: ""
        }
      ],
      estimated: {
        dimensionsMm: { width: 55, height: 120, depth: 22 },
        bomCostUSD: 18.5,
        powerBudgetW: 2.3
      },
      assumptions: [],
      warnings: []
    }
  ),
);

// ---------- 3) MASTER PLAN ----------

export const MasterPlanSystem = `
Create a versioned Master Plan for the project with dependency-ordered steps.
Return MasterPlan object ONLY.

MasterPlan schema:
{
  "projectId": string,
  "version": number,
  "createdAt": number,
  "updatedAt": number,
  "llmModel": string,
  "summary": string,
  "steps": [
    {
      "id": string,
      "label": string,
      "subsystem": string?,
      "status": "todo"|"in_progress"|"done",
      "dependsOn": string[],
      "notes": string?
    }
  ]
}

Rules:
- Provide clear step IDs (e.g., "mcu_select", "power_budget", "camera_bringup").
- Dependencies must form a DAG (Directed Acyclic Graph).
- Mark early steps as "todo"; none should be "done".
${StrictJsonPreamble}
`.trim();

export function makeMasterPlanUser(
  projectId: string,
  designSpecJson: unknown,
  llmModel = "gpt-4o"
): string {
  return `
PROJECT_ID: ${projectId}
LLM_MODEL: ${llmModel}

INPUT designSpec:
${JSON.stringify(designSpecJson, null, 2)}

${SelfCheck("MasterPlan")}
`.trim();
}

// ---------- 4) MODULES ----------

export const ModulesSystem = `
Transform the designSpec into Module objects suitable for the canvas.
You will receive matched components from Tyton's DB (componentId + pinouts) when available.

Return:
{
  "modules": Module[],
  "unmatched": string[]        // list of roles/parts requiring manual sourcing
}

Module schema:
{
  "id": string,
  "projectId": string,
  "componentName": string,
  "componentId"?: string,
  "type"?: string,
  "voltage"?: number,
  "maxVoltage"?: number,
  "maxCurrent"?: number,
  "avgPowerDraw"?: number,
  "wifi"?: boolean,
  "bluetooth"?: boolean,
  "computeRating"?: number,
  "notes"?: string,
  "pins": [
    {
      "id": string,
      "moduleId": string,
      "name": string,
      "type": "power"|"ground"|"io"|"analog"|"pwm"|"communication"|"other",
      "enabled": boolean,
      "voltage"?: number,
      "maxVoltage"?: number,
      "maxCurrent"?: number,
      "connectionHints"?: string[]
    }
  ]
}

Rules:
- Use DB pinouts verbatim for matched parts; otherwise synthesize conservative pins with clear names (VCC, GND, SDA, SCL, GPIO#).
- Always include at least VCC and GND pins when applicable.
- IDs must be unique and stable (prefix with module ID).
- Voltage/current values should be in millivolts/milliamps as integers.
${StrictJsonPreamble}
`.trim();

export function makeModulesUser(
  projectId: string,
  designSpecJson: unknown,
  matchedComponentsJson: unknown // { matched: [{role, partNumber, componentId, pinouts:[...] }], unmatched: [...] }
): string {
  return `
PROJECT_ID: ${projectId}

INPUT designSpec:
${JSON.stringify(designSpecJson, null, 2)}

COMPONENT DB MATCHES:
${JSON.stringify(matchedComponentsJson, null, 2)}

${SelfCheck("ModulesResponse")}
`.trim();
}

// ---------- 5) ACTUATORS ----------

export const ActuatorsSystem = `
For modules identified as motors or servos, enrich them with control requirements.

ActuatorEnrichment schema:
{
  "moduleId": string,
  "servoMotorProps": {
    "controlCompatibilityClass"?: string,    // e.g., "Standard PWM Servo"
    "rangeOfMotion"?: string,                // e.g., "0-180 degrees"
    "torque"?: string,                       // e.g., "5 kg-cm"
    "controlType"?: string                   // e.g., "PWM", "I2C", "SPI"
  },
  "controllerRequired": boolean,
  "controllerModule"?: Module,               // if controllerRequired=true
  "additionalPins": Pin[]                    // extra pins needed for control
}

Return:
{
  "enrichments": ActuatorEnrichment[],
  "warnings": string[]
}

Rules:
- Determine if a separate controller IC is needed (e.g., PCA9685 for multiple servos).
- Add PWM control pins with appropriate frequency specs.
- Consider power requirements and add warnings if current exceeds safe limits.
${StrictJsonPreamble}
`.trim();

export function makeActuatorsUser(
  projectId: string,
  actuatorModulesJson: unknown,
  projectContext: string
): string {
  return `
PROJECT_ID: ${projectId}

ACTUATOR MODULES:
${JSON.stringify(actuatorModulesJson, null, 2)}

PROJECT CONTEXT:
${projectContext}

${SelfCheck("ActuatorEnrichmentResponse")}
`.trim();
}

// ---------- 6) WIRING ----------

export const WiringSystem = `
Given Module objects with pins, propose logical Connection[] nets that are safe and conventional.
Return JSON ONLY.

Connection schema:
{
  "id": string,
  "projectId": string,
  "fromPinId": string,
  "toPinId": string,
  "kind": "power"|"signal"|"ground"|"bus",
  "netName"?: string,
  "notes"?: string
}

Return:
{
  "connections": Connection[],
  "powerDistribution": {
    "voltageRails": string[],
    "totalCurrentMa": number,
    "warnings": string[]
  },
  "notes": string[]
}

Rules:
- Power: connect VCC pins to the appropriate regulated rail; unify GND.
- I2C: connect SDA↔SDA, SCL↔SCL; one set of pull-ups assumed.
- SPI/UART: name the net (e.g., "SPI0_MOSI") consistently.
- Never short dissimilar power rails; never exceed pin voltage; if unsure, omit and add a warning.
- Calculate total current draw and verify power budget.
${StrictJsonPreamble}
`.trim();

export function makeWiringUser(
  projectId: string,
  modulesJson: unknown,
  hints?: string
): string {
  return `
PROJECT_ID: ${projectId}

MODULES:
${JSON.stringify(modulesJson, null, 2)}

USER_HINTS:
${hints ?? "None"}

${SelfCheck("WiringResponse")}
`.trim();
}

// ---------- HELPER: Wrap prompts for LLM ----------

export function wrapPrompt(system: string, user: string): Msg[] {
  return wrap(system, user);
}

// ---------- EXPORT ALL PROMPT BUILDERS ----------

export const HardwareDesignPrompts = {
  // Start Design
  startDesign: {
    system: StartDesignSystem,
    makeUser: makeStartDesignUser,
    fewShot: StartDesignFewShot,
  },

  // Refine Design
  refineDesign: {
    system: RefineDesignSystem,
    makeUser: makeRefineDesignUser,
    fewShot: RefineFewShot,
  },

  // Master Plan
  masterPlan: {
    system: MasterPlanSystem,
    makeUser: makeMasterPlanUser,
  },

  // Modules
  modules: {
    system: ModulesSystem,
    makeUser: makeModulesUser,
  },

  // Actuators
  actuators: {
    system: ActuatorsSystem,
    makeUser: makeActuatorsUser,
  },

  // Wiring
  wiring: {
    system: WiringSystem,
    makeUser: makeWiringUser,
  },
};

// ---------- USAGE EXAMPLE ----------

/*
Usage in endpoints:

import { HardwareDesignPrompts, wrapPrompt } from './prompts/hwDesign';

// Start Design
const msgs = wrapPrompt(
  HardwareDesignPrompts.startDesign.system,
  HardwareDesignPrompts.startDesign.makeUser(projectId, userPrompt)
);
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: msgs,
  response_format: { type: "json_object" }
});

// Refine Design
const refineMsgs = wrapPrompt(
  HardwareDesignPrompts.refineDesign.system,
  HardwareDesignPrompts.refineDesign.makeUser(projectId, feedback, initialDesign)
);

// Master Plan
const planMsgs = wrapPrompt(
  HardwareDesignPrompts.masterPlan.system,
  HardwareDesignPrompts.masterPlan.makeUser(projectId, designSpec)
);

// Modules
const modulesMsgs = wrapPrompt(
  HardwareDesignPrompts.modules.system,
  HardwareDesignPrompts.modules.makeUser(projectId, designSpec, matchedComponents)
);

// Wiring
const wiringMsgs = wrapPrompt(
  HardwareDesignPrompts.wiring.system,
  HardwareDesignPrompts.wiring.makeUser(projectId, modules, "Prefer I2C for sensors")
);
*/
