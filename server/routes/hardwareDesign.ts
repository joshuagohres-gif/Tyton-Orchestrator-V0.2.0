/**
 * Hardware Design Routes
 * 
 * Implements the 6-stage hardware design workflow:
 * 1. Start Design - Initial design brief with part options
 * 2. Refine Design - Canonical design spec
 * 3. Master Plan - Dependency-ordered implementation steps
 * 4. Modules - Component modules with pin definitions
 * 5. Actuators - Servo/motor enrichment
 * 6. Wiring - Connection generation
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  hardwareDesignSessions, 
  masterPlans, 
  designModules, 
  designPins, 
  designConnections,
  projects 
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { HardwareDesignPrompts, wrapPrompt } from "../prompts/hwDesign";
import { 
  callLLM, 
  InitialDesignSchema, 
  DesignSpecSchema, 
  MasterPlanSchema,
  ModulesResponseSchema,
  ActuatorEnrichmentResponseSchema,
  WiringResponseSchema,
  type InitialDesign,
  type DesignSpec,
  type MasterPlan,
  type Module,
  type Connection
} from "../lib/llm";
import { matchComponents, type ComponentMatch } from "../data/sourcing";
import { runERC, formatERCReport } from "../lib/erc";

const router = Router();

// ===== 1. START DESIGN =====

router.post("/projects/:id/hardware-design/start", async (req: Request, res: Response) => {
  const { id: projectId } = req.params;
  const { prompt: userPrompt } = req.body;

  if (!userPrompt) {
    return res.status(400).json({ error: "Missing 'prompt' field" });
  }

  try {
    // Check if project exists
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Call LLM for initial design
    const messages = wrapPrompt(
      HardwareDesignPrompts.startDesign.system,
      HardwareDesignPrompts.startDesign.makeUser(projectId, userPrompt)
    );

    const result = await callLLM<InitialDesign>({
      messages,
      schema: InitialDesignSchema,
      model: "gpt-4o",
      maxTokens: 3000
    });

    if (!result.success) {
      return res.status(500).json({ 
        error: "Failed to generate initial design",
        details: result.error,
        validationErrors: result.validationErrors
      });
    }

    // Store in database
    const [session] = await db.insert(hardwareDesignSessions).values({
      projectId,
      status: "initial_design",
      initialPrompt: userPrompt,
      initialDesign: result.data as any
    }).returning();

    res.json({
      sessionId: session.id,
      initialDesign: result.data,
      rawResponse: result.rawResponse
    });

  } catch (error) {
    console.error("Start design error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// ===== 2. REFINE DESIGN =====

router.post("/projects/:id/hardware-design/refine", async (req: Request, res: Response) => {
  const { id: projectId } = req.params;
  const { sessionId, feedback } = req.body;

  if (!sessionId || !feedback) {
    return res.status(400).json({ error: "Missing 'sessionId' or 'feedback' fields" });
  }

  try {
    // Get session with initial design
    const session = await db.query.hardwareDesignSessions.findFirst({
      where: and(
        eq(hardwareDesignSessions.id, sessionId),
        eq(hardwareDesignSessions.projectId, projectId)
      )
    });

    if (!session || !session.initialDesign) {
      return res.status(404).json({ error: "Session not found or missing initial design" });
    }

    // Call LLM for refined design
    const messages = wrapPrompt(
      HardwareDesignPrompts.refineDesign.system,
      HardwareDesignPrompts.refineDesign.makeUser(projectId, feedback, session.initialDesign)
    );

    const result = await callLLM<DesignSpec>({
      messages,
      schema: DesignSpecSchema,
      model: "gpt-4o",
      maxTokens: 3500
    });

    if (!result.success) {
      return res.status(500).json({ 
        error: "Failed to generate refined design",
        details: result.error,
        validationErrors: result.validationErrors
      });
    }

    // Update session
    await db.update(hardwareDesignSessions)
      .set({
        status: "refining",
        refinedFeedback: feedback,
        designSpec: result.data as any,
        updatedAt: new Date()
      })
      .where(eq(hardwareDesignSessions.id, sessionId));

    res.json({
      sessionId,
      designSpec: result.data,
      rawResponse: result.rawResponse
    });

  } catch (error) {
    console.error("Refine design error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// ===== 3. MASTER PLAN =====

router.post("/projects/:id/hardware-design/master-plan", async (req: Request, res: Response) => {
  const { id: projectId } = req.params;
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing 'sessionId' field" });
  }

  try {
    // Get session with design spec
    const session = await db.query.hardwareDesignSessions.findFirst({
      where: and(
        eq(hardwareDesignSessions.id, sessionId),
        eq(hardwareDesignSessions.projectId, projectId)
      )
    });

    if (!session || !session.designSpec) {
      return res.status(404).json({ error: "Session not found or missing design spec" });
    }

    // Call LLM for master plan
    const messages = wrapPrompt(
      HardwareDesignPrompts.masterPlan.system,
      HardwareDesignPrompts.masterPlan.makeUser(projectId, session.designSpec, "gpt-4o")
    );

    const result = await callLLM<Omit<MasterPlan, 'projectId' | 'version'>>({
      messages,
      schema: MasterPlanSchema.omit({ projectId: true, version: true }),
      model: "gpt-4o",
      maxTokens: 2500
    });

    if (!result.success) {
      return res.status(500).json({ 
        error: "Failed to generate master plan",
        details: result.error,
        validationErrors: result.validationErrors
      });
    }

    // Get latest version
    const latestPlan = await db.query.masterPlans.findFirst({
      where: eq(masterPlans.projectId, projectId),
      orderBy: [desc(masterPlans.version)]
    });

    const nextVersion = (latestPlan?.version || 0) + 1;

    // Store master plan
    const [plan] = await db.insert(masterPlans).values({
      projectId,
      version: nextVersion,
      llmModel: "gpt-4o",
      summary: result.data!.summary,
      steps: result.data!.steps as any
    }).returning();

    res.json({
      planId: plan.id,
      version: plan.version,
      masterPlan: {
        projectId: plan.projectId,
        version: plan.version,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        llmModel: plan.llmModel,
        summary: plan.summary,
        steps: plan.steps
      },
      rawResponse: result.rawResponse
    });

  } catch (error) {
    console.error("Master plan error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// ===== 4. MODULES =====

router.post("/projects/:id/hardware-design/modules", async (req: Request, res: Response) => {
  const { id: projectId } = req.params;
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing 'sessionId' field" });
  }

  try {
    // Get session with design spec
    const session = await db.query.hardwareDesignSessions.findFirst({
      where: and(
        eq(hardwareDesignSessions.id, sessionId),
        eq(hardwareDesignSessions.projectId, projectId)
      )
    });

    if (!session || !session.designSpec) {
      return res.status(404).json({ error: "Session not found or missing design spec" });
    }

    const designSpec = session.designSpec as any;

    // Extract component specs for matching
    const componentSpecs = designSpec.components.map((c: any) => ({
      role: c.role,
      partNumber: c.primary.partNumber,
      category: inferCategory(c.role)
    }));

    // Match against component DB
    const matchingResult = await matchComponents(componentSpecs);

    // Prepare matched components data for LLM
    const matchedComponentsData = {
      matched: matchingResult.matched.map((m: ComponentMatch) => ({
        role: m.role,
        partNumber: m.partNumber,
        componentId: m.componentId,
        pinouts: m.pinouts
      })),
      unmatched: matchingResult.unmatched.map(u => u.role)
    };

    // Call LLM for module generation
    const messages = wrapPrompt(
      HardwareDesignPrompts.modules.system,
      HardwareDesignPrompts.modules.makeUser(projectId, designSpec, matchedComponentsData)
    );

    const result = await callLLM({
      messages,
      schema: ModulesResponseSchema,
      model: "gpt-4o",
      maxTokens: 4000
    });

    if (!result.success) {
      return res.status(500).json({ 
        error: "Failed to generate modules",
        details: result.error,
        validationErrors: result.validationErrors
      });
    }

    // Store modules in database
    const modulesData: Module[] = result.data!.modules;
    const storedModules = [];

    for (const moduleData of modulesData) {
      // Insert module
      const [module] = await db.insert(designModules).values({
        projectId,
        componentName: moduleData.componentName,
        componentId: moduleData.componentId || null,
        type: moduleData.type || null,
        voltage: moduleData.voltage || null,
        maxVoltage: moduleData.maxVoltage || null,
        maxCurrent: moduleData.maxCurrent || null,
        avgPowerDraw: moduleData.avgPowerDraw || null,
        wifi: moduleData.wifi || null,
        bluetooth: moduleData.bluetooth || null,
        firmwareLanguage: moduleData.firmwareLanguage || null,
        softwareLanguage: moduleData.softwareLanguage || null,
        computeRating: moduleData.computeRating || null,
        componentType: moduleData.componentType || null,
        isMotorOrServo: moduleData.isMotorOrServo || false,
        servoMotorProps: moduleData.servoMotorProps as any || null,
        notes: moduleData.notes || null,
        position: { x: 0, y: 0 } // Default position, will be set by UI
      }).returning();

      // Insert pins
      const pins = [];
      for (const pinData of moduleData.pins) {
        const [pin] = await db.insert(designPins).values({
          moduleId: module.id,
          name: pinData.name,
          type: pinData.type,
          voltage: pinData.voltage || null,
          maxVoltage: pinData.maxVoltage || null,
          maxCurrent: pinData.maxCurrent || null,
          notes: pinData.notes || null,
          enabled: pinData.enabled,
          layoutIndex: pinData.layoutIndex || null,
          connectionHints: pinData.connectionHints || []
        }).returning();
        pins.push(pin);
      }

      storedModules.push({ ...module, pins });
    }

    // Update session
    await db.update(hardwareDesignSessions)
      .set({
        status: "modules_created",
        updatedAt: new Date()
      })
      .where(eq(hardwareDesignSessions.id, sessionId));

    res.json({
      modules: storedModules,
      unmatched: result.data!.unmatched,
      matchingResult,
      rawResponse: result.rawResponse
    });

  } catch (error) {
    console.error("Modules generation error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// ===== 5. ACTUATORS (SERVO/MOTOR ENRICHMENT) =====

router.post("/projects/:id/hardware-design/actuators", async (req: Request, res: Response) => {
  const { id: projectId } = req.params;
  const { projectContext } = req.body;

  try {
    // Get all motor/servo modules for this project
    const modules = await db.query.designModules.findMany({
      where: and(
        eq(designModules.projectId, projectId),
        eq(designModules.isMotorOrServo, true)
      ),
      with: {
        pins: true
      }
    });

    if (modules.length === 0) {
      return res.json({
        enrichments: [],
        warnings: ["No motor/servo modules found in project"]
      });
    }

    // Call LLM for actuator enrichment
    const messages = wrapPrompt(
      HardwareDesignPrompts.actuators.system,
      HardwareDesignPrompts.actuators.makeUser(
        projectId,
        modules,
        projectContext || "Hardware project with actuators"
      )
    );

    const result = await callLLM({
      messages,
      schema: ActuatorEnrichmentResponseSchema,
      model: "gpt-4o",
      maxTokens: 3000
    });

    if (!result.success) {
      return res.status(500).json({ 
        error: "Failed to enrich actuators",
        details: result.error,
        validationErrors: result.validationErrors
      });
    }

    // Apply enrichments to modules
    for (const enrichment of result.data!.enrichments) {
      const module = modules.find(m => m.id === enrichment.moduleId);
      if (!module) continue;

      // Update module with enrichment
      await db.update(designModules)
        .set({
          servoMotorProps: enrichment.servoMotorProps as any
        })
        .where(eq(designModules.id, enrichment.moduleId));

      // Add additional pins if specified
      if (enrichment.additionalPins && enrichment.additionalPins.length > 0) {
        for (const pinData of enrichment.additionalPins) {
          await db.insert(designPins).values({
            moduleId: enrichment.moduleId,
            name: pinData.name,
            type: pinData.type,
            voltage: pinData.voltage || null,
            maxVoltage: pinData.maxVoltage || null,
            maxCurrent: pinData.maxCurrent || null,
            notes: pinData.notes || null,
            enabled: pinData.enabled,
            layoutIndex: pinData.layoutIndex || null,
            connectionHints: pinData.connectionHints || []
          });
        }
      }

      // If controller module is required and provided, create it
      if (enrichment.controllerRequired && enrichment.controllerModule) {
        const controllerData = enrichment.controllerModule;
        
        const [controller] = await db.insert(designModules).values({
          projectId,
          componentName: controllerData.componentName,
          componentId: controllerData.componentId || null,
          type: controllerData.type || "driver",
          voltage: controllerData.voltage || null,
          maxVoltage: controllerData.maxVoltage || null,
          maxCurrent: controllerData.maxCurrent || null,
          notes: `Controller for ${module.componentName}`,
          position: { x: 0, y: 0 }
        }).returning();

        // Add controller pins
        for (const pinData of controllerData.pins) {
          await db.insert(designPins).values({
            moduleId: controller.id,
            name: pinData.name,
            type: pinData.type,
            voltage: pinData.voltage || null,
            maxVoltage: pinData.maxVoltage || null,
            maxCurrent: pinData.maxCurrent || null,
            notes: pinData.notes || null,
            enabled: pinData.enabled,
            layoutIndex: pinData.layoutIndex || null,
            connectionHints: pinData.connectionHints || []
          });
        }
      }
    }

    res.json({
      enrichments: result.data!.enrichments,
      warnings: result.data!.warnings,
      rawResponse: result.rawResponse
    });

  } catch (error) {
    console.error("Actuator enrichment error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// ===== 6. WIRING =====

router.post("/projects/:id/hardware-design/wiring", async (req: Request, res: Response) => {
  const { id: projectId } = req.params;
  const { hints } = req.body;

  try {
    // Get all modules with pins for this project
    const modules = await db.query.designModules.findMany({
      where: eq(designModules.projectId, projectId),
      with: {
        pins: true
      }
    });

    if (modules.length === 0) {
      return res.status(404).json({ error: "No modules found for this project" });
    }

    // Call LLM for wiring
    const messages = wrapPrompt(
      HardwareDesignPrompts.wiring.system,
      HardwareDesignPrompts.wiring.makeUser(projectId, modules, hints)
    );

    const result = await callLLM({
      messages,
      schema: WiringResponseSchema,
      model: "gpt-4o",
      maxTokens: 4000
    });

    if (!result.success) {
      return res.status(500).json({ 
        error: "Failed to generate wiring",
        details: result.error,
        validationErrors: result.validationErrors
      });
    }

    // Run ERC validation before storing connections
    const ercReport = await runERC(modules, result.data!.connections as any);
    
    // Block on ERC errors if strict mode
    const ercErrors = ercReport.violations.filter(v => v.severity === "error");
    if (ercErrors.length > 0) {
      return res.status(400).json({
        error: "ERC validation failed",
        ercReport,
        ercFormatted: formatERCReport(ercReport)
      });
    }

    // Validate and store connections
    const connections: Connection[] = result.data!.connections;
    const storedConnections = [];
    const errors: string[] = [];

    for (const conn of connections) {
      // Validate pin IDs exist
      const fromPin = await db.query.designPins.findFirst({
        where: eq(designPins.id, conn.fromPinId)
      });
      const toPin = await db.query.designPins.findFirst({
        where: eq(designPins.id, conn.toPinId)
      });

      if (!fromPin || !toPin) {
        errors.push(`Invalid connection: ${conn.fromPinId} -> ${conn.toPinId}`);
        continue;
      }

      // Check voltage compatibility
      const voltageCheck = checkVoltageCompatibility(fromPin, toPin);
      if (!voltageCheck.compatible) {
        errors.push(voltageCheck.reason || "Voltage incompatibility");
        continue;
      }

      // Store connection
      const [stored] = await db.insert(designConnections).values({
        projectId,
        fromPinId: conn.fromPinId,
        toPinId: conn.toPinId,
        kind: conn.kind,
        netName: conn.netName || null,
        notes: conn.notes || null
      }).returning();

      storedConnections.push(stored);
    }

    res.json({
      connections: storedConnections,
      powerDistribution: result.data!.powerDistribution,
      notes: result.data!.notes,
      errors,
      ercReport,
      rawResponse: result.rawResponse
    });

  } catch (error) {
    console.error("Wiring generation error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// ===== GET ENDPOINTS FOR FETCHING DATA =====

/**
 * Get all modules for a project
 */
router.get("/projects/:id/hardware-design/modules", async (req: Request, res: Response) => {
  const { id: projectId } = req.params;

  try {
    const modules = await db.query.designModules.findMany({
      where: eq(designModules.projectId, projectId),
      with: {
        pins: true,
        component: true
      }
    });

    res.json(modules);
  } catch (error) {
    console.error("Get modules error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * Get all connections for a project
 */
router.get("/projects/:id/hardware-design/connections", async (req: Request, res: Response) => {
  const { id: projectId } = req.params;

  try {
    const connections = await db.query.designConnections.findMany({
      where: eq(designConnections.projectId, projectId),
      with: {
        fromPin: {
          with: {
            module: true
          }
        },
        toPin: {
          with: {
            module: true
          }
        }
      }
    });

    res.json(connections);
  } catch (error) {
    console.error("Get connections error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * Delete a connection
 */
router.delete("/projects/:id/hardware-design/connections/:connectionId", async (req: Request, res: Response) => {
  const { id: projectId, connectionId } = req.params;

  try {
    await db.delete(designConnections)
      .where(and(
        eq(designConnections.id, connectionId),
        eq(designConnections.projectId, projectId)
      ));

    res.status(204).send();
  } catch (error) {
    console.error("Delete connection error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * Create a manual connection
 */
router.post("/projects/:id/hardware-design/connections", async (req: Request, res: Response) => {
  const { id: projectId } = req.params;
  const { fromPinId, toPinId, kind, netName, notes } = req.body;

  if (!fromPinId || !toPinId || !kind) {
    return res.status(400).json({ error: "Missing required fields: fromPinId, toPinId, kind" });
  }

  try {
    // Validate pins exist
    const fromPin = await db.query.designPins.findFirst({
      where: eq(designPins.id, fromPinId)
    });
    const toPin = await db.query.designPins.findFirst({
      where: eq(designPins.id, toPinId)
    });

    if (!fromPin || !toPin) {
      return res.status(404).json({ error: "One or both pins not found" });
    }

    // Check voltage compatibility
    const voltageCheck = checkVoltageCompatibility(fromPin, toPin);
    if (!voltageCheck.compatible) {
      return res.status(400).json({ 
        error: "Voltage incompatibility",
        details: voltageCheck.reason
      });
    }

    // Create connection
    const [connection] = await db.insert(designConnections).values({
      projectId,
      fromPinId,
      toPinId,
      kind,
      netName: netName || null,
      notes: notes || null
    }).returning();

    res.json(connection);
  } catch (error) {
    console.error("Create connection error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * Update pin enable/disable state
 */
router.patch("/projects/:id/hardware-design/pins/:pinId", async (req: Request, res: Response) => {
  const { id: projectId, pinId } = req.params;
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: "Missing or invalid 'enabled' field" });
  }

  try {
    // Verify pin belongs to project
    const pin = await db.query.designPins.findFirst({
      where: eq(designPins.id, pinId),
      with: {
        module: true
      }
    });

    if (!pin || pin.module.projectId !== projectId) {
      return res.status(404).json({ error: "Pin not found or doesn't belong to project" });
    }

    // Update pin
    const [updatedPin] = await db.update(designPins)
      .set({ enabled })
      .where(eq(designPins.id, pinId))
      .returning();

    res.json(updatedPin);
  } catch (error) {
    console.error("Update pin error:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// ===== HELPER FUNCTIONS =====

/**
 * Infer component category from role string
 */
function inferCategory(role: string): string {
  const roleLower = role.toLowerCase();
  
  if (roleLower.includes('mcu') || roleLower.includes('microcontroller') || roleLower.includes('processor')) {
    return 'microcontroller';
  }
  if (roleLower.includes('sensor')) {
    return 'sensor';
  }
  if (roleLower.includes('motor') || roleLower.includes('servo') || roleLower.includes('actuator')) {
    return 'actuator';
  }
  if (roleLower.includes('power') || roleLower.includes('regulator') || roleLower.includes('battery')) {
    return 'power';
  }
  if (roleLower.includes('display') || roleLower.includes('lcd') || roleLower.includes('oled')) {
    return 'display';
  }
  if (roleLower.includes('communication') || roleLower.includes('wifi') || roleLower.includes('bluetooth')) {
    return 'communication';
  }
  if (roleLower.includes('connector')) {
    return 'connector';
  }
  
  return 'passive';
}

/**
 * Check voltage compatibility between two pins
 */
function checkVoltageCompatibility(
  fromPin: any, 
  toPin: any
): { compatible: boolean; reason?: string } {
  // If both pins have no voltage info, assume compatible
  if (!fromPin.voltage && !toPin.voltage) {
    return { compatible: true };
  }

  // Check max voltage constraints
  if (fromPin.voltage && toPin.maxVoltage) {
    if (fromPin.voltage > toPin.maxVoltage) {
      return { 
        compatible: false, 
        reason: `Voltage mismatch: ${fromPin.name} (${fromPin.voltage}mV) exceeds ${toPin.name} max (${toPin.maxVoltage}mV)`
      };
    }
  }

  if (toPin.voltage && fromPin.maxVoltage) {
    if (toPin.voltage > fromPin.maxVoltage) {
      return { 
        compatible: false, 
        reason: `Voltage mismatch: ${toPin.name} (${toPin.voltage}mV) exceeds ${fromPin.name} max (${fromPin.maxVoltage}mV)`
      };
    }
  }

  // Check voltage level matching (with 10% tolerance)
  if (fromPin.voltage && toPin.voltage) {
    const tolerance = 0.1;
    const diff = Math.abs(fromPin.voltage - toPin.voltage);
    const avgVoltage = (fromPin.voltage + toPin.voltage) / 2;
    
    if (diff > avgVoltage * tolerance) {
      return { 
        compatible: false, 
        reason: `Voltage level mismatch: ${fromPin.name} (${fromPin.voltage}mV) vs ${toPin.name} (${toPin.voltage}mV)`
      };
    }
  }

  return { compatible: true };
}

export default router;
