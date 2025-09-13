import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").default("draft").notNull(), // draft, active, completed, archived
  canvasData: jsonb("canvas_data").default({}),
  llmBudget: integer("llm_budget").default(1000).notNull(),
  llmSpent: integer("llm_spent").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const components = pgTable("components", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  mpn: text("mpn").notNull().unique(), // Manufacturer Part Number
  manufacturer: text("manufacturer").notNull(),
  category: text("category").notNull(), // microcontroller, sensor, communication, etc.
  name: text("name").notNull(),
  description: text("description"),
  footprint: text("footprint"),
  specifications: jsonb("specifications").default({}),
  pricing: jsonb("pricing").default({}), // { price: number, currency: string, supplier: string }
  datasheet: text("datasheet"),
  symbol: text("symbol"), // SVG or symbol reference
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectModules = pgTable("project_modules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  componentId: uuid("component_id").notNull().references(() => components.id),
  nodeId: text("node_id").notNull(), // React Flow node ID
  label: text("label").notNull(),
  position: jsonb("position").notNull(), // { x: number, y: number }
  configuration: jsonb("configuration").default({}),
  firmwareCode: text("firmware_code"),
  testingCode: text("testing_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectConnections = pgTable("project_connections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  fromModuleId: uuid("from_module_id").notNull().references(() => projectModules.id, { onDelete: "cascade" }),
  toModuleId: uuid("to_module_id").notNull().references(() => projectModules.id, { onDelete: "cascade" }),
  fromPort: text("from_port").notNull(),
  toPort: text("to_port").notNull(),
  connectionType: text("connection_type").notNull(), // power, data, analog, digital
  edgeId: text("edge_id").notNull(), // React Flow edge ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orchestratorRuns = pgTable("orchestrator_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // idle, running, paused, completed, error, cancelled
  currentStage: text("current_stage"), // planning, building, validation, export
  progress: integer("progress").default(0).notNull(), // 0-100
  context: jsonb("context").default({}),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const stageRuns = pgTable("stage_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orchestratorRunId: uuid("orchestrator_run_id").notNull().references(() => orchestratorRuns.id, { onDelete: "cascade" }),
  stageName: text("stage_name").notNull(),
  status: text("status").notNull(), // pending, running, completed, error, skipped
  input: jsonb("input").default({}),
  output: jsonb("output").default({}),
  errorMessage: text("error_message"),
  attempts: integer("attempts").default(0).notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const bomItems = pgTable("bom_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  componentId: uuid("component_id").notNull().references(() => components.id),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price"), // in cents
  supplier: text("supplier"),
  availability: text("availability"), // in_stock, low_stock, out_of_stock, discontinued
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  action: text("action").notNull(), // create, update, delete, orchestration_start, etc.
  entityType: text("entity_type").notNull(), // project, module, connection, etc.
  entityId: text("entity_id"),
  changes: jsonb("changes").default({}),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  auditLogs: many(auditLogs),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  modules: many(projectModules),
  connections: many(projectConnections),
  orchestratorRuns: many(orchestratorRuns),
  bomItems: many(bomItems),
  auditLogs: many(auditLogs),
}));

export const componentsRelations = relations(components, ({ many }) => ({
  projectModules: many(projectModules),
  bomItems: many(bomItems),
}));

export const projectModulesRelations = relations(projectModules, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectModules.projectId],
    references: [projects.id],
  }),
  component: one(components, {
    fields: [projectModules.componentId],
    references: [components.id],
  }),
  fromConnections: many(projectConnections, { relationName: "fromModule" }),
  toConnections: many(projectConnections, { relationName: "toModule" }),
}));

export const projectConnectionsRelations = relations(projectConnections, ({ one }) => ({
  project: one(projects, {
    fields: [projectConnections.projectId],
    references: [projects.id],
  }),
  fromModule: one(projectModules, {
    fields: [projectConnections.fromModuleId],
    references: [projectModules.id],
    relationName: "fromModule",
  }),
  toModule: one(projectModules, {
    fields: [projectConnections.toModuleId],
    references: [projectModules.id],
    relationName: "toModule",
  }),
}));

export const orchestratorRunsRelations = relations(orchestratorRuns, ({ one, many }) => ({
  project: one(projects, {
    fields: [orchestratorRuns.projectId],
    references: [projects.id],
  }),
  stageRuns: many(stageRuns),
}));

export const stageRunsRelations = relations(stageRuns, ({ one }) => ({
  orchestratorRun: one(orchestratorRuns, {
    fields: [stageRuns.orchestratorRunId],
    references: [orchestratorRuns.id],
  }),
}));

export const bomItemsRelations = relations(bomItems, ({ one }) => ({
  project: one(projects, {
    fields: [bomItems.projectId],
    references: [projects.id],
  }),
  component: one(components, {
    fields: [bomItems.componentId],
    references: [components.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  project: one(projects, {
    fields: [auditLogs.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
});

export const insertProjectSchema = createInsertSchema(projects).pick({
  title: true,
  description: true,
  userId: true,
});

export const insertComponentSchema = createInsertSchema(components).pick({
  mpn: true,
  manufacturer: true,
  category: true,
  name: true,
  description: true,
  footprint: true,
  specifications: true,
  pricing: true,
  datasheet: true,
  symbol: true,
});

export const insertProjectModuleSchema = createInsertSchema(projectModules).pick({
  projectId: true,
  componentId: true,
  nodeId: true,
  label: true,
  position: true,
  configuration: true,
  firmwareCode: true,
  testingCode: true,
});

export const insertProjectConnectionSchema = createInsertSchema(projectConnections).pick({
  projectId: true,
  fromModuleId: true,
  toModuleId: true,
  fromPort: true,
  toPort: true,
  connectionType: true,
  edgeId: true,
});

export const insertOrchestratorRunSchema = createInsertSchema(orchestratorRuns).pick({
  projectId: true,
  status: true,
  currentStage: true,
  progress: true,
  context: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertComponent = z.infer<typeof insertComponentSchema>;
export type Component = typeof components.$inferSelect;
export type InsertProjectModule = z.infer<typeof insertProjectModuleSchema>;
export type ProjectModule = typeof projectModules.$inferSelect;
export type InsertProjectConnection = z.infer<typeof insertProjectConnectionSchema>;
export type ProjectConnection = typeof projectConnections.$inferSelect;
export type InsertOrchestratorRun = z.infer<typeof insertOrchestratorRunSchema>;
export type OrchestratorRun = typeof orchestratorRuns.$inferSelect;
export type StageRun = typeof stageRuns.$inferSelect;
export type BomItem = typeof bomItems.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
