import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { orchestrationEngine } from "./services/orchestration";
import { generateKiCadFiles, generateBOM } from "./services/eda";
import { insertProjectSchema, insertProjectModuleSchema, insertProjectConnectionSchema } from "@shared/schema";
import { randomUUID } from "crypto";

export async function registerRoutes(app: Express): Promise<Server> {
  // Mock user for demo (in real app, this would come from authentication)
  const MOCK_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

  // Projects
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getProjectsByUser(MOCK_USER_ID);
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

  app.post("/api/projects", async (req, res) => {
    try {
      const validation = insertProjectSchema.safeParse({
        ...req.body,
        userId: MOCK_USER_ID
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

  app.put("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
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

  // Health endpoints
  app.get("/api/health/live", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/health/ready", async (req, res) => {
    try {
      // Check database connectivity
      await storage.getUser("health-check");
      res.json({ 
        status: "ready", 
        services: {
          database: "healthy",
          openai: process.env.OPENAI_API_KEY ? "configured" : "missing"
        }
      });
    } catch (error) {
      res.status(503).json({ 
        status: "not ready", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  const httpServer = createServer(app);

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
