import type { Project, ProjectModule, ProjectConnection, OrchestratorRun, Component } from "@shared/schema";

export interface ProjectWithModules extends Project {
  modules?: (ProjectModule & { component?: Component })[];
  connections?: ProjectConnection[];
  orchestratorRun?: OrchestratorRun;
}

export interface ComponentPort {
  id: string;
  label: string;
  type: 'power' | 'data' | 'analog' | 'digital';
  direction: 'input' | 'output';
}

export interface CanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    category: string;
    status?: 'validated' | 'error' | 'processing';
    ports: ComponentPort[];
    moduleId: string;
    componentId: string;
    configuration?: Record<string, any>;
  };
}

export interface CollaborationCursor {
  userId: string;
  username: string;
  position: { x: number; y: number };
  color: string;
}

export interface OrchestrationStage {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  progress: number;
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WebSocketMessage {
  type: 'canvas_update' | 'user_presence' | 'cursor_position' | 'orchestration_progress';
  action?: string;
  data: any;
  projectId?: string;
  userId?: string;
  timestamp?: string;
}
