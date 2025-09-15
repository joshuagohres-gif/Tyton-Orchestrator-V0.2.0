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

export interface StageError {
  id: string;
  stageName: string;
  category: 'transient' | 'configuration' | 'validation' | 'resource' | 'fatal';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  stack?: string;
  context?: Record<string, any>;
  timestamp: string;
  retryable: boolean;
  suggestedAction?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number; // milliseconds
  maxDelay?: number;
  jitter?: boolean;
}

export interface StageRecoveryContext {
  stageName: string;
  attempt: number;
  previousErrors: StageError[];
  recoveryActions: string[];
  canSkip: boolean;
  dependencies: string[];
}

const DEFAULT_RETRY_POLICIES: Record<string, RetryPolicy> = {
  ai_generation: {
    maxAttempts: 3,
    backoffStrategy: 'exponential',
    baseDelay: 2000,
    maxDelay: 30000,
    jitter: true
  },
  validation: {
    maxAttempts: 2,
    backoffStrategy: 'linear',
    baseDelay: 1000,
    maxDelay: 5000,
    jitter: false
  },
  export: {
    maxAttempts: 5,
    backoffStrategy: 'exponential',
    baseDelay: 1000,
    maxDelay: 15000,
    jitter: true
  },
  user_input: {
    maxAttempts: 1,
    backoffStrategy: 'fixed',
    baseDelay: 0,
    jitter: false
  }
};

export class OrchestrationEngine {
  private wsConnections = new Map<string, any>(); // WebSocket connections
  private stageErrors = new Map<string, StageError[]>(); // Track errors per orchestration run
  private retryAttempts = new Map<string, number>(); // Track retry attempts per stage

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

  async startPipelineExecution(projectId: string, templateId: string, projectConfig: Record<string, any> = {}): Promise<string> {
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Get pipeline template
    const template = await storage.getPipelineTemplate(templateId);
    if (!template) {
      throw new Error("Pipeline template not found");
    }

    // Check if orchestration is already running
    const existingRun = await storage.getLatestOrchestratorRun(projectId);
    if (existingRun && existingRun.status === "running") {
      throw new Error("Orchestration already running for this project");
    }

    // Get stage definitions for this template
    const stageDefinitions = await storage.getStageDefinitionsByTemplate(templateId);
    if (!stageDefinitions || stageDefinitions.length === 0) {
      throw new Error("No stages defined for this pipeline template");
    }

    // Sort stages by order
    const sortedStages = [...stageDefinitions].sort((a, b) => a.order - b.order);
    const firstStage = sortedStages[0];

    // Create new orchestration run with pipeline context
    const orchestratorRun = await storage.createOrchestratorRun({
      projectId,
      status: "running",
      currentStage: firstStage.name,
      progress: 0,
      context: {
        templateId,
        templateName: template.name,
        projectTitle: project.title,
        projectConfig,
        stageDefinitions: sortedStages,
        startedAt: new Date().toISOString(),
        isPipelineExecution: true
      }
    });

    // Start the pipeline execution process
    this.executePipeline(orchestratorRun.id);

    return orchestratorRun.id;
  }

  private async executePipeline(orchestratorRunId: string) {
    try {
      const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
      if (!orchestratorRun) return;

      const context = orchestratorRun.context as any;
      if (!context.isPipelineExecution || !context.stageDefinitions) {
        throw new Error("Invalid pipeline execution context");
      }

      const stageDefinitions = context.stageDefinitions;
      
      // Execute stages in order, respecting dependencies and parallel execution
      for (let i = 0; i < stageDefinitions.length; i++) {
        const stage = stageDefinitions[i];
        
        try {
          // Check dependencies before executing stage
          if (stage.dependencies && stage.dependencies.length > 0) {
            await this.validateStageDependencies(orchestratorRunId, stage.dependencies);
          }

          // Execute the stage
          await this.executePipelineStage(orchestratorRunId, stage);
          
          // Update overall progress
          const overallProgress = Math.round(((i + 1) / stageDefinitions.length) * 100);
          await storage.updateOrchestratorRun(orchestratorRunId, {
            progress: overallProgress
          });

        } catch (error) {
          const stageError = this.categorizeError(error, stage.name);
          
          // Handle stage error with retry logic
          const shouldRetry = await this.handlePipelineStageError(orchestratorRunId, stage, stageError);
          
          if (!shouldRetry) {
            // If not retrying, stop pipeline execution
            return;
          }
        }
      }

      // Complete pipeline execution
      await storage.updateOrchestratorRun(orchestratorRunId, {
        status: "completed",
        progress: 100,
        completedAt: new Date()
      });

      this.broadcastUpdate(orchestratorRunId, "completed", 100, "Pipeline completed successfully");

    } catch (error) {
      const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
      const stageError = this.categorizeError(error, orchestratorRun?.currentStage || 'unknown');
      await this.handleStageError(orchestratorRunId, stageError);
    }
  }

  private async executePipelineStage(orchestratorRunId: string, stageDefinition: any): Promise<void> {
    // Create stage run record
    const stageRun = await storage.createStageRun({
      orchestratorRunId,
      stageName: stageDefinition.name,
      status: "running",
      input: {},
      output: {},
      attempts: 1
    });

    // Update orchestrator current stage
    await storage.updateOrchestratorRun(orchestratorRunId, {
      currentStage: stageDefinition.name
    });

    this.broadcastUpdate(
      orchestratorRunId, 
      stageDefinition.name, 
      0, 
      `Starting ${stageDefinition.displayName}...`
    );

    // Execute stage based on category
    try {
      switch (stageDefinition.category) {
        case 'ai_generation':
          await this.executeAIGenerationStage(orchestratorRunId, stageDefinition, stageRun.id);
          break;
        case 'validation':
          await this.executeValidationStageFromPipeline(orchestratorRunId, stageDefinition, stageRun.id);
          break;
        case 'export':
          await this.executeExportStageFromPipeline(orchestratorRunId, stageDefinition, stageRun.id);
          break;
        case 'user_input':
          await this.executeUserInputStage(orchestratorRunId, stageDefinition, stageRun.id);
          break;
        default:
          // Try to map to existing hardcoded stages
          await this.executeStageByName(orchestratorRunId, stageDefinition.name);
      }

      // Mark stage as completed
      await storage.updateStageRun(stageRun.id, {
        status: "completed",
        completedAt: new Date()
      });

      this.broadcastUpdate(
        orchestratorRunId, 
        stageDefinition.name, 
        100, 
        `${stageDefinition.displayName} completed successfully`
      );

    } catch (error) {
      // Mark stage as failed
      await storage.updateStageRun(stageRun.id, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
      throw error;
    }
  }

  private async validateStageDependencies(orchestratorRunId: string, dependencies: string[]): Promise<void> {
    const stageRuns = await storage.getStageRuns(orchestratorRunId);
    
    for (const dependency of dependencies) {
      const dependencyStageRun = stageRuns.find(run => run.stageName === dependency);
      
      if (!dependencyStageRun) {
        throw new Error(`Dependency stage '${dependency}' not found`);
      }
      
      if (dependencyStageRun.status !== 'completed' && dependencyStageRun.status !== 'skipped') {
        throw new Error(`Dependency stage '${dependency}' has not completed successfully`);
      }
    }
  }

  private calculateBackoffDelay(retryPolicy: RetryPolicy, attempt: number): number {
    const baseDelay = retryPolicy.baseDelay;
    let delay = baseDelay;
    
    switch (retryPolicy.backoffStrategy) {
      case 'exponential':
        delay = baseDelay * Math.pow(2, attempt);
        break;
      case 'linear':
        delay = baseDelay * (attempt + 1);
        break;
      case 'fixed':
      default:
        delay = baseDelay;
        break;
    }
    
    // Apply max delay limit
    if (retryPolicy.maxDelay) {
      delay = Math.min(delay, retryPolicy.maxDelay);
    }
    
    // Add jitter if configured
    if (retryPolicy.jitter) {
      const jitterRange = delay * 0.1; // 10% jitter
      delay += (Math.random() - 0.5) * 2 * jitterRange;
    }
    
    return Math.max(delay, 0);
  }

  private async handlePipelineStageError(
    orchestratorRunId: string,
    stageDefinition: any,
    stageError: StageError
  ): Promise<boolean> {
    // Get retry policy from stage definition
    const retryPolicy = stageDefinition.retryPolicy || DEFAULT_RETRY_POLICIES[stageDefinition.category] || DEFAULT_RETRY_POLICIES.ai_generation;
    
    // Check if stage can be retried
    const currentAttempts = this.retryAttempts.get(`${orchestratorRunId}-${stageDefinition.name}`) || 0;
    
    if (currentAttempts < retryPolicy.maxAttempts && stageError.retryable) {
      // Increment retry attempts
      this.retryAttempts.set(`${orchestratorRunId}-${stageDefinition.name}`, currentAttempts + 1);
      
      // Calculate backoff delay
      const delay = this.calculateBackoffDelay(retryPolicy, currentAttempts);
      
      this.broadcastUpdate(
        orchestratorRunId,
        stageDefinition.name,
        0,
        `Stage failed, retrying in ${Math.round(delay / 1000)}s... (attempt ${currentAttempts + 1}/${retryPolicy.maxAttempts})`
      );
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retry the stage
      await this.executePipelineStage(orchestratorRunId, stageDefinition);
      return true;
    }
    
    // Check if stage is optional and can be skipped
    if (stageDefinition.isOptional) {
      // Skip this stage
      const stageRuns = await storage.getStageRuns(orchestratorRunId);
      const failedStageRun = stageRuns.find(run => run.stageName === stageDefinition.name && run.status === 'error');
      
      if (failedStageRun) {
        await storage.updateStageRun(failedStageRun.id, {
          status: "skipped"
        });
      }
      
      this.broadcastUpdate(
        orchestratorRunId,
        stageDefinition.name,
        100,
        `Optional stage skipped due to failure`
      );
      
      return true; // Continue pipeline
    }
    
    // Stage cannot be retried or skipped, fail the pipeline
    await storage.updateOrchestratorRun(orchestratorRunId, {
      status: "error",
      completedAt: new Date()
    });
    
    this.broadcastUpdate(
      orchestratorRunId,
      "error",
      0,
      `Pipeline failed at stage: ${stageDefinition.displayName}`
    );
    
    return false; // Stop pipeline
  }

  // Placeholder implementations for pipeline stage execution
  private async executeAIGenerationStage(orchestratorRunId: string, stageDefinition: any, stageRunId: string): Promise<void> {
    // Use existing AI generation logic or implement new pipeline-specific logic
    await this.executePlanningStage(orchestratorRunId);
  }

  private async executeValidationStageFromPipeline(orchestratorRunId: string, stageDefinition: any, stageRunId: string): Promise<void> {
    // Use existing validation logic or implement new pipeline-specific logic
    await this.executeValidationStage(orchestratorRunId);
  }

  private async executeExportStageFromPipeline(orchestratorRunId: string, stageDefinition: any, stageRunId: string): Promise<void> {
    // Use existing export logic or implement new pipeline-specific logic
    await this.executeExportStage(orchestratorRunId);
  }

  private async executeUserInputStage(orchestratorRunId: string, stageDefinition: any, stageRunId: string): Promise<void> {
    // Pause execution and wait for user input
    await storage.updateOrchestratorRun(orchestratorRunId, {
      status: "paused"
    });
    
    this.broadcastUpdate(
      orchestratorRunId,
      stageDefinition.name,
      50,
      `Waiting for user input: ${stageDefinition.description || stageDefinition.displayName}`
    );
    
    // In a real implementation, this would wait for user input through UI
    // For now, we'll simulate completion after a delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await storage.updateOrchestratorRun(orchestratorRunId, {
      status: "running"
    });
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
      const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
      const stageError = this.categorizeError(error, orchestratorRun?.currentStage || 'unknown');
      await this.handleStageError(orchestratorRunId, stageError);
    }
  }

  private async executePlanningStage(orchestratorRunId: string) {
    const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
    if (!orchestratorRun) return;

    // Create stage run record
    const stageRun = await storage.createStageRun({
      orchestratorRunId,
      stageName: "planning",
      status: "running",
      input: {
        userBrief: (orchestratorRun.context as any)?.userBrief,
        projectTitle: (orchestratorRun.context as any)?.projectTitle
      },
      output: {},
      attempts: 1
    });

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

    // Update stage run as completed
    await storage.updateStageRun(stageRun.id, {
      status: "completed",
      output: { circuitDesign },
      completedAt: new Date()
    });
  }

  private async executeBuildingStage(orchestratorRunId: string) {
    const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
    if (!orchestratorRun) return;

    // Create stage run record
    const stageRun = await storage.createStageRun({
      orchestratorRunId,
      stageName: "building",
      status: "running",
      input: {
        circuitDesign: (orchestratorRun.context as any)?.circuitDesign
      },
      output: {},
      attempts: 1
    });

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

    // Update stage run as completed
    await storage.updateStageRun(stageRun.id, {
      status: "completed",
      output: { schematic, modulesCreated: circuitDesign.components.length },
      completedAt: new Date()
    });
  }

  private async executeValidationStage(orchestratorRunId: string) {
    const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
    if (!orchestratorRun) return;

    // Create stage run record
    const stageRun = await storage.createStageRun({
      orchestratorRunId,
      stageName: "validation",
      status: "running",
      input: {
        circuitDesign: (orchestratorRun.context as any)?.circuitDesign
      },
      output: {},
      attempts: 1
    });

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

    // Update stage run as completed
    await storage.updateStageRun(stageRun.id, {
      status: "completed",
      output: { validation },
      completedAt: new Date()
    });
  }

  private async executeExportStage(orchestratorRunId: string) {
    const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
    if (!orchestratorRun) return;

    // Create stage run record
    const stageRun = await storage.createStageRun({
      orchestratorRunId,
      stageName: "export",
      status: "running",
      input: {
        projectId: orchestratorRun.projectId
      },
      output: {},
      attempts: 1
    });

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

    // Update stage run as completed
    await storage.updateStageRun(stageRun.id, {
      status: "completed",
      output: { bom, exportFiles: context.exportFiles },
      completedAt: new Date()
    });
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

  // Enhanced Error Handling and Recovery Methods

  private categorizeError(error: any, stageName: string): StageError {
    const timestamp = new Date().toISOString();
    const errorId = `${stageName}-${Date.now()}`;
    
    // Categorize error based on type and content
    let category: StageError['category'] = 'fatal';
    let severity: StageError['severity'] = 'critical';
    let retryable = false;
    let suggestedAction: string | undefined;

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    // AI/OpenAI related errors
    if (message.includes('rate limit') || message.includes('quota')) {
      category = 'resource';
      severity = 'medium';
      retryable = true;
      suggestedAction = 'Wait and retry with exponential backoff';
    } else if (message.includes('timeout') || message.includes('network')) {
      category = 'transient';
      severity = 'medium';
      retryable = true;
      suggestedAction = 'Retry operation with increased timeout';
    } else if (message.includes('validation') || message.includes('invalid')) {
      category = 'validation';
      severity = 'high';
      retryable = false;
      suggestedAction = 'Review input parameters and configuration';
    } else if (message.includes('configuration') || message.includes('config')) {
      category = 'configuration';
      severity = 'high';
      retryable = false;
      suggestedAction = 'Check stage configuration and dependencies';
    } else if (message.includes('connection') || message.includes('ECONNRESET')) {
      category = 'transient';
      severity = 'medium';
      retryable = true;
      suggestedAction = 'Check network connectivity and retry';
    }

    return {
      id: errorId,
      stageName,
      category,
      severity,
      message,
      stack,
      context: { originalError: error },
      timestamp,
      retryable,
      suggestedAction
    };
  }

  private async handleStageError(orchestratorRunId: string, stageError: StageError): Promise<void> {
    // Store error for tracking
    const errors = this.stageErrors.get(orchestratorRunId) || [];
    errors.push(stageError);
    this.stageErrors.set(orchestratorRunId, errors);

    // Get current retry count for this stage
    const retryKey = `${orchestratorRunId}-${stageError.stageName}`;
    const currentAttempts = this.retryAttempts.get(retryKey) || 0;
    
    // Get retry policy for stage category
    const retryPolicy = this.getRetryPolicy(stageError.stageName);
    
    // Determine if we should retry
    const canRetry = stageError.retryable && currentAttempts < retryPolicy.maxAttempts;

    if (canRetry) {
      // Increment retry count
      this.retryAttempts.set(retryKey, currentAttempts + 1);
      
      // Calculate delay
      const delay = this.calculateRetryDelay(retryPolicy, currentAttempts + 1);
      
      console.warn(`Stage ${stageError.stageName} failed (attempt ${currentAttempts + 1}/${retryPolicy.maxAttempts}). Retrying in ${delay}ms...`);
      
      // Update orchestration with retry status
      await storage.updateOrchestratorRun(orchestratorRunId, {
        status: "running", // Keep running during retry
        errorMessage: `${stageError.message} (retrying in ${Math.floor(delay/1000)}s)`
      });

      this.broadcastUpdate(orchestratorRunId, "retrying", 0, `Retrying ${stageError.stageName}: ${stageError.message}`);

      // Wait and retry with proper error handling
      setTimeout(async () => {
        try {
          await this.retryStage(orchestratorRunId, stageError.stageName);
          
          // Clear retry attempts after successful completion
          const retryKey = `${orchestratorRunId}-${stageError.stageName}`;
          this.retryAttempts.delete(retryKey);
          
        } catch (retryError) {
          console.error(`Retry failed for stage ${stageError.stageName}:`, retryError);
          const newStageError = this.categorizeError(retryError, stageError.stageName);
          await this.handleStageError(orchestratorRunId, newStageError);
        }
      }, delay);
    } else {
      // No more retries, mark as failed
      console.error(`Stage ${stageError.stageName} failed permanently:`, stageError.message);
      
      await storage.updateOrchestratorRun(orchestratorRunId, {
        status: "error",
        errorMessage: `${stageError.stageName}: ${stageError.message}${stageError.suggestedAction ? ` - ${stageError.suggestedAction}` : ''}`
      });

      // Update existing stage run record with failure details
      const existingStageRuns = await storage.getStageRuns(orchestratorRunId);
      const runningStageRun = existingStageRuns.find(run => 
        run.stageName === stageError.stageName && run.status === "running"
      );
      
      if (runningStageRun) {
        await storage.updateStageRun(runningStageRun.id, {
          status: "error",
          errorMessage: stageError.message,
          attempts: currentAttempts + 1,
          completedAt: new Date()
        });
      } else {
        // Fallback: create new stage run if no running one found
        await storage.createStageRun({
          orchestratorRunId,
          stageName: stageError.stageName,
          status: "error",
          input: {},
          output: {},
          errorMessage: stageError.message,
          attempts: currentAttempts + 1
        });
      }

      this.broadcastUpdate(orchestratorRunId, "error", 0, `${stageError.stageName} failed: ${stageError.message}`);
    }
  }

  private getRetryPolicy(stageName: string): RetryPolicy {
    // Explicit stage → policy mapping
    const STAGE_POLICY_MAPPING: Record<string, keyof typeof DEFAULT_RETRY_POLICIES> = {
      'planning': 'ai_generation',      // AI circuit design generation
      'building': 'ai_generation',      // AI schematic generation + database operations
      'validation': 'validation',       // Circuit validation logic
      'export': 'export'               // File export operations
    };
    
    const stageLower = stageName.toLowerCase();
    const policyCategory = STAGE_POLICY_MAPPING[stageLower];
    
    if (policyCategory && DEFAULT_RETRY_POLICIES[policyCategory]) {
      return DEFAULT_RETRY_POLICIES[policyCategory];
    }
    
    // Safe default retry policy for unknown stages
    return {
      maxAttempts: 2,
      backoffStrategy: 'exponential',
      baseDelay: 1000,
      maxDelay: 10000,
      jitter: true
    };
  }

  private calculateRetryDelay(policy: RetryPolicy, attempt: number): number {
    let delay: number;
    
    switch (policy.backoffStrategy) {
      case 'linear':
        delay = policy.baseDelay * attempt;
        break;
      case 'exponential':
        delay = policy.baseDelay * Math.pow(2, attempt - 1);
        break;
      case 'fixed':
      default:
        delay = policy.baseDelay;
        break;
    }
    
    // Apply max delay if specified
    if (policy.maxDelay) {
      delay = Math.min(delay, policy.maxDelay);
    }
    
    // Add jitter if enabled
    if (policy.jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      delay += (Math.random() - 0.5) * 2 * jitterAmount;
    }
    
    return Math.max(delay, 0);
  }

  private async retryStage(orchestratorRunId: string, stageName: string): Promise<void> {
    console.log(`Retrying stage: ${stageName}`);
    
    // Execute the specific stage that failed
    await this.executeStageByName(orchestratorRunId, stageName);
    
    // After successful retry, continue with remaining stages
    await this.resumeFromStage(orchestratorRunId, stageName);
  }

  private async executeStageByName(orchestratorRunId: string, stageName: string): Promise<void> {
    // Map stage names to their execution methods
    switch (stageName.toLowerCase()) {
      case 'planning':
        await this.executePlanningStage(orchestratorRunId);
        break;
      case 'building':
        await this.executeBuildingStage(orchestratorRunId);
        break;
      case 'validation':
        await this.executeValidationStage(orchestratorRunId);
        break;
      case 'export':
        await this.executeExportStage(orchestratorRunId);
        break;
      default:
        throw new Error(`Unknown stage: ${stageName}`);
    }
  }

  private async resumeFromStage(orchestratorRunId: string, completedStageName: string): Promise<void> {
    console.log(`Resuming pipeline from stage: ${completedStageName}`);
    
    // Define stage execution order
    const STAGE_ORDER = ['planning', 'building', 'validation', 'export'];
    const currentStageIndex = STAGE_ORDER.indexOf(completedStageName.toLowerCase());
    
    if (currentStageIndex === -1) {
      throw new Error(`Unknown stage in pipeline: ${completedStageName}`);
    }
    
    // Execute remaining stages in order
    for (let i = currentStageIndex + 1; i < STAGE_ORDER.length; i++) {
      const nextStageName = STAGE_ORDER[i];
      console.log(`Continuing to stage: ${nextStageName}`);
      
      try {
        await this.executeStageByName(orchestratorRunId, nextStageName);
      } catch (error) {
        // If any subsequent stage fails, handle it through normal error handling
        const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
        const stageError = this.categorizeError(error, nextStageName);
        await this.handleStageError(orchestratorRunId, stageError);
        return; // Stop pipeline execution on error
      }
    }
    
    // All stages completed successfully
    await storage.updateOrchestratorRun(orchestratorRunId, {
      status: "completed",
      progress: 100,
      completedAt: new Date()
    });
    
    this.broadcastUpdate(orchestratorRunId, "completed", 100, "Pipeline completed successfully after recovery");
  }

  // Recovery and diagnostics methods
  
  async getStageErrors(orchestratorRunId: string): Promise<StageError[]> {
    return this.stageErrors.get(orchestratorRunId) || [];
  }

  async clearStageErrors(orchestratorRunId: string): Promise<void> {
    this.stageErrors.delete(orchestratorRunId);
    
    // Clear retry attempts for this orchestration
    const keysToDelete = Array.from(this.retryAttempts.keys()).filter(key => 
      key.startsWith(orchestratorRunId)
    );
    keysToDelete.forEach(key => this.retryAttempts.delete(key));
  }

  async generateErrorReport(orchestratorRunId: string): Promise<{
    totalErrors: number;
    errorsByStage: Record<string, number>;
    criticalErrors: StageError[];
    recoveryRecommendations: string[];
  }> {
    const errors = await this.getStageErrors(orchestratorRunId);
    
    const errorsByStage = errors.reduce((acc, error) => {
      acc[error.stageName] = (acc[error.stageName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const criticalErrors = errors.filter(e => e.severity === 'critical');
    
    const recoveryRecommendations = Array.from(new Set(
      errors
        .filter(e => e.suggestedAction)
        .map(e => e.suggestedAction!)
    ));
    
    return {
      totalErrors: errors.length,
      errorsByStage,
      criticalErrors,
      recoveryRecommendations
    };
  }

  private async broadcastUpdate(orchestratorRunId: string, status: string, progress: number, message?: string) {
    try {
      // Get latest orchestration run for complete status
      const orchestratorRun = await storage.getOrchestratorRun(orchestratorRunId);
      if (!orchestratorRun) return;
      
      // Get stage runs for complete context
      const stageRuns = await storage.getStageRuns(orchestratorRunId);
      
      const update = {
        type: "orchestration_progress",
        projectId: orchestratorRun.projectId,
        id: orchestratorRunId,
        status: orchestratorRun.status,
        currentStage: orchestratorRun.currentStage,
        progress: orchestratorRun.progress,
        context: orchestratorRun.context,
        stageRuns,
        message,
        timestamp: new Date().toISOString()
      };

      // Broadcast to all connected WebSocket clients
      this.wsConnections.forEach((ws) => {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(JSON.stringify(update));
        }
      });
    } catch (error) {
      console.error('Failed to broadcast update:', error);
    }
  }

  addWebSocketConnection(id: string, ws: any) {
    this.wsConnections.set(id, ws);
  }

  removeWebSocketConnection(id: string) {
    this.wsConnections.delete(id);
  }
}

export const orchestrationEngine = new OrchestrationEngine();
