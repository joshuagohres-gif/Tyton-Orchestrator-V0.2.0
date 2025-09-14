import { 
  users, 
  projects, 
  components, 
  projectModules, 
  projectConnections, 
  orchestratorRuns,
  stageRuns,
  bomItems,
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
  type BomItem
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

  // BOM
  getProjectBOM(projectId: string): Promise<BomItem[]>;
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
        .values(module)
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

  async getProjectBOM(projectId: string): Promise<BomItem[]> {
    return this.withRetry(async () => {
      return await db
        .select()
        .from(bomItems)
        .where(eq(bomItems.projectId, projectId));
    });
  }
}

export const storage = new DatabaseStorage();
