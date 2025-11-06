import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { orchestrationEngine } from "./services/orchestration";
import { designCustomModule } from "./services/openai";
import { generateKiCadFiles, generateBOM } from "./services/eda";
import { generateCADModel, exportSTL, exportSTEP, type CADParameters } from "./services/cad";
import { insertProjectSchema, insertProjectModuleSchema, insertProjectConnectionSchema, type Component, type ParametricData } from "@shared/schema";
import { randomUUID } from "crypto";
import { authenticateJWT, optionalAuth } from "./auth";
import authRoutes from "./authRoutes";
import { aiRateLimit, projectCreationRateLimit } from "./rateLimiter";
import { logger } from "./logger";
import { monitoring, trackingMiddleware } from "./monitoring";
import { registerShapeOpsRoutes } from "./routes/shapeOps";

export async function registerRoutes(app: Express): Promise<Server> {
  // Add request tracking middleware
  app.use("/api", trackingMiddleware);

  // Register authentication routes
  app.use("/api/auth", authRoutes);

  // Register shape operations routes
  registerShapeOpsRoutes(app);

  // Projects - Require authentication
  app.get("/api/projects", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const projects = await storage.getProjectsByUser(userId);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      const modules = await storage.getProjectModules(project.id);
      const connections = await storage.getProjectConnections(project.id);
      const orchestratorRun = await storage.getLatestOrchestratorRun(project.id);
      
      res.json({
        ...project,
        modules,
        connections,
        orchestratorRun
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", authenticateJWT, projectCreationRateLimit, async (req: any, res) => {
    try {
      const validation = insertProjectSchema.safeParse({
        ...req.body,
        userId: req.user.id
      });
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const project = await storage.createProject(validation.data);
      res.status(201).json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.put("/api/projects/:id", authenticateJWT, async (req: any, res) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", authenticateJWT, async (req: any, res) => {
    try {
      await storage.deleteProject(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Components
  app.get("/api/components/search", async (req, res) => {
    try {
      const { q: query, category } = req.query;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query parameter required" });
      }

      const components = await storage.searchComponents(
        query, 
        typeof category === "string" ? category : undefined
      );
      res.json(components);
    } catch (error) {
      res.status(500).json({ error: "Failed to search components" });
    }
  });

  // Mechanical Components 
  app.get("/api/projects/:id/mechanical", async (req, res) => {
    try {
      // Get mechanical components from database
      const mechanicalComponents = await storage.getMechanicalComponents(req.params.id);
      
      // If no components exist, return sample data for demo
      if (!mechanicalComponents || mechanicalComponents.length === 0) {
        const sampleComponents = [
          {
            id: '1',
            name: 'Main Housing',
            type: 'housing',
            dimensions: { length: 200, width: 150, height: 80 },
            material: 'ABS',
            manufacturingMethod: '3D_PRINT',
            clearanceClass: 'NORMAL',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 }
          },
          {
            id: '2',
            name: 'Mounting Bracket',
            type: 'bracket',
            dimensions: { length: 50, width: 30, height: 60 },
            material: 'Aluminum',
            manufacturingMethod: 'CNC',
            clearanceClass: 'CLOSE',
            position: { x: 1.5, y: 0, z: 0.5 },
            rotation: { x: 0, y: Math.PI / 4, z: 0 }
          },
          {
            id: '3',
            name: 'Heat Sink',
            type: 'heatsink',
            dimensions: { length: 80, width: 80, height: 40 },
            material: 'Aluminum',
            manufacturingMethod: 'CNC',
            clearanceClass: 'NORMAL',
            position: { x: -1, y: 0.5, z: 0 },
            rotation: { x: 0, y: 0, z: 0 }
          }
        ];
        return res.json(sampleComponents);
      }
      
      res.json(mechanicalComponents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch mechanical components" });
    }
  });

  // Generate CAD model from parameters
  app.post("/api/projects/:id/mechanical/generate", async (req, res) => {
    try {
      const params: CADParameters = req.body;
      
      if (!params.type || !params.dimensions) {
        return res.status(400).json({ error: "Missing required parameters: type and dimensions" });
      }

      const result = generateCADModel(params);
      
      // Store the generated model in database if valid
      if (result.validation.valid) {
        const parametricData: ParametricData = {
          points: [],
          curves: [],
          segments: [],
          features: []
        };
        
        const mechanicalComponent = await storage.createMechanicalComponent({
          projectId: req.params.id,
          componentType: params.type,
          parametricData,
          dimensions: params.dimensions,
          material: params.material?.type,
          manufacturingMethod: params.features?.wallThickness ? 'CNC' : '3D_PRINT',
          clearanceClass: 'NORMAL'
        });

        res.json({
          id: mechanicalComponent.id,
          geometry: result.geometry,
          validation: result.validation,
          metadata: {
            vertexCount: result.geometry.vertices.length,
            faceCount: result.geometry.faces.length,
            type: params.type,
            dimensions: params.dimensions
          }
        });
      } else {
        res.status(422).json({
          error: "Model validation failed",
          validation: result.validation
        });
      }
    } catch (error) {
      console.error("CAD generation error:", error);
      res.status(500).json({ error: "Failed to generate CAD model" });
    }
  });

  // Export STL
  app.get("/api/projects/:id/mechanical/:componentId/export/stl", async (req, res) => {
    try {
      const { format = 'binary' } = req.query;
      const component = await storage.getMechanicalComponent(req.params.componentId);
      
      if (!component) {
        return res.status(404).json({ error: "Component not found" });
      }

      // Regenerate geometry from stored parameters
      const params: CADParameters = {
        type: component.componentType as any,
        dimensions: component.dimensions as any,
        material: component.material ? { type: component.material } : undefined,
        units: 'mm'
      };

      const result = generateCADModel(params);
      const stlData = exportSTL(result.geometry, format as 'ascii' | 'binary');

      if (format === 'ascii') {
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="component-${component.id}.stl"`);
        res.send(stlData);
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="component-${component.id}.stl"`);
        res.send(stlData);
      }
    } catch (error) {
      console.error("STL export error:", error);
      res.status(500).json({ error: "Failed to export STL" });
    }
  });

  // Export STEP
  app.get("/api/projects/:id/mechanical/:componentId/export/step", async (req, res) => {
    try {
      const component = await storage.getMechanicalComponent(req.params.componentId);
      
      if (!component) {
        return res.status(404).json({ error: "Component not found" });
      }

      // Regenerate geometry from stored parameters
      const params: CADParameters = {
        type: component.componentType as any,
        dimensions: component.dimensions as any,
        material: component.material ? { type: component.material } : undefined,
        units: 'mm'
      };

      const result = generateCADModel(params);
      const stepData = exportSTEP(result.geometry, {
        projectId: req.params.id,
        componentId: component.id,
        material: component.material,
        manufacturingMethod: component.manufacturingMethod
      });

      res.setHeader('Content-Type', 'model/step');
      res.setHeader('Content-Disposition', `attachment; filename="component-${component.id}.step"`);
      res.send(stepData);
    } catch (error) {
      console.error("STEP export error:", error);
      res.status(500).json({ error: "Failed to export STEP" });
    }
  });

  // Project Modules
  app.post("/api/projects/:id/modules", async (req, res) => {
    try {
      const validation = insertProjectModuleSchema.safeParse({
        ...req.body,
        projectId: req.params.id,
        nodeId: req.body.nodeId || randomUUID()
      });
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const module = await storage.createProjectModule(validation.data);
      res.status(201).json(module);
    } catch (error) {
      res.status(500).json({ error: "Failed to create module" });
    }
  });

  app.put("/api/projects/:projectId/modules/:id", async (req, res) => {
    try {
      const module = await storage.updateProjectModule(req.params.id, req.body);
      res.json(module);
    } catch (error) {
      res.status(500).json({ error: "Failed to update module" });
    }
  });

  app.delete("/api/projects/:projectId/modules/:id", async (req, res) => {
    try {
      await storage.deleteProjectModule(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete module" });
    }
  });

  // Project Connections
  app.post("/api/projects/:id/connections", async (req, res) => {
    try {
      const validation = insertProjectConnectionSchema.safeParse({
        ...req.body,
        projectId: req.params.id,
        edgeId: req.body.edgeId || randomUUID()
      });
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const connection = await storage.createProjectConnection(validation.data);
      res.status(201).json(connection);
    } catch (error) {
      res.status(500).json({ error: "Failed to create connection" });
    }
  });

  app.delete("/api/projects/:projectId/connections/:id", async (req, res) => {
    try {
      await storage.deleteProjectConnection(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete connection" });
    }
  });

  // Orchestration
  app.post("/api/projects/:id/orchestrator/start", async (req, res) => {
    try {
      const { userBrief } = req.body;
      if (!userBrief) {
        return res.status(400).json({ error: "User brief required" });
      }

      const orchestratorRunId = await orchestrationEngine.startOrchestration(
        req.params.id, 
        userBrief
      );
      
      res.json({ orchestratorRunId, status: "running" });
    } catch (error) {
      if (error instanceof Error && error.message.includes("already running")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to start orchestration" });
    }
  });

  // Pipeline template execution endpoint
  app.post("/api/projects/:id/orchestrator/pipeline/start", async (req, res) => {
    try {
      const { templateId, projectConfig } = req.body;
      if (!templateId) {
        return res.status(400).json({ error: "Pipeline template ID required" });
      }

      const orchestratorRunId = await orchestrationEngine.startPipelineExecution(
        req.params.id,
        templateId,
        projectConfig || {}
      );
      
      res.json({ orchestratorRunId, status: "running", templateId });
    } catch (error) {
      if (error instanceof Error && error.message.includes("already running")) {
        return res.status(409).json({ error: error.message });
      }
      if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      console.error("Pipeline execution error:", error);
      res.status(500).json({ error: "Failed to start pipeline execution" });
    }
  });

  app.put("/api/projects/:id/orchestrator/control", async (req, res) => {
    try {
      const { action, orchestratorRunId } = req.body;
      
      switch (action) {
        case "pause":
          await orchestrationEngine.pauseOrchestration(orchestratorRunId);
          break;
        case "resume":
          await orchestrationEngine.resumeOrchestration(orchestratorRunId);
          break;
        case "cancel":
          await orchestrationEngine.cancelOrchestration(orchestratorRunId);
          break;
        default:
          return res.status(400).json({ error: "Invalid action" });
      }
      
      res.json({ success: true, action });
    } catch (error) {
      res.status(500).json({ error: "Failed to control orchestration" });
    }
  });

  app.get("/api/projects/:id/orchestrator/status", async (req, res) => {
    try {
      const orchestratorRun = await storage.getLatestOrchestratorRun(req.params.id);
      if (!orchestratorRun) {
        return res.json({ status: "idle" });
      }

      const stageRuns = await storage.getStageRuns(orchestratorRun.id);
      
      res.json({
        status: orchestratorRun.status,
        currentStage: orchestratorRun.currentStage,
        progress: orchestratorRun.progress,
        context: orchestratorRun.context,
        stageRuns,
        availableActions: getAvailableActions(orchestratorRun.status)
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get orchestration status" });
    }
  });

  // EDA Export
  app.post("/api/eda/export/kicad", async (req, res) => {
    try {
      const { projectId } = req.body;
      if (!projectId) {
        return res.status(400).json({ error: "Project ID required" });
      }

      const files = await generateKiCadFiles(projectId);
      
      // In a real implementation, these would be saved to files and a download URL provided
      res.json({
        files: ["schematic.sch", "pcb.pcb", "project.kicad_pro"],
        downloadUrl: `/api/eda/download/${projectId}/kicad`,
        content: files
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate KiCad files" });
    }
  });

  app.get("/api/projects/:id/bom", async (req, res) => {
    try {
      const bom = await generateBOM(req.params.id);
      const totalCost = bom.reduce((sum, item) => sum + item.totalPrice, 0);
      
      res.json({
        items: bom,
        totalCost,
        currency: "USD",
        availability: "Most items in stock"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate BOM" });
    }
  });

  // Hardware Design Assistant Endpoints
  
  // Start initial design generation
  app.post("/api/projects/:id/hardware-design/start", authenticateJWT, aiRateLimit, async (req: any, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Import hardware design service
      const hardwareDesignService = await import("./services/hardwareDesign");

      // Generate initial design
      const initialDesign = await hardwareDesignService.generateInitialDesign(prompt);

      // Check for hazardous content
      const safetyCheck = hardwareDesignService.checkHazardousContent(JSON.stringify(initialDesign));
      if (safetyCheck.hasConcerns) {
        console.warn("Hazardous content detected:", safetyCheck.warnings);
      }

      // Create or update hardware design session
      let session = await storage.getHardwareDesignSessionByProject(req.params.id);
      if (session) {
        session = await storage.updateHardwareDesignSession(session.id, {
          initialPrompt: prompt,
          initialDesign: initialDesign as any,
          status: "initial_design"
        });
      } else {
        session = await storage.createHardwareDesignSession({
          projectId: req.params.id,
          initialPrompt: prompt,
          initialDesign: initialDesign as any,
          status: "initial_design"
        });
      }

      res.json({
        sessionId: session.id,
        initialDesign,
        safetyWarnings: safetyCheck.warnings
      });
    } catch (error) {
      console.error("Hardware design start error:", error);
      res.status(500).json({ 
        error: "Failed to start hardware design",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Refine design with feedback
  app.post("/api/projects/:id/hardware-design/refine", authenticateJWT, aiRateLimit, async (req: any, res) => {
    try {
      const { feedback } = req.body;
      if (!feedback || typeof feedback !== 'string') {
        return res.status(400).json({ error: "Feedback is required" });
      }

      const session = await storage.getHardwareDesignSessionByProject(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Design session not found. Start a new design first." });
      }

      const hardwareDesignService = await import("./services/hardwareDesign");

      // Generate refined design spec
      const designSpec = await hardwareDesignService.generateRefinedDesignSpec(
        session.initialPrompt || "",
        feedback,
        session.initialDesign
      );

      // Check for hazardous content
      const safetyCheck = hardwareDesignService.checkHazardousContent(JSON.stringify(designSpec));

      // Update session
      const updatedSession = await storage.updateHardwareDesignSession(session.id, {
        refinedFeedback: feedback,
        designSpec: designSpec as any,
        status: "refining"
      });

      res.json({
        sessionId: updatedSession.id,
        designSpec,
        safetyWarnings: safetyCheck.warnings
      });
    } catch (error) {
      console.error("Hardware design refine error:", error);
      res.status(500).json({ 
        error: "Failed to refine hardware design",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate master plan
  app.post("/api/projects/:id/hardware-design/master-plan", authenticateJWT, aiRateLimit, async (req: any, res) => {
    try {
      const session = await storage.getHardwareDesignSessionByProject(req.params.id);
      if (!session || !session.designSpec) {
        return res.status(404).json({ error: "Design spec not found. Complete design refinement first." });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const hardwareDesignService = await import("./services/hardwareDesign");

      // Generate master plan
      const masterPlanData = await hardwareDesignService.generateMasterPlan(
        session.initialPrompt || project.description || "Hardware project",
        session.designSpec as any
      );

      // Create or update master plan
      let masterPlan = await storage.getMasterPlanByProject(req.params.id);
      if (masterPlan) {
        masterPlan = await storage.updateMasterPlan(masterPlan.id, {
          version: (masterPlan.version || 1) + 1,
          llmModel: "gpt-4o",
          summary: masterPlanData.summary,
          steps: masterPlanData.steps as any
        });
      } else {
        masterPlan = await storage.createMasterPlan({
          projectId: req.params.id,
          version: 1,
          llmModel: "gpt-4o",
          summary: masterPlanData.summary,
          steps: masterPlanData.steps as any
        });
      }

      res.json({
        masterPlanId: masterPlan.id,
        masterPlan: {
          ...masterPlanData,
          id: masterPlan.id,
          version: masterPlan.version
        }
      });
    } catch (error) {
      console.error("Master plan generation error:", error);
      res.status(500).json({ 
        error: "Failed to generate master plan",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate modules from design spec
  app.post("/api/projects/:id/hardware-design/modules", authenticateJWT, aiRateLimit, async (req: any, res) => {
    try {
      const session = await storage.getHardwareDesignSessionByProject(req.params.id);
      if (!session || !session.designSpec) {
        return res.status(404).json({ error: "Design spec not found" });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const hardwareDesignService = await import("./services/hardwareDesign");
      const designSpec = session.designSpec as any;
      
      const createdModules: any[] = [];
      const matchedComponents: any[] = [];
      const unmatchedComponents: any[] = [];

      // Process each component in design spec
      for (const componentSpec of designSpec.components || []) {
        try {
          // Try to find matching component in database
          let dbComponent = null;
          
          if (componentSpec.primaryMpn) {
            const matches = await storage.searchComponents(componentSpec.primaryMpn);
            if (matches.length > 0) {
              dbComponent = matches[0];
              matchedComponents.push({
                name: componentSpec.name,
                matched: true,
                componentId: dbComponent.id
              });
            }
          }

          // If not matched, generate module with LLM
          let moduleData;
          if (!dbComponent) {
            unmatchedComponents.push({ name: componentSpec.name });
            
            // Generate module from spec
            moduleData = await hardwareDesignService.generateModuleFromSpec(componentSpec, {
              projectSummary: session.initialPrompt || "",
              designSpec: designSpec
            });
          } else {
            // Create basic module data from matched component
            moduleData = {
              componentName: componentSpec.name,
              type: dbComponent.category,
              voltage: 3300, // Default, will be overridden if specified
              pins: [
                { name: "VCC", type: "power" as const, voltage: 3300 },
                { name: "GND", type: "ground" as const }
              ]
            };
          }

          // Create design module
          const designModule = await storage.createDesignModule({
            projectId: req.params.id,
            componentName: moduleData.componentName,
            componentId: dbComponent?.id,
            type: moduleData.type,
            voltage: moduleData.voltage,
            maxVoltage: moduleData.maxVoltage,
            maxCurrent: moduleData.maxCurrent,
            avgPowerDraw: moduleData.avgPowerDraw,
            wifi: moduleData.wifi,
            bluetooth: moduleData.bluetooth,
            firmwareLanguage: moduleData.firmwareLanguage,
            softwareLanguage: moduleData.softwareLanguage,
            computeRating: moduleData.computeRating,
            componentType: moduleData.componentType,
            isMotorOrServo: hardwareDesignService.isMotorOrServo(moduleData),
            notes: "",
            position: { x: createdModules.length * 200 + 100, y: 200 }
          });

          // Create pins for the module
          const createdPins = [];
          for (let i = 0; i < moduleData.pins.length; i++) {
            const pinData = moduleData.pins[i];
            const pin = await storage.createDesignPin({
              moduleId: designModule.id,
              name: pinData.name,
              type: pinData.type,
              voltage: pinData.voltage,
              maxVoltage: pinData.maxVoltage,
              maxCurrent: pinData.maxCurrent,
              notes: pinData.notes,
              enabled: true,
              layoutIndex: i,
              connectionHints: pinData.connectionHints
            });
            createdPins.push(pin);
          }

          createdModules.push({
            ...designModule,
            pins: createdPins
          });

        } catch (componentError) {
          console.error(`Failed to create module for ${componentSpec.name}:`, componentError);
          unmatchedComponents.push({ 
            name: componentSpec.name, 
            error: componentError instanceof Error ? componentError.message : "Unknown error"
          });
        }
      }

      // Update session status
      await storage.updateHardwareDesignSession(session.id, {
        status: "modules_created"
      });

      res.json({
        modules: createdModules,
        summary: {
          total: createdModules.length,
          matched: matchedComponents.length,
          unmatched: unmatchedComponents.length
        },
        matchedComponents,
        unmatchedComponents
      });
    } catch (error) {
      console.error("Module generation error:", error);
      res.status(500).json({ 
        error: "Failed to generate modules",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Enrich actuator/motor modules
  app.post("/api/projects/:id/hardware-design/actuators", authenticateJWT, aiRateLimit, async (req: any, res) => {
    try {
      const modules = await storage.getDesignModules(req.params.id);
      const actuatorModules = modules.filter(m => m.isMotorOrServo);

      if (actuatorModules.length === 0) {
        return res.json({ 
          message: "No actuator modules found",
          enrichedModules: []
        });
      }

      const session = await storage.getHardwareDesignSessionByProject(req.params.id);
      const hardwareDesignService = await import("./services/hardwareDesign");
      
      const enrichedModules = [];

      for (const module of actuatorModules) {
        try {
          const enrichment = await hardwareDesignService.enrichActuatorModule(module, {
            projectSummary: session?.initialPrompt || "Hardware project with actuators"
          });

          // Update module with servo/motor properties
          const updated = await storage.updateDesignModule(module.id, {
            servoMotorProps: enrichment.servoMotorProps as any
          });

          // Add additional pins if specified
          if (enrichment.additionalPins && enrichment.additionalPins.length > 0) {
            for (const pinData of enrichment.additionalPins) {
              await storage.createDesignPin({
                moduleId: module.id,
                name: pinData.name,
                type: pinData.type,
                voltage: pinData.voltage,
                maxVoltage: pinData.maxVoltage,
                maxCurrent: pinData.maxCurrent,
                notes: pinData.notes,
                enabled: true,
                connectionHints: pinData.connectionHints
              });
            }
          }

          // Create controller module if required
          let controllerModule = null;
          if (enrichment.controllerRequired && enrichment.controllerModule) {
            const controllerData = enrichment.controllerModule;
            const createdController = await storage.createDesignModule({
              projectId: req.params.id,
              componentName: controllerData.componentName,
              type: controllerData.type,
              voltage: controllerData.voltage,
              maxVoltage: controllerData.maxVoltage,
              maxCurrent: controllerData.maxCurrent,
              notes: `Controller for ${module.componentName}`,
              position: { x: (module.position as any)?.x + 250 || 300, y: (module.position as any)?.y || 200 }
            });

            // Create pins for controller
            for (const pinData of controllerData.pins || []) {
              await storage.createDesignPin({
                moduleId: createdController.id,
                name: pinData.name,
                type: pinData.type,
                voltage: pinData.voltage,
                maxVoltage: pinData.maxVoltage,
                maxCurrent: pinData.maxCurrent,
                notes: pinData.notes,
                enabled: true,
                connectionHints: pinData.connectionHints
              });
            }

            controllerModule = createdController;
          }

          enrichedModules.push({
            module: updated,
            enrichment,
            controllerModule
          });

        } catch (enrichError) {
          console.error(`Failed to enrich actuator ${module.componentName}:`, enrichError);
        }
      }

      res.json({
        enrichedModules,
        summary: {
          total: actuatorModules.length,
          enriched: enrichedModules.length,
          controllersAdded: enrichedModules.filter(e => e.controllerModule).length
        }
      });
    } catch (error) {
      console.error("Actuator enrichment error:", error);
      res.status(500).json({ 
        error: "Failed to enrich actuators",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate wiring connections
  app.post("/api/projects/:id/hardware-design/wiring", authenticateJWT, aiRateLimit, async (req: any, res) => {
    try {
      const modules = await storage.getDesignModules(req.params.id);
      
      if (modules.length === 0) {
        return res.status(400).json({ error: "No modules found. Create modules first." });
      }

      const session = await storage.getHardwareDesignSessionByProject(req.params.id);
      const hardwareDesignService = await import("./services/hardwareDesign");

      // Generate wiring
      const wiringData = await hardwareDesignService.generateWiring(modules, {
        projectSummary: session?.initialPrompt || "Hardware project",
        designSpec: session?.designSpec as any || {}
      });

      // Create connections from wiring data
      const createdConnections = [];
      
      for (const connData of wiringData.connections) {
        // Find the pins by module name and pin name
        const fromModule = modules.find(m => m.componentName === connData.fromModuleName);
        const toModule = modules.find(m => m.componentName === connData.toModuleName);

        if (!fromModule || !toModule) {
          console.warn(`Modules not found for connection: ${connData.fromModuleName} -> ${connData.toModuleName}`);
          continue;
        }

        const fromPin = fromModule.pins?.find(p => p.name === connData.fromPinName);
        const toPin = toModule.pins?.find(p => p.name === connData.toPinName);

        if (!fromPin || !toPin) {
          console.warn(`Pins not found for connection: ${connData.fromPinName} -> ${connData.toPinName}`);
          continue;
        }

        const connection = await storage.createDesignConnection({
          projectId: req.params.id,
          fromPinId: fromPin.id,
          toPinId: toPin.id,
          kind: connData.kind,
          netName: connData.netName,
          notes: connData.notes
        });

        createdConnections.push(connection);
      }

      // Update session status
      await storage.updateHardwareDesignSession(session!.id, {
        status: "complete"
      });

      res.json({
        connections: createdConnections,
        powerDistribution: wiringData.powerDistribution,
        notes: wiringData.notes,
        summary: {
          totalConnections: createdConnections.length,
          powerConnections: createdConnections.filter(c => c.kind === 'power').length,
          groundConnections: createdConnections.filter(c => c.kind === 'ground').length,
          signalConnections: createdConnections.filter(c => c.kind === 'signal').length
        }
      });
    } catch (error) {
      console.error("Wiring generation error:", error);
      res.status(500).json({ 
        error: "Failed to generate wiring",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get hardware design session
  app.get("/api/projects/:id/hardware-design/session", async (req, res) => {
    try {
      const session = await storage.getHardwareDesignSessionByProject(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "No design session found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch design session" });
    }
  });

  // Get design modules for project
  app.get("/api/projects/:id/hardware-design/modules", async (req, res) => {
    try {
      const modules = await storage.getDesignModules(req.params.id);
      res.json(modules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch modules" });
    }
  });

  // Update design module
  app.put("/api/projects/:projectId/hardware-design/modules/:id", async (req, res) => {
    try {
      const updates = req.body;
      const module = await storage.updateDesignModule(req.params.id, updates);
      res.json(module);
    } catch (error) {
      res.status(500).json({ error: "Failed to update module" });
    }
  });

  // Update design pin
  app.put("/api/projects/:projectId/hardware-design/pins/:id", async (req, res) => {
    try {
      const updates = req.body;
      const pin = await storage.updateDesignPin(req.params.id, updates);
      res.json(pin);
    } catch (error) {
      res.status(500).json({ error: "Failed to update pin" });
    }
  });

  // Get design connections
  app.get("/api/projects/:id/hardware-design/connections", async (req, res) => {
    try {
      const connections = await storage.getDesignConnections(req.params.id);
      res.json(connections);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch connections" });
    }
  });

  // Create design connection
  app.post("/api/projects/:id/hardware-design/connections", async (req, res) => {
    try {
      const connection = await storage.createDesignConnection({
        projectId: req.params.id,
        ...req.body
      });
      res.status(201).json(connection);
    } catch (error) {
      res.status(500).json({ error: "Failed to create connection" });
    }
  });

  // Delete design connection
  app.delete("/api/projects/:projectId/hardware-design/connections/:id", async (req, res) => {
    try {
      await storage.deleteDesignConnection(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete connection" });
    }
  });

  // Get master plan
  app.get("/api/projects/:id/hardware-design/master-plan", async (req, res) => {
    try {
      const masterPlan = await storage.getMasterPlanByProject(req.params.id);
      if (!masterPlan) {
        return res.status(404).json({ error: "No master plan found" });
      }
      res.json(masterPlan);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch master plan" });
    }
  });

  // Health endpoints
  app.get("/api/health/live", async (req, res) => {
    const liveness = await monitoring.getLivenessCheck();
    res.json(liveness);
  });

  app.get("/api/health/ready", async (req, res) => {
    try {
      const healthStatus = await monitoring.getHealthStatus();

      if (healthStatus.status === "healthy") {
        res.json(healthStatus);
      } else {
        res.status(503).json(healthStatus);
      }
    } catch (error) {
      logger.error("Health check failed", {}, error instanceof Error ? error : new Error(String(error)));
      res.status(503).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Health check failed"
      });
    }
  });

  // Performance metrics endpoint (admin only in production)
  app.get("/api/metrics", async (req, res) => {
    try {
      const metrics = monitoring.getPerformanceMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to get metrics" });
    }
  });

  const httpServer = createServer(app);

  // Custom Module Designer API
  app.post("/api/modules/design", authenticateJWT, aiRateLimit, async (req: any, res) => {
    try {
      const { name, description, category, specifications, pinCount, package: packageType, features } = req.body;
      
      if (!name || !category) {
        return res.status(400).json({ error: "Name and category are required" });
      }
      
      // Design the custom module using AI
      const moduleDesign = await designCustomModule({
        name,
        description: description || "",
        category,
        specifications: specifications || "",
        pinCount,
        package: packageType,
        features
      });
      
      // Create the component in the database
      const component = await storage.createComponent({
        mpn: moduleDesign.mpn,
        manufacturer: moduleDesign.manufacturer,
        category: moduleDesign.category as any,
        name: moduleDesign.name,
        description: moduleDesign.description,
        specifications: {
          ...moduleDesign.specifications,
          pinout: moduleDesign.pinout,
          electricalCharacteristics: moduleDesign.electricalCharacteristics,
          package: moduleDesign.package,
          edaSymbol: moduleDesign.edaSymbol,
          edaFootprint: moduleDesign.edaFootprint,
          customDesigned: true,
          designedAt: new Date().toISOString()
        }
      });
      
      res.json({ 
        success: true, 
        component,
        moduleDesign 
      });
    } catch (error) {
      console.error("Custom module design error:", error);
      res.status(500).json({ 
        error: "Failed to design custom module",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Get custom modules for a project or user
  app.get("/api/modules/custom", async (req, res) => {
    try {
      // Get all components that are custom designed
      const components = await storage.getAllComponents();
      const customModules = components.filter((c: Component) => 
        c.specifications && 
        typeof c.specifications === 'object' &&
        (c.specifications as any).customDesigned === true
      );
      
      res.json(customModules);
    } catch (error) {
      console.error("Error fetching custom modules:", error);
      res.status(500).json({ error: "Failed to fetch custom modules" });
    }
  });
  
  // WebSocket Server for Real-time Collaboration
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    const connectionId = randomUUID();
    console.log(`WebSocket connected: ${connectionId}`);
    
    // Add connection to orchestration engine for progress updates
    orchestrationEngine.addWebSocketConnection(connectionId, ws);
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle different message types
        switch (message.type) {
          case 'canvas_update':
            // Broadcast canvas updates to other clients
            broadcastToOthers(wss, ws, message);
            break;
          case 'user_presence':
            // Handle user presence updates
            broadcastToOthers(wss, ws, message);
            break;
          case 'cursor_position':
            // Handle real-time cursor tracking
            broadcastToOthers(wss, ws, message);
            break;
          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    ws.on('close', () => {
      console.log(`WebSocket disconnected: ${connectionId}`);
      orchestrationEngine.removeWebSocketConnection(connectionId);
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      orchestrationEngine.removeWebSocketConnection(connectionId);
    });
  });

  return httpServer;
}

function broadcastToOthers(wss: WebSocketServer, sender: WebSocket, message: any) {
  wss.clients.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function getAvailableActions(status: string): string[] {
  switch (status) {
    case "running":
      return ["pause", "cancel"];
    case "paused":
      return ["resume", "cancel"];
    case "idle":
    case "completed":
    case "error":
    case "cancelled":
      return ["start"];
    default:
      return [];
  }
}
