import { 
  users, 
  projects, 
  components, 
  projectModules, 
  projectConnections, 
  orchestratorRuns,
  stageRuns,
  bomItems,
  pipelineTemplates,
  stageDefinitions,
  mechanicalComponents,
  hardwareDesignSessions,
  masterPlans,
  designModules,
  designPins,
  designConnections,
  type User, 
  type InsertUser,
  type Project,
  type InsertProject,
  type Component,
  type InsertComponent,
  type ProjectModule,
  type InsertProjectModule,
  type ProjectConnection,
  type InsertProjectConnection,
  type OrchestratorRun,
  type InsertOrchestratorRun,
  type StageRun,
  type InsertStageRun,
  type BomItem,
  type PipelineTemplate,
  type StageDefinition,
  type MechanicalComponent,
  type InsertMechanicalComponent,
  type HardwareDesignSession,
  type InsertHardwareDesignSession,
  type MasterPlan,
  type InsertMasterPlan,
  type DesignModule,
  type InsertDesignModule,
  type DesignPin,
  type InsertDesignPin,
  type DesignConnection,
  type InsertDesignConnection,
  type DesignModuleWithPins
} from "@shared/schema";
import { db } from "./db";
import { eq, like, and, desc, asc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Projects
  getProject(id: string): Promise<Project | undefined>;
  getProjectsByUser(userId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Components
  getComponent(id: string): Promise<Component | undefined>;
  getAllComponents(): Promise<Component[]>;
  searchComponents(query: string, category?: string): Promise<Component[]>;
  createComponent(component: InsertComponent): Promise<Component>;

  // Project Modules
  getProjectModules(projectId: string): Promise<ProjectModule[]>;
  createProjectModule(module: InsertProjectModule): Promise<ProjectModule>;
  updateProjectModule(id: string, updates: Partial<ProjectModule>): Promise<ProjectModule>;
  deleteProjectModule(id: string): Promise<void>;

  // Project Connections
  getProjectConnections(projectId: string): Promise<ProjectConnection[]>;
  createProjectConnection(connection: InsertProjectConnection): Promise<ProjectConnection>;
  deleteProjectConnection(id: string): Promise<void>;

  // Orchestrator
  getOrchestratorRun(id: string): Promise<OrchestratorRun | undefined>;
  getLatestOrchestratorRun(projectId: string): Promise<OrchestratorRun | undefined>;
  createOrchestratorRun(run: InsertOrchestratorRun): Promise<OrchestratorRun>;
  updateOrchestratorRun(id: string, updates: Partial<OrchestratorRun>): Promise<OrchestratorRun>;
  getStageRuns(orchestratorRunId: string): Promise<StageRun[]>;
  createStageRun(run: InsertStageRun): Promise<StageRun>;
  updateStageRun(id: string, updates: Partial<StageRun>): Promise<StageRun>;

  // BOM
  getProjectBOM(projectId: string): Promise<BomItem[]>;

  // Pipeline Templates
  getPipelineTemplate(templateId: string): Promise<PipelineTemplate | undefined>;
  getStageDefinitionsByTemplate(templateId: string): Promise<StageDefinition[]>;

  // Mechanical Components
  getMechanicalComponents(projectId: string): Promise<MechanicalComponent[]>;
  getMechanicalComponent(id: string): Promise<MechanicalComponent | undefined>;
  createMechanicalComponent(component: InsertMechanicalComponent): Promise<MechanicalComponent>;
  updateMechanicalComponent(id: string, updates: Partial<MechanicalComponent>): Promise<MechanicalComponent>;
  deleteMechanicalComponent(id: string): Promise<void>;

  // Hardware Design Sessions
  getHardwareDesignSession(id: string): Promise<HardwareDesignSession | undefined>;
  getHardwareDesignSessionByProject(projectId: string): Promise<HardwareDesignSession | undefined>;
  createHardwareDesignSession(session: InsertHardwareDesignSession): Promise<HardwareDesignSession>;
  updateHardwareDesignSession(id: string, updates: Partial<HardwareDesignSession>): Promise<HardwareDesignSession>;

  // Master Plans
  getMasterPlan(id: string): Promise<MasterPlan | undefined>;
  getMasterPlanByProject(projectId: string): Promise<MasterPlan | undefined>;
  createMasterPlan(plan: InsertMasterPlan): Promise<MasterPlan>;
  updateMasterPlan(id: string, updates: Partial<MasterPlan>): Promise<MasterPlan>;

  // Design Modules
  getDesignModules(projectId: string): Promise<DesignModuleWithPins[]>;
  getDesignModule(id: string): Promise<DesignModuleWithPins | undefined>;
  createDesignModule(module: InsertDesignModule): Promise<DesignModule>;
  updateDesignModule(id: string, updates: Partial<DesignModule>): Promise<DesignModule>;
  deleteDesignModule(id: string): Promise<void>;

  // Design Pins
  getDesignPins(moduleId: string): Promise<DesignPin[]>;
  getDesignPin(id: string): Promise<DesignPin | undefined>;
  createDesignPin(pin: InsertDesignPin): Promise<DesignPin>;
  updateDesignPin(id: string, updates: Partial<DesignPin>): Promise<DesignPin>;
  deleteDesignPin(id: string): Promise<void>;

  // Design Connections
  getDesignConnections(projectId: string): Promise<DesignConnection[]>;
  getDesignConnection(id: string): Promise<DesignConnection | undefined>;
  createDesignConnection(connection: InsertDesignConnection): Promise<DesignConnection>;
  deleteDesignConnection(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private async withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        // Check if it's a connection error that we can retry
        if (attempt === retries || !this.isRetryableError(error)) {
          throw error;
        }
        
        console.warn(`Database operation failed (attempt ${attempt}/${retries}):`, error.message);
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
      }
    }
    
    throw new Error('Max retries reached');
  }
  
  private isRetryableError(error: any): boolean {
    // Check for common retryable database errors
    return error?.code === '57P01' || // terminating connection due to administrator command
           error?.code === 'ECONNRESET' ||
           error?.code === 'ECONNREFUSED' ||
           error?.message?.includes('connection') ||
           error?.message?.includes('timeout');
  }
  async getUser(id: string): Promise<User | undefined> {
    return this.withRetry(async () => {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user || undefined;
    });
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.withRetry(async () => {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user || undefined;
    });
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.withRetry(async () => {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user || undefined;
    });
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return this.withRetry(async () => {
      const [user] = await db
        .insert(users)
        .values(insertUser)
        .returning();
      return user;
    });
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.withRetry(async () => {
      const [project] = await db.select().from(projects).where(eq(projects.id, id));
      return project || undefined;
    });
  }

  async getProjectsByUser(userId: string): Promise<Project[]> {
    return this.withRetry(async () => {
      return await db
        .select()
        .from(projects)
        .where(eq(projects.userId, userId))
        .orderBy(desc(projects.updatedAt));
    });
  }

  async createProject(project: InsertProject): Promise<Project> {
    return this.withRetry(async () => {
      const [newProject] = await db
        .insert(projects)
        .values(project)
        .returning();
      return newProject;
    });
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    return this.withRetry(async () => {
      const [updatedProject] = await db
        .update(projects)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      return updatedProject;
    });
  }

  async deleteProject(id: string): Promise<void> {
    return this.withRetry(async () => {
      await db.delete(projects).where(eq(projects.id, id));
    });
  }

  async getComponent(id: string): Promise<Component | undefined> {
    return this.withRetry(async () => {
      const [component] = await db.select().from(components).where(eq(components.id, id));
      return component || undefined;
    });
  }

  async getAllComponents(): Promise<Component[]> {
    return this.withRetry(async () => {
      return await db.select().from(components).orderBy(desc(components.createdAt));
    });
  }

  async searchComponents(query: string, category?: string): Promise<Component[]> {
    return this.withRetry(async () => {
      const conditions = [
        like(components.name, `%${query}%`)
      ];
      
      if (category) {
        conditions.push(eq(components.category, category));
      }

      return await db
        .select()
        .from(components)
        .where(and(...conditions))
        .orderBy(asc(components.name));
    });
  }

  async createComponent(component: InsertComponent): Promise<Component> {
    return this.withRetry(async () => {
      const [newComponent] = await db
        .insert(components)
        .values(component)
        .returning();
      return newComponent;
    });
  }

  async getProjectModules(projectId: string): Promise<ProjectModule[]> {
    return this.withRetry(async () => {
      return await db
        .select()
        .from(projectModules)
        .where(eq(projectModules.projectId, projectId));
    });
  }

  async createProjectModule(module: InsertProjectModule): Promise<ProjectModule> {
    return this.withRetry(async () => {
      const [newModule] = await db
        .insert(projectModules)
        .values(module as any)
        .returning();
      return newModule;
    });
  }

  async updateProjectModule(id: string, updates: Partial<ProjectModule>): Promise<ProjectModule> {
    return this.withRetry(async () => {
      const [updatedModule] = await db
        .update(projectModules)
        .set(updates)
        .where(eq(projectModules.id, id))
        .returning();
      return updatedModule;
    });
  }

  async deleteProjectModule(id: string): Promise<void> {
    return this.withRetry(async () => {
      await db.delete(projectModules).where(eq(projectModules.id, id));
    });
  }

  async getProjectConnections(projectId: string): Promise<ProjectConnection[]> {
    return this.withRetry(async () => {
      return await db
        .select()
        .from(projectConnections)
        .where(eq(projectConnections.projectId, projectId));
    });
  }

  async createProjectConnection(connection: InsertProjectConnection): Promise<ProjectConnection> {
    return this.withRetry(async () => {
      const [newConnection] = await db
        .insert(projectConnections)
        .values(connection)
        .returning();
      return newConnection;
    });
  }

  async deleteProjectConnection(id: string): Promise<void> {
    return this.withRetry(async () => {
      await db.delete(projectConnections).where(eq(projectConnections.id, id));
    });
  }

  async getOrchestratorRun(id: string): Promise<OrchestratorRun | undefined> {
    return this.withRetry(async () => {
      const [run] = await db.select().from(orchestratorRuns).where(eq(orchestratorRuns.id, id));
      return run || undefined;
    });
  }

  async getLatestOrchestratorRun(projectId: string): Promise<OrchestratorRun | undefined> {
    return this.withRetry(async () => {
      const [run] = await db
        .select()
        .from(orchestratorRuns)
        .where(eq(orchestratorRuns.projectId, projectId))
        .orderBy(desc(orchestratorRuns.startedAt))
        .limit(1);
      return run || undefined;
    });
  }

  async createOrchestratorRun(run: InsertOrchestratorRun): Promise<OrchestratorRun> {
    return this.withRetry(async () => {
      const [newRun] = await db
        .insert(orchestratorRuns)
        .values(run)
        .returning();
      return newRun;
    });
  }

  async updateOrchestratorRun(id: string, updates: Partial<OrchestratorRun>): Promise<OrchestratorRun> {
    return this.withRetry(async () => {
      const [updatedRun] = await db
        .update(orchestratorRuns)
        .set(updates)
        .where(eq(orchestratorRuns.id, id))
        .returning();
      return updatedRun;
    });
  }

  async getStageRuns(orchestratorRunId: string): Promise<StageRun[]> {
    return this.withRetry(async () => {
      return await db
        .select()
        .from(stageRuns)
        .where(eq(stageRuns.orchestratorRunId, orchestratorRunId))
        .orderBy(asc(stageRuns.startedAt));
    });
  }

  async createStageRun(run: InsertStageRun): Promise<StageRun> {
    return this.withRetry(async () => {
      const [newRun] = await db
        .insert(stageRuns)
        .values(run)
        .returning();
      return newRun;
    });
  }

  async getProjectBOM(projectId: string): Promise<BomItem[]> {
    return this.withRetry(async () => {
      return await db
        .select()
        .from(bomItems)
        .where(eq(bomItems.projectId, projectId));
    });
  }

  async updateStageRun(id: string, updates: Partial<StageRun>): Promise<StageRun> {
    return this.withRetry(async () => {
      const [updatedRun] = await db
        .update(stageRuns)
        .set(updates)
        .where(eq(stageRuns.id, id))
        .returning();
      return updatedRun;
    });
  }

  async getPipelineTemplate(templateId: string): Promise<PipelineTemplate | undefined> {
    return this.withRetry(async () => {
      const [template] = await db
        .select()
        .from(pipelineTemplates)
        .where(eq(pipelineTemplates.id, templateId));
      return template || undefined;
    });
  }

  async getStageDefinitionsByTemplate(templateId: string): Promise<StageDefinition[]> {
    return this.withRetry(async () => {
      return await db
        .select()
        .from(stageDefinitions)
        .where(eq(stageDefinitions.templateId, templateId))
        .orderBy(asc(stageDefinitions.order));
    });
  }

  async getMechanicalComponents(projectId: string): Promise<MechanicalComponent[]> {
    return this.withRetry(async () => {
      return await db
        .select()
        .from(mechanicalComponents)
        .where(eq(mechanicalComponents.projectId, projectId))
        .orderBy(desc(mechanicalComponents.createdAt));
    });
  }

  async getMechanicalComponent(id: string): Promise<MechanicalComponent | undefined> {
    return this.withRetry(async () => {
      const [component] = await db
        .select()
        .from(mechanicalComponents)
        .where(eq(mechanicalComponents.id, id));
      return component || undefined;
    });
  }

  async createMechanicalComponent(component: InsertMechanicalComponent): Promise<MechanicalComponent> {
    return this.withRetry(async () => {
      const [newComponent] = await db
        .insert(mechanicalComponents)
        .values(component as any)
        .returning();
      return newComponent;
    });
  }

  async updateMechanicalComponent(id: string, updates: Partial<MechanicalComponent>): Promise<MechanicalComponent> {
    return this.withRetry(async () => {
      const [updatedComponent] = await db
        .update(mechanicalComponents)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(mechanicalComponents.id, id))
        .returning();
      return updatedComponent;
    });
  }

  async deleteMechanicalComponent(id: string): Promise<void> {
    return this.withRetry(async () => {
      await db.delete(mechanicalComponents).where(eq(mechanicalComponents.id, id));
    });
  }

  // Hardware Design Sessions
  async getHardwareDesignSession(id: string): Promise<HardwareDesignSession | undefined> {
    return this.withRetry(async () => {
      const [session] = await db
        .select()
        .from(hardwareDesignSessions)
        .where(eq(hardwareDesignSessions.id, id));
      return session || undefined;
    });
  }

  async getHardwareDesignSessionByProject(projectId: string): Promise<HardwareDesignSession | undefined> {
    return this.withRetry(async () => {
      const [session] = await db
        .select()
        .from(hardwareDesignSessions)
        .where(eq(hardwareDesignSessions.projectId, projectId))
        .orderBy(desc(hardwareDesignSessions.createdAt));
      return session || undefined;
    });
  }

  async createHardwareDesignSession(session: InsertHardwareDesignSession): Promise<HardwareDesignSession> {
    return this.withRetry(async () => {
      const [newSession] = await db
        .insert(hardwareDesignSessions)
        .values(session as any)
        .returning();
      return newSession;
    });
  }

  async updateHardwareDesignSession(id: string, updates: Partial<HardwareDesignSession>): Promise<HardwareDesignSession> {
    return this.withRetry(async () => {
      const [updatedSession] = await db
        .update(hardwareDesignSessions)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(hardwareDesignSessions.id, id))
        .returning();
      return updatedSession;
    });
  }

  // Master Plans
  async getMasterPlan(id: string): Promise<MasterPlan | undefined> {
    return this.withRetry(async () => {
      const [plan] = await db
        .select()
        .from(masterPlans)
        .where(eq(masterPlans.id, id));
      return plan || undefined;
    });
  }

  async getMasterPlanByProject(projectId: string): Promise<MasterPlan | undefined> {
    return this.withRetry(async () => {
      const [plan] = await db
        .select()
        .from(masterPlans)
        .where(eq(masterPlans.projectId, projectId))
        .orderBy(desc(masterPlans.version), desc(masterPlans.createdAt));
      return plan || undefined;
    });
  }

  async createMasterPlan(plan: InsertMasterPlan): Promise<MasterPlan> {
    return this.withRetry(async () => {
      const [newPlan] = await db
        .insert(masterPlans)
        .values(plan as any)
        .returning();
      return newPlan;
    });
  }

  async updateMasterPlan(id: string, updates: Partial<MasterPlan>): Promise<MasterPlan> {
    return this.withRetry(async () => {
      const [updatedPlan] = await db
        .update(masterPlans)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(masterPlans.id, id))
        .returning();
      return updatedPlan;
    });
  }

  // Design Modules
  async getDesignModules(projectId: string): Promise<DesignModuleWithPins[]> {
    return this.withRetry(async () => {
      const modules = await db
        .select()
        .from(designModules)
        .where(eq(designModules.projectId, projectId))
        .orderBy(asc(designModules.createdAt));

      // Fetch pins for each module
      const modulesWithPins = await Promise.all(
        modules.map(async (module) => {
          const pins = await this.getDesignPins(module.id);
          return { ...module, pins };
        })
      );

      return modulesWithPins;
    });
  }

  async getDesignModule(id: string): Promise<DesignModuleWithPins | undefined> {
    return this.withRetry(async () => {
      const [module] = await db
        .select()
        .from(designModules)
        .where(eq(designModules.id, id));
      
      if (!module) return undefined;

      const pins = await this.getDesignPins(module.id);
      return { ...module, pins };
    });
  }

  async createDesignModule(module: InsertDesignModule): Promise<DesignModule> {
    return this.withRetry(async () => {
      const [newModule] = await db
        .insert(designModules)
        .values(module as any)
        .returning();
      return newModule;
    });
  }

  async updateDesignModule(id: string, updates: Partial<DesignModule>): Promise<DesignModule> {
    return this.withRetry(async () => {
      const [updatedModule] = await db
        .update(designModules)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(designModules.id, id))
        .returning();
      return updatedModule;
    });
  }

  async deleteDesignModule(id: string): Promise<void> {
    return this.withRetry(async () => {
      // Pins will be cascade deleted
      await db.delete(designModules).where(eq(designModules.id, id));
    });
  }

  // Design Pins
  async getDesignPins(moduleId: string): Promise<DesignPin[]> {
    return this.withRetry(async () => {
      return await db
        .select()
        .from(designPins)
        .where(eq(designPins.moduleId, moduleId))
        .orderBy(asc(designPins.layoutIndex), asc(designPins.name));
    });
  }

  async getDesignPin(id: string): Promise<DesignPin | undefined> {
    return this.withRetry(async () => {
      const [pin] = await db
        .select()
        .from(designPins)
        .where(eq(designPins.id, id));
      return pin || undefined;
    });
  }

  async createDesignPin(pin: InsertDesignPin): Promise<DesignPin> {
    return this.withRetry(async () => {
      const [newPin] = await db
        .insert(designPins)
        .values(pin as any)
        .returning();
      return newPin;
    });
  }

  async updateDesignPin(id: string, updates: Partial<DesignPin>): Promise<DesignPin> {
    return this.withRetry(async () => {
      const [updatedPin] = await db
        .update(designPins)
        .set(updates)
        .where(eq(designPins.id, id))
        .returning();
      return updatedPin;
    });
  }

  async deleteDesignPin(id: string): Promise<void> {
    return this.withRetry(async () => {
      await db.delete(designPins).where(eq(designPins.id, id));
    });
  }

  // Design Connections
  async getDesignConnections(projectId: string): Promise<DesignConnection[]> {
    return this.withRetry(async () => {
      return await db
        .select()
        .from(designConnections)
        .where(eq(designConnections.projectId, projectId))
        .orderBy(asc(designConnections.createdAt));
    });
  }

  async getDesignConnection(id: string): Promise<DesignConnection | undefined> {
    return this.withRetry(async () => {
      const [connection] = await db
        .select()
        .from(designConnections)
        .where(eq(designConnections.id, id));
      return connection || undefined;
    });
  }

  async createDesignConnection(connection: InsertDesignConnection): Promise<DesignConnection> {
    return this.withRetry(async () => {
      const [newConnection] = await db
        .insert(designConnections)
        .values(connection as any)
        .returning();
      return newConnection;
    });
  }

  async deleteDesignConnection(id: string): Promise<void> {
    return this.withRetry(async () => {
      await db.delete(designConnections).where(eq(designConnections.id, id));
    });
  }
}

export const storage = new DatabaseStorage();
