import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useToast } from '@/hooks/use-toast';
import type { OrchestrationStatus, OrchestrationStage } from '@/types/project';

interface OrchestrationState {
  status: OrchestrationStatus | null;
  isLoading: boolean;
  error: string | null;
  stages: OrchestrationStage[];
  logs: OrchestrationLog[];
  isWebSocketConnected: boolean;
  lastUpdate: number;
}

interface OrchestrationLog {
  id: string;
  stage: string;
  message: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
}

interface OrchestrationActions {
  startOrchestration: (userBrief: string) => Promise<void>;
  startPipelineExecution: (templateId: string, projectConfig?: Record<string, any>) => Promise<void>;
  controlOrchestration: (action: 'pause' | 'resume' | 'cancel') => Promise<void>;
  retry: () => void;
  clearError: () => void;
}

type OrchestrationAction = 
  | { type: 'SET_STATUS'; payload: OrchestrationStatus }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'ADD_LOG'; payload: OrchestrationLog }
  | { type: 'CLEAR_LOGS' }
  | { type: 'SET_WEBSOCKET_CONNECTED'; payload: boolean }
  | { type: 'UPDATE_LAST_UPDATE' };

const initialState: OrchestrationState = {
  status: null,
  isLoading: false,
  error: null,
  stages: [],
  logs: [],
  isWebSocketConnected: false,
  lastUpdate: Date.now(),
};

function orchestrationReducer(state: OrchestrationState, action: OrchestrationAction): OrchestrationState {
  switch (action.type) {
    case 'SET_STATUS':
      return {
        ...state,
        status: action.payload,
        stages: action.payload.stageRuns || [],
        lastUpdate: Date.now(),
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'ADD_LOG':
      return {
        ...state,
        logs: [...state.logs, action.payload].slice(-100), // Keep last 100 logs
      };
    case 'CLEAR_LOGS':
      return { ...state, logs: [] };
    case 'SET_WEBSOCKET_CONNECTED':
      return { ...state, isWebSocketConnected: action.payload };
    case 'UPDATE_LAST_UPDATE':
      return { ...state, lastUpdate: Date.now() };
    default:
      return state;
  }
}

const OrchestrationContext = createContext<{
  state: OrchestrationState;
  startPending: boolean;
  controlPending: boolean;
  actions: OrchestrationActions;
} | null>(null);

interface OrchestrationProviderProps {
  children: ReactNode;
  projectId: string;
}

export function OrchestrationProvider({ children, projectId }: OrchestrationProviderProps) {
  const [state, dispatch] = useReducer(orchestrationReducer, initialState);
  const { toast } = useToast();

  // Smart polling strategy - check WebSocket first, then adjust interval based on status
  const getDynamicRefetchInterval = () => {
    if (state.isWebSocketConnected) return false; // Disable polling when WebSocket is active
    if (!state.status) return 5000; // Initial fetch
    if (state.status.status === 'running') return 1000; // Fast updates during execution
    if (state.status.status === 'paused') return 3000; // Medium updates when paused
    return 10000; // Slow updates for idle/completed states
  };

  // Type guard for WebSocket data
  const isOrchestrationUpdate = (data: any): data is OrchestrationStatus => {
    return data && typeof data.status === 'string' && typeof data.progress === 'number';
  };

  // Orchestration status query with smart polling
  const statusQuery = useQuery<OrchestrationStatus>({
    queryKey: ["/api/projects", projectId, "orchestrator/status"],
    refetchInterval: getDynamicRefetchInterval(),
    enabled: !!projectId,
  });

  // WebSocket integration for real-time updates
  const { connectionStatus, lastMessage, sendMessage } = useWebSocket({
    reconnectAttempts: 10,
    reconnectInterval: 5000,
  });

  const isConnected = connectionStatus === 'Connected';

  // Handle query state changes
  useEffect(() => {
    if (statusQuery.data) {
      dispatch({ type: 'SET_STATUS', payload: statusQuery.data });
    }
  }, [statusQuery.data]);

  useEffect(() => {
    dispatch({ type: 'SET_LOADING', payload: statusQuery.isLoading });
  }, [statusQuery.isLoading]);

  useEffect(() => {
    if (statusQuery.error) {
      dispatch({ type: 'SET_ERROR', payload: (statusQuery.error as Error).message });
    }
  }, [statusQuery.error]);

  // Handle WebSocket messages with project scoping
  useEffect(() => {
    if (!lastMessage) return;

    try {
      const data = JSON.parse(lastMessage.data);
      
      // Only process messages for the current project
      if (data.type === 'orchestration_progress' && 
          data.projectId === projectId && 
          isOrchestrationUpdate(data)) {
        // Update query cache directly to avoid extra fetch
        queryClient.setQueryData(["/api/projects", projectId, "orchestrator/status"], data);
        dispatch({ type: 'SET_STATUS', payload: data });
        
        // Add log entry for status changes
        const logMessage = `Status: ${data.status}${data.currentStage ? ` (${data.currentStage})` : ''} - Progress: ${data.progress}%`;
        dispatch({
          type: 'ADD_LOG',
          payload: {
            id: `${Date.now()}-${Math.random()}`,
            stage: data.currentStage || 'system',
            message: logMessage,
            timestamp: new Date().toISOString(),
            level: data.status === 'error' ? 'error' : 'info',
          },
        });
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }, [lastMessage, projectId]);

  // Handle WebSocket connection status
  useEffect(() => {
    dispatch({ type: 'SET_WEBSOCKET_CONNECTED', payload: isConnected });
    
    if (isConnected) {
      toast({
        title: "Connected",
        description: "Real-time updates enabled",
      });
    }
  }, [isConnected, toast]);

  // Mutations for orchestration control
  const startMutation = useMutation({
    mutationFn: async ({ userBrief }: { userBrief: string }) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/orchestrator/start`, {
        userBrief,
      });
      return response.json();
    },
    onSuccess: () => {
      dispatch({ type: 'CLEAR_ERROR' });
      dispatch({ type: 'CLEAR_LOGS' });
      toast({
        title: "Orchestration Started",
        description: "AI is now processing your hardware design requirements.",
      });
      statusQuery.refetch(); // Immediately refetch status
    },
    onError: (error: Error) => {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      toast({
        title: "Failed to Start Orchestration",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Pipeline execution mutation
  const pipelineExecutionMutation = useMutation({
    mutationFn: async ({ templateId, projectConfig }: { templateId: string; projectConfig?: Record<string, any> }) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/orchestrator/pipeline/start`, {
        templateId,
        projectConfig: projectConfig || {},
      });
      return response.json();
    },
    onSuccess: () => {
      dispatch({ type: 'CLEAR_ERROR' });
      dispatch({ type: 'CLEAR_LOGS' });
      toast({
        title: "Pipeline Started",
        description: "Pipeline execution has been initiated.",
      });
      statusQuery.refetch(); // Immediately refetch status
    },
    onError: (error: Error) => {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      toast({
        title: "Failed to Start Pipeline",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const controlMutation = useMutation({
    mutationFn: async ({ action, orchestratorRunId }: { action: string; orchestratorRunId: string }) => {
      const response = await apiRequest("PUT", `/api/projects/${projectId}/orchestrator/control`, {
        action,
        orchestratorRunId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      dispatch({ type: 'CLEAR_ERROR' });
      toast({
        title: "Orchestration Updated",
        description: `Successfully ${data.action}d orchestration.`,
      });
      statusQuery.refetch(); // Immediately refetch status
    },
    onError: (error: Error) => {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      toast({
        title: "Control Action Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Actions for external components
  const actions: OrchestrationActions = {
    startOrchestration: async (userBrief: string) => {
      return startMutation.mutateAsync({ userBrief });
    },
    startPipelineExecution: async (templateId: string, projectConfig?: Record<string, any>) => {
      return pipelineExecutionMutation.mutateAsync({ templateId, projectConfig });
    },
    controlOrchestration: async (action: 'pause' | 'resume' | 'cancel') => {
      if (!state.status?.id) throw new Error('No active orchestration to control');
      return controlMutation.mutateAsync({ action, orchestratorRunId: state.status.id });
    },
    retry: () => {
      dispatch({ type: 'CLEAR_ERROR' });
      statusQuery.refetch();
    },
    clearError: () => {
      dispatch({ type: 'CLEAR_ERROR' });
    },
  };

  // Initialize status on mount and handle legacy state synchronization
  useEffect(() => {
    if (statusQuery.data) {
      dispatch({ type: 'SET_STATUS', payload: statusQuery.data });
    }
    if (statusQuery.isLoading) {
      dispatch({ type: 'SET_LOADING', payload: statusQuery.isLoading });
    }
    if (statusQuery.error) {
      dispatch({ type: 'SET_ERROR', payload: (statusQuery.error as Error).message });
    }
  }, [statusQuery.data, statusQuery.isLoading, statusQuery.error]);

  return (
    <OrchestrationContext.Provider value={{ 
      state, 
      startPending: startMutation.isPending,
      controlPending: controlMutation.isPending,
      actions 
    }}>
      {children}
    </OrchestrationContext.Provider>
  );
}

export function useOrchestration() {
  const context = useContext(OrchestrationContext);
  if (!context) {
    throw new Error('useOrchestration must be used within OrchestrationProvider');
  }
  return context;
}

export type { OrchestrationState, OrchestrationActions, OrchestrationLog };