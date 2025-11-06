import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// TypeScript interfaces for jsonb fields
export interface MechanicalProperties {
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: 'mm' | 'cm' | 'inch';
  };
  mountingPoints?: Array<{
    x: number;
    y: number;
    z?: number;
    diameter: number;
    type: 'hole' | 'standoff' | 'slot';
  }>;
  material?: {
    type: string;
    density?: number;
    thermalConductivity?: number;
    color?: string;
  };
  weight?: number;
  tolerances?: {
    dimensional: number;
    angular?: number;
  };
}

export interface CADModel {
  format?: 'STEP' | 'STL' | 'OBJ' | 'FBX' | 'GLTF';
  fileUrl?: string;
  thumbnailUrl?: string;
  parametricDefinition?: {
    baseShape?: string;
    operations?: Array<any>;
    constraints?: Array<any>;
  };
  exportSettings?: {
    resolution?: 'low' | 'medium' | 'high';
    format?: string;
    units?: string;
  };
  lastModified?: string;
  version?: string;
}

export interface ParametricData {
  points?: Array<{
    id: string;
    x: number;
    y: number;
    z?: number;
    type?: 'control' | 'anchor' | 'reference';
  }>;
  curves?: Array<{
    id: string;
    type: 'line' | 'arc' | 'bezier' | 'spline';
    points: string[]; // IDs of points
    parameters?: any;
  }>;
  segments?: Array<{
    id: string;
    curveIds: string[];
    closed?: boolean;
  }>;
  features?: Array<{
    id: string;
    type: 'extrude' | 'revolve' | 'loft' | 'sweep' | 'fillet' | 'chamfer';
    parameters: any;
  }>;
}

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
  firmwareLanguage: text("firmware_language"), // cpp, c, python, verilog, vhdl
  firmwarePlatform: text("firmware_platform"), // ESP32, Arduino, STM32, RP2040, etc.
  testingCode: text("testing_code"),
  moduleType: varchar("module_type", { length: 20 }).default('electrical'), // 'electrical' | 'mechanical' | 'hybrid'
  mechanicalProperties: jsonb("mechanical_properties").$type<MechanicalProperties>(),
  cadModel: jsonb("cad_model").$type<CADModel>(),
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
  // Enhanced pipeline linkage for better integrity
  pipelineRunId: uuid("pipeline_run_id").references(() => pipelineRuns.id, { onDelete: "cascade" }),
  stageDefinitionId: uuid("stage_definition_id").references(() => stageDefinitions.id),
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

// Mechanical Components table for 3D CAD functionality
export const mechanicalComponents = pgTable("mechanical_components", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  componentType: varchar("component_type", { length: 50 }).notNull(), // 'housing' | 'bracket' | 'heatsink'
  parametricData: jsonb("parametric_data").notNull().$type<ParametricData>(),
  dimensions: jsonb("dimensions").notNull(), // {length, width, height}
  material: varchar("material", { length: 50 }),
  manufacturingMethod: varchar("manufacturing_method", { length: 20 }), // '3D_PRINT' | 'CNC'
  clearanceClass: varchar("clearance_class", { length: 20 }), // 'LOOSE' | 'NORMAL' | 'CLOSE'
  thermalRating: integer("thermal_rating"), // watts
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Collaboration Tables
export const userPresence = pgTable("user_presence", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"), // active, away, editing
  cursorPosition: jsonb("cursor_position"), // { x: number, y: number }
  selectedNodeId: text("selected_node_id"), // Currently selected node
  connectionId: text("connection_id").notNull(), // WebSocket connection ID
  lastActivity: timestamp("last_activity").defaultNow().notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const collaborationSessions = pgTable("collaboration_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  initiatorUserId: uuid("initiator_user_id").notNull().references(() => users.id),
  sessionMode: text("session_mode").notNull().default("live"), // live, review, presentation
  isActive: boolean("is_active").notNull().default(true),
  settings: jsonb("settings").default({}), // { allowEditing: boolean, showCursors: boolean }
  createdAt: timestamp("created_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
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
  pipelineRun: one(pipelineRuns, {
    fields: [stageRuns.pipelineRunId],
    references: [pipelineRuns.id],
  }),
  stageDefinition: one(stageDefinitions, {
    fields: [stageRuns.stageDefinitionId],
    references: [stageDefinitions.id],
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

export const mechanicalComponentsRelations = relations(mechanicalComponents, ({ one }) => ({
  project: one(projects, {
    fields: [mechanicalComponents.projectId],
    references: [projects.id],
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
  moduleType: true,
  mechanicalProperties: true,
  cadModel: true,
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

// Enhanced modular pipeline schemas
export const pipelineTemplates = pgTable("pipeline_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // hardware_design, firmware_dev, validation, custom
  version: text("version").default("1.0.0").notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  userId: uuid("user_id").references(() => users.id),
  metadata: jsonb("metadata").default({}), // tags, difficulty, estimated_time, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const stageDefinitions = pgTable("stage_definitions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: uuid("template_id").notNull().references(() => pipelineTemplates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // ai_generation, validation, export, user_input
  order: integer("order").notNull(),
  isOptional: boolean("is_optional").default(false).notNull(),
  isParallel: boolean("is_parallel").default(false).notNull(),
  estimatedDuration: integer("estimated_duration"), // in seconds
  dependencies: text("dependencies").array().default([]), // stage names this depends on
  configuration: jsonb("configuration").default({}), // stage-specific config
  inputSchema: jsonb("input_schema").default({}), // JSON schema for expected inputs
  outputSchema: jsonb("output_schema").default({}), // JSON schema for expected outputs
  retryPolicy: jsonb("retry_policy").default({}), // max_attempts, backoff_strategy
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Ensure unique stage names within each template
  uniqueTemplateName: sql`UNIQUE(${table.templateId}, ${table.name})`,
  // Ensure unique stage order within each template  
  uniqueTemplateOrder: sql`UNIQUE(${table.templateId}, ${table.order})`,
}));

export const pipelineRuns = pgTable("pipeline_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orchestratorRunId: uuid("orchestrator_run_id").notNull().references(() => orchestratorRuns.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").notNull().references(() => pipelineTemplates.id),
  status: text("status").notNull(), // pending, running, paused, completed, error, cancelled
  currentStageOrder: integer("current_stage_order").default(0),
  parallelStages: text("parallel_stages").array().default([]), // stages running in parallel
  configuration: jsonb("configuration").default({}), // runtime pipeline config
  metrics: jsonb("metrics").default({}), // execution metrics
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Enhanced pipeline relations
export const pipelineTemplatesRelations = relations(pipelineTemplates, ({ one, many }) => ({
  user: one(users, {
    fields: [pipelineTemplates.userId],
    references: [users.id],
  }),
  stageDefinitions: many(stageDefinitions),
  pipelineRuns: many(pipelineRuns),
}));

export const stageDefinitionsRelations = relations(stageDefinitions, ({ one }) => ({
  template: one(pipelineTemplates, {
    fields: [stageDefinitions.templateId],
    references: [pipelineTemplates.id],
  }),
}));

export const pipelineRunsRelations = relations(pipelineRuns, ({ one }) => ({
  orchestratorRun: one(orchestratorRuns, {
    fields: [pipelineRuns.orchestratorRunId],
    references: [orchestratorRuns.id],
  }),
  template: one(pipelineTemplates, {
    fields: [pipelineRuns.templateId],
    references: [pipelineTemplates.id],
  }),
}));

export const insertPipelineTemplateSchema = createInsertSchema(pipelineTemplates).pick({
  name: true,
  description: true,
  category: true,
  version: true,
  isPublic: true,
  userId: true,
  metadata: true,
});

export const insertStageDefinitionSchema = createInsertSchema(stageDefinitions).pick({
  templateId: true,
  name: true,
  displayName: true,
  description: true,
  category: true,
  order: true,
  isOptional: true,
  isParallel: true,
  estimatedDuration: true,
  dependencies: true,
  configuration: true,
  inputSchema: true,
  outputSchema: true,
  retryPolicy: true,
});

export const insertPipelineRunSchema = createInsertSchema(pipelineRuns).pick({
  orchestratorRunId: true,
  templateId: true,
  status: true,
  configuration: true,
});

export const insertStageRunSchema = createInsertSchema(stageRuns).pick({
  orchestratorRunId: true,
  stageName: true,
  status: true,
  input: true,
  output: true,
  errorMessage: true,
  attempts: true,
  pipelineRunId: true,
  stageDefinitionId: true,
});

export const insertMechanicalComponentSchema = createInsertSchema(mechanicalComponents).pick({
  projectId: true,
  componentType: true,
  parametricData: true,
  dimensions: true,
  material: true,
  manufacturingMethod: true,
  clearanceClass: true,
  thermalRating: true,
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
export type InsertMechanicalComponent = z.infer<typeof insertMechanicalComponentSchema>;
export type MechanicalComponent = typeof mechanicalComponents.$inferSelect;

// Enhanced pipeline types
export type InsertPipelineTemplate = z.infer<typeof insertPipelineTemplateSchema>;
export type PipelineTemplate = typeof pipelineTemplates.$inferSelect;
export type InsertStageDefinition = z.infer<typeof insertStageDefinitionSchema>;
export type StageDefinition = typeof stageDefinitions.$inferSelect;
export type InsertPipelineRun = z.infer<typeof insertPipelineRunSchema>;
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type InsertStageRun = z.infer<typeof insertStageRunSchema>;

// Extended types for frontend usage with relations
export type PipelineTemplateWithStages = PipelineTemplate & {
  stageDefinitions?: StageDefinition[];
};

// Metadata types for type safety
export type PipelineMetadata = {
  tags?: string[];
  difficulty?: "beginner" | "intermediate" | "advanced";
  estimatedTime?: number;
  description?: string;
} & Record<string, any>;

// Stage retry policy types
export type StageRetryPolicy = {
  maxAttempts?: number;
  backoffStrategy?: "linear" | "exponential";
  baseDelay?: number;
};

// Hardware Design Assistant Tables
export const hardwareDesignSessions = pgTable("hardware_design_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("draft"), // draft, initial_design, refining, modules_created, complete
  initialPrompt: text("initial_prompt"),
  initialDesign: jsonb("initial_design"), // Raw LLM response
  refinedFeedback: text("refined_feedback"),
  designSpec: jsonb("design_spec"), // Canonical JSON spec
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const masterPlans = pgTable("master_plans", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  llmModel: text("llm_model").notNull(),
  summary: text("summary"),
  steps: jsonb("steps").notNull(), // Array of MasterPlanStep
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const designModules = pgTable("design_modules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  componentName: text("component_name").notNull(),
  componentId: uuid("component_id").references(() => components.id), // Null if unmatched
  type: text("type"), // microcontroller, sensor, etc.
  voltage: integer("voltage"), // in millivolts
  maxVoltage: integer("max_voltage"),
  maxCurrent: integer("max_current"), // in milliamps
  avgPowerDraw: integer("avg_power_draw"), // in milliwatts
  wifi: boolean("wifi").default(false),
  bluetooth: boolean("bluetooth").default(false),
  firmwareLanguage: text("firmware_language"),
  softwareLanguage: text("software_language"),
  computeRating: integer("compute_rating"), // 1-10 scale
  componentType: text("component_type"),
  isMotorOrServo: boolean("is_motor_or_servo").default(false),
  servoMotorProps: jsonb("servo_motor_props"), // { controlCompatibilityClass, rangeOfMotion }
  notes: text("notes"),
  position: jsonb("position"), // { x, y } for canvas
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const designPins = pgTable("design_pins", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  moduleId: uuid("module_id").notNull().references(() => designModules.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // power, ground, io, analog, pwm, communication, other
  voltage: integer("voltage"), // in millivolts
  maxVoltage: integer("max_voltage"),
  maxCurrent: integer("max_current"), // in milliamps
  notes: text("notes"),
  enabled: boolean("enabled").notNull().default(true),
  layoutIndex: integer("layout_index"), // For ordering
  connectionHints: text("connection_hints").array(), // Hints for wiring
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const designConnections = pgTable("design_connections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  fromPinId: uuid("from_pin_id").notNull().references(() => designPins.id, { onDelete: "cascade" }),
  toPinId: uuid("to_pin_id").notNull().references(() => designPins.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // power, signal, ground, bus
  netName: text("net_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations for Hardware Design tables
export const hardwareDesignSessionsRelations = relations(hardwareDesignSessions, ({ one }) => ({
  project: one(projects, {
    fields: [hardwareDesignSessions.projectId],
    references: [projects.id],
  }),
}));

export const masterPlansRelations = relations(masterPlans, ({ one }) => ({
  project: one(projects, {
    fields: [masterPlans.projectId],
    references: [projects.id],
  }),
}));

export const designModulesRelations = relations(designModules, ({ one, many }) => ({
  project: one(projects, {
    fields: [designModules.projectId],
    references: [projects.id],
  }),
  component: one(components, {
    fields: [designModules.componentId],
    references: [components.id],
  }),
  pins: many(designPins),
}));

export const designPinsRelations = relations(designPins, ({ one, many }) => ({
  module: one(designModules, {
    fields: [designPins.moduleId],
    references: [designModules.id],
  }),
  fromConnections: many(designConnections, { relationName: "fromPin" }),
  toConnections: many(designConnections, { relationName: "toPin" }),
}));

export const designConnectionsRelations = relations(designConnections, ({ one }) => ({
  project: one(projects, {
    fields: [designConnections.projectId],
    references: [projects.id],
  }),
  fromPin: one(designPins, {
    fields: [designConnections.fromPinId],
    references: [designPins.id],
    relationName: "fromPin",
  }),
  toPin: one(designPins, {
    fields: [designConnections.toPinId],
    references: [designPins.id],
    relationName: "toPin",
  }),
}));

// Insert schemas
export const insertHardwareDesignSessionSchema = createInsertSchema(hardwareDesignSessions).pick({
  projectId: true,
  status: true,
  initialPrompt: true,
  initialDesign: true,
  refinedFeedback: true,
  designSpec: true,
});

export const insertMasterPlanSchema = createInsertSchema(masterPlans).pick({
  projectId: true,
  version: true,
  llmModel: true,
  summary: true,
  steps: true,
});

export const insertDesignModuleSchema = createInsertSchema(designModules).pick({
  projectId: true,
  componentName: true,
  componentId: true,
  type: true,
  voltage: true,
  maxVoltage: true,
  maxCurrent: true,
  avgPowerDraw: true,
  wifi: true,
  bluetooth: true,
  firmwareLanguage: true,
  softwareLanguage: true,
  computeRating: true,
  componentType: true,
  isMotorOrServo: true,
  servoMotorProps: true,
  notes: true,
  position: true,
});

export const insertDesignPinSchema = createInsertSchema(designPins).pick({
  moduleId: true,
  name: true,
  type: true,
  voltage: true,
  maxVoltage: true,
  maxCurrent: true,
  notes: true,
  enabled: true,
  layoutIndex: true,
  connectionHints: true,
});

export const insertDesignConnectionSchema = createInsertSchema(designConnections).pick({
  projectId: true,
  fromPinId: true,
  toPinId: true,
  kind: true,
  netName: true,
  notes: true,
});

// Types
export type InsertHardwareDesignSession = z.infer<typeof insertHardwareDesignSessionSchema>;
export type HardwareDesignSession = typeof hardwareDesignSessions.$inferSelect;
export type InsertMasterPlan = z.infer<typeof insertMasterPlanSchema>;
export type MasterPlan = typeof masterPlans.$inferSelect;
export type InsertDesignModule = z.infer<typeof insertDesignModuleSchema>;
export type DesignModule = typeof designModules.$inferSelect;
export type InsertDesignPin = z.infer<typeof insertDesignPinSchema>;
export type DesignPin = typeof designPins.$inferSelect;
export type InsertDesignConnection = z.infer<typeof insertDesignConnectionSchema>;
export type DesignConnection = typeof designConnections.$inferSelect;

// Extended types with relations
export type DesignModuleWithPins = DesignModule & {
  pins?: DesignPin[];
  component?: Component;
};

// TypeScript-only types for application logic (not persisted)
export type PinType = "power" | "ground" | "io" | "analog" | "pwm" | "communication" | "other";

export type MasterPlanStep = {
  id: string;
  label: string;
  subsystem?: string;
  status: "todo" | "in_progress" | "done";
  dependsOn: string[];
  notes?: string;
};

export type ServoMotorProps = {
  controlCompatibilityClass?: string;
  rangeOfMotion?: string;
};
