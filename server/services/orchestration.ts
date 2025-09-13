import { storage } from "../storage";
import { generateCircuit, validateCircuit } from "./openai";
import { generateKiCadFiles, generateSchematic, generateBOM } from "./eda";

export interface OrchestrationContext {
  projectId: string;
  userBrief: string;
  currentStage: string;
  progress: number;
  stageData: Record<string, any>;
  errors: string[];
}

export class OrchestrationEngine {
  private wsConnections = new Map<string, any>(); // WebSocket connections

  constructor() {
    this.setupStages();
  }

  private setupStages() {
    // Define orchestration stages
  }

  async startOrchestration(projectId: string, userBrief: string): Promise<string> {
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Check if orchestration is already running
    const existingRun = await storage.getLatestOrchestratorRun(projectId);
    if (existingRun && existingRun.status === "running") {
      throw new Error("Orchestration already running for this project");
    }

    // Create new orchestration run
    const orchestratorRun = await storage.createOrchestratorRun({
      projectId,
      status: "running",
      currentStage: "planning",
      progress: 0,
      context: {
        userBrief,
        projectTitle: project.title,
        startedAt: new Date().toISOString()
      }
    });

    // Start the orchestration process
    this.executeOrchestration(orchestratorRun.id);

    return orchestratorRun.id;
  }

  private async executeOrchestration(orchestratorRunId: string) {
    try {
      const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
      if (!orchestratorRun) return;

      // Stage 1: Planning
      await this.executePlanningStage(orchestratorRunId);
      
      // Stage 2: Building
      await this.executeBuildingStage(orchestratorRunId);
      
      // Stage 3: Validation
      await this.executeValidationStage(orchestratorRunId);
      
      // Stage 4: Export
      await this.executeExportStage(orchestratorRunId);

      // Complete orchestration
      await storage.updateOrchestratorRun(orchestratorRunId, {
        status: "completed",
        progress: 100,
        completedAt: new Date()
      });

      this.broadcastUpdate(orchestratorRunId, "completed", 100);

    } catch (error) {
      await storage.updateOrchestratorRun(orchestratorRunId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error"
      });

      this.broadcastUpdate(orchestratorRunId, "error", 0);
    }
  }

  private async executePlanningStage(orchestratorRunId: string) {
    const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
    if (!orchestratorRun) return;

    await storage.updateOrchestratorRun(orchestratorRunId, {
      currentStage: "planning",
      progress: 10
    });

    this.broadcastUpdate(orchestratorRunId, "planning", 10, "Analyzing requirements and planning circuit design...");

    const context = orchestratorRun.context as any;
    
    // Generate circuit using AI
    const circuitDesign = await generateCircuit({
      userBrief: context.userBrief,
      projectTitle: context.projectTitle
    });

    // Update context with generated circuit
    await storage.updateOrchestratorRun(orchestratorRunId, {
      progress: 25,
      context: {
        ...context,
        circuitDesign
      }
    });

    this.broadcastUpdate(orchestratorRunId, "planning", 25, "Circuit design generated successfully");
  }

  private async executeBuildingStage(orchestratorRunId: string) {
    const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
    if (!orchestratorRun) return;

    await storage.updateOrchestratorRun(orchestratorRunId, {
      currentStage: "building",
      progress: 35
    });

    this.broadcastUpdate(orchestratorRunId, "building", 35, "Creating project modules and connections...");

    const context = orchestratorRun.context as any;
    const circuitDesign = context.circuitDesign;

    // Create project modules
    for (const component of circuitDesign.components) {
      // Find or create component in database
      let dbComponent = await storage.searchComponents(component.mpn || component.label);
      if (dbComponent.length === 0) {
        dbComponent = [await storage.createComponent({
          mpn: component.mpn || `CUSTOM_${component.id}`,
          manufacturer: "Generic",
          category: component.type,
          name: component.label,
          description: `Auto-generated component for ${component.label}`,
          specifications: component.specifications
        })];
      }

      // Create project module
      await storage.createProjectModule({
        projectId: orchestratorRun.projectId,
        componentId: dbComponent[0].id,
        nodeId: component.id,
        label: component.label,
        position: component.position,
        configuration: component.specifications,
        firmwareCode: circuitDesign.firmwareCode
      });
    }

    await storage.updateOrchestratorRun(orchestratorRunId, {
      progress: 65
    });

    this.broadcastUpdate(orchestratorRunId, "building", 65, "Generating schematic and PCB layout...");

    // Generate schematic
    const schematic = await generateSchematic(circuitDesign);
    
    await storage.updateOrchestratorRun(orchestratorRunId, {
      progress: 85,
      context: {
        ...context,
        schematic
      }
    });

    this.broadcastUpdate(orchestratorRunId, "building", 85, "Building phase completed");
  }

  private async executeValidationStage(orchestratorRunId: string) {
    const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
    if (!orchestratorRun) return;

    await storage.updateOrchestratorRun(orchestratorRunId, {
      currentStage: "validation",
      progress: 90
    });

    this.broadcastUpdate(orchestratorRunId, "validation", 90, "Validating circuit design...");

    const context = orchestratorRun.context as any;
    
    // Validate circuit
    const validation = await validateCircuit(context.circuitDesign);
    
    await storage.updateOrchestratorRun(orchestratorRunId, {
      progress: 95,
      context: {
        ...context,
        validation
      }
    });

    this.broadcastUpdate(orchestratorRunId, "validation", 95, "Circuit validation completed");
  }

  private async executeExportStage(orchestratorRunId: string) {
    const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
    if (!orchestratorRun) return;

    await storage.updateOrchestratorRun(orchestratorRunId, {
      currentStage: "export",
      progress: 98
    });

    this.broadcastUpdate(orchestratorRunId, "export", 98, "Generating export files...");

    const context = orchestratorRun.context as any;
    
    // Generate BOM
    const bom = await generateBOM(orchestratorRun.projectId);
    
    await storage.updateOrchestratorRun(orchestratorRunId, {
      progress: 100,
      context: {
        ...context,
        bom,
        exportFiles: {
          schematic: "available",
          pcb: "available", 
          netlist: "available",
          bom: "available"
        }
      }
    });

    this.broadcastUpdate(orchestratorRunId, "export", 100, "Export files generated successfully");
  }

  async pauseOrchestration(orchestratorRunId: string): Promise<void> {
    await storage.updateOrchestratorRun(orchestratorRunId, {
      status: "paused"
    });
    this.broadcastUpdate(orchestratorRunId, "paused", 0);
  }

  async resumeOrchestration(orchestratorRunId: string): Promise<void> {
    await storage.updateOrchestratorRun(orchestratorRunId, {
      status: "running"
    });
    this.broadcastUpdate(orchestratorRunId, "running", 0);
  }

  async cancelOrchestration(orchestratorRunId: string): Promise<void> {
    await storage.updateOrchestratorRun(orchestratorRunId, {
      status: "cancelled",
      completedAt: new Date()
    });
    this.broadcastUpdate(orchestratorRunId, "cancelled", 0);
  }

  private broadcastUpdate(orchestratorRunId: string, status: string, progress: number, message?: string) {
    const update = {
      type: "orchestration_progress",
      orchestratorRunId,
      status,
      progress,
      message,
      timestamp: new Date().toISOString()
    };

    // Broadcast to all connected WebSocket clients
    this.wsConnections.forEach((ws) => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify(update));
      }
    });
  }

  addWebSocketConnection(id: string, ws: any) {
    this.wsConnections.set(id, ws);
  }

  removeWebSocketConnection(id: string) {
    this.wsConnections.delete(id);
  }
}

export const orchestrationEngine = new OrchestrationEngine();
