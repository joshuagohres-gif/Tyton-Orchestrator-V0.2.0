# Tyton Orchestrator V0.2.0 - Full Stack Architecture Documentation

## System Overview

Tyton Orchestrator is a comprehensive hardware design automation platform that combines AI-powered design generation, CAD/EDA tools, and visual pipeline orchestration to streamline the hardware development lifecycle from concept to manufacturing-ready designs.

## Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer - React SPA"
        UI[React UI Components]
        Router[Wouter Router]
        Query[TanStack Query]
        WS_Client[WebSocket Client]
        3D[Three.js 3D Viewer]
        Canvas[Design Canvas]
        Pipeline[Pipeline Builder]

        UI --> Router
        UI --> Query
        UI --> WS_Client
        UI --> 3D
        UI --> Canvas
        UI --> Pipeline
    end

    subgraph "API Gateway - Express Server"
        Express[Express.js Server]
        REST[RESTful Endpoints]
        WSServer[WebSocket Server]
        Auth[Authentication<br/>*Currently Mock*]
        Session[Session Management]

        Express --> REST
        Express --> WSServer
        Express --> Auth
        Express --> Session
    end

    subgraph "Service Layer"
        OrchEngine[Orchestration Engine]
        AIService[OpenAI Service]
        CADService[CAD Generator]
        EDAService[EDA Service]
        Storage[Storage Service]

        OrchEngine --> AIService
        OrchEngine --> CADService
        OrchEngine --> EDAService
        OrchEngine --> Storage
    end

    subgraph "Data Layer"
        PostgreSQL[(PostgreSQL<br/>via Neon)]
        FileSystem[File System<br/>CAD/EDA Files]
        Cache[In-Memory Cache]

        Storage --> PostgreSQL
        CADService --> FileSystem
        EDAService --> FileSystem
        Storage --> Cache
    end

    subgraph "External Services"
        OpenAI[OpenAI API<br/>GPT-4]
        Suppliers[Component Suppliers<br/>*Future Integration*]
        CDN[Static Assets<br/>Images/Models]
    end

    Query --> REST
    WS_Client --> WSServer
    REST --> OrchEngine
    WSServer --> OrchEngine
    AIService --> OpenAI
    EDAService --> Suppliers
    UI --> CDN

    classDef client fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef server fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef service fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef data fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef external fill:#ffebee,stroke:#b71c1c,stroke-width:2px

    class UI,Router,Query,WS_Client,3D,Canvas,Pipeline client
    class Express,REST,WSServer,Auth,Session server
    class OrchEngine,AIService,CADService,EDAService,Storage service
    class PostgreSQL,FileSystem,Cache data
    class OpenAI,Suppliers,CDN external
```

## Component Architecture

### Frontend Architecture

```mermaid
graph LR
    subgraph "React Application Structure"
        App[App.tsx<br/>Root Component]

        subgraph "Pages"
            Home[Home Page]
            Project[Project Page]
            PipelineManager[Pipeline Manager]
        end

        subgraph "Core Components"
            AppHeader[App Header]
            DesignCanvas[Design Canvas]
            ComponentLibrary[Component Library]
            PropertiesPanel[Properties Panel]
            OrchestrationPanel[Orchestration Panel]
        end

        subgraph "Visualization"
            CADViewer[CAD Viewer]
            PipelineViz[Pipeline Visualization]
            PipelineBuilder[Pipeline Builder]
            NodeGraph[Node Graph Editor]
        end

        subgraph "UI Library"
            ShadcnUI[shadcn/ui Components]
            Dialogs[Dialogs & Modals]
            Forms[Form Components]
            DataDisplay[Data Display]
        end

        App --> Pages
        Pages --> CoreComponents
        Pages --> Visualization
        CoreComponents --> UILibrary
        Visualization --> UILibrary
    end

    subgraph "State Management"
        QueryClient[Query Client]
        LocalState[Component State]
        WSState[WebSocket State]
        FormState[Form State<br/>React Hook Form]
    end

    subgraph "Services"
        API[API Client]
        WSClient[WebSocket Client]
        FileHandler[File Handler]
    end

    Pages --> State Management
    CoreComponents --> Services
```

### Backend Service Architecture

```mermaid
graph TD
    subgraph "API Layer"
        Routes[routes.ts]
        Middleware[Middleware]
        ErrorHandler[Error Handler]

        Routes --> Middleware
        Middleware --> ErrorHandler
    end

    subgraph "Business Logic"
        ProjectMgmt[Project Management]
        ComponentMgmt[Component Management]
        PipelineMgmt[Pipeline Management]
        OrchestrationCtrl[Orchestration Controller]

        Routes --> ProjectMgmt
        Routes --> ComponentMgmt
        Routes --> PipelineMgmt
        Routes --> OrchestrationCtrl
    end

    subgraph "Service Layer Details"
        subgraph "AI Service"
            DesignGen[Design Generator]
            CircuitGen[Circuit Generator]
            FirmwareGen[Firmware Generator]
            Validation[AI Validation]
        end

        subgraph "CAD Service"
            ParamModel[Parametric Modeling]
            MfgValid[Manufacturing Validation]
            STLExport[STL Export]
            STEPExport[STEP Export]
        end

        subgraph "EDA Service"
            SchematicGen[Schematic Generation]
            KiCadExport[KiCad Export]
            BOMGen[BOM Generation]
            NetlistGen[Netlist Generation]
        end

        subgraph "Orchestration"
            PipelineExec[Pipeline Executor]
            StageRunner[Stage Runner]
            DepResolver[Dependency Resolver]
            RetryMgr[Retry Manager]
            ProgressTracker[Progress Tracker]
        end
    end

    ProjectMgmt --> AI Service
    ComponentMgmt --> CAD Service
    PipelineMgmt --> Orchestration
    OrchestrationCtrl --> Orchestration

    Orchestration --> AI Service
    Orchestration --> CAD Service
    Orchestration --> EDA Service
```

## Data Flow Architecture

```mermaid
sequenceDiagram
    participant User
    participant UI as React UI
    participant API as Express API
    participant Orch as Orchestration Engine
    participant AI as OpenAI Service
    participant CAD as CAD Service
    participant DB as PostgreSQL
    participant WS as WebSocket

    User->>UI: Create Project
    UI->>API: POST /api/projects
    API->>DB: Insert Project
    API-->>UI: Project Created

    User->>UI: Start Design Pipeline
    UI->>API: POST /api/orchestrator/start
    API->>Orch: Initialize Pipeline
    Orch->>DB: Create Orchestrator Run

    par Parallel Execution
        Orch->>AI: Generate Design
        AI->>OpenAI: API Call
        OpenAI-->>AI: Design Response
        AI-->>Orch: Design Complete
    and
        Orch->>WS: Progress Update
        WS-->>UI: Real-time Status
    end

    Orch->>CAD: Generate CAD Model
    CAD->>CAD: Parametric Modeling
    CAD->>CAD: Validate Manufacturing
    CAD-->>Orch: CAD Complete

    Orch->>DB: Update Run Status
    Orch->>WS: Pipeline Complete
    WS-->>UI: Final Status
    UI->>User: Display Results
```

## Database Schema Architecture

```mermaid
erDiagram
    USERS ||--o{ PROJECTS : creates
    USERS ||--o{ PIPELINE_TEMPLATES : creates
    PROJECTS ||--o{ PROJECT_MODULES : contains
    PROJECTS ||--o{ PROJECT_CONNECTIONS : has
    PROJECTS ||--o{ ORCHESTRATOR_RUNS : executes
    PROJECTS ||--o{ BOM_ITEMS : generates

    COMPONENTS ||--o{ PROJECT_MODULES : uses
    COMPONENTS ||--o{ BOM_ITEMS : includes

    PIPELINE_TEMPLATES ||--o{ STAGE_DEFINITIONS : defines
    PIPELINE_TEMPLATES ||--o{ ORCHESTRATOR_RUNS : uses

    ORCHESTRATOR_RUNS ||--o{ STAGE_RUNS : contains
    STAGE_DEFINITIONS ||--o{ STAGE_RUNS : executes

    MECHANICAL_COMPONENTS ||--o{ PROJECT_MODULES : references

    USERS {
        uuid id PK
        text username UK
        text email UK
        text password
        timestamp created_at
    }

    PROJECTS {
        uuid id PK
        text title
        text description
        uuid user_id FK
        text status
        jsonb canvas_data
        integer llm_budget
        integer llm_spent
        timestamp created_at
        timestamp updated_at
    }

    COMPONENTS {
        uuid id PK
        text name
        text category
        text manufacturer
        text part_number
        jsonb specifications
        jsonb pin_configuration
        text datasheet_url
        decimal price
        integer stock_level
        timestamp created_at
    }

    PROJECT_MODULES {
        uuid id PK
        uuid project_id FK
        uuid component_id FK
        text custom_name
        jsonb position
        jsonb configuration
        jsonb ai_suggestions
        timestamp created_at
    }

    PROJECT_CONNECTIONS {
        uuid id PK
        uuid project_id FK
        uuid source_module_id FK
        uuid target_module_id FK
        text source_pin
        text target_pin
        text connection_type
        jsonb routing_path
        timestamp created_at
    }

    ORCHESTRATOR_RUNS {
        uuid id PK
        uuid project_id FK
        uuid template_id FK
        text status
        jsonb configuration
        jsonb result_data
        text error_message
        integer total_stages
        integer completed_stages
        integer llm_tokens_used
        timestamp started_at
        timestamp completed_at
    }

    PIPELINE_TEMPLATES {
        uuid id PK
        text name
        text description
        text category
        text version
        boolean is_public
        uuid user_id FK
        jsonb metadata
        timestamp created_at
        timestamp updated_at
    }

    STAGE_DEFINITIONS {
        uuid id PK
        uuid template_id FK
        text name
        text display_name
        text description
        text category
        integer order
        boolean is_optional
        boolean is_parallel
        integer estimated_duration
        jsonb dependencies
        jsonb configuration
        jsonb input_schema
        jsonb output_schema
        jsonb retry_policy
        timestamp created_at
    }

    MECHANICAL_COMPONENTS {
        uuid id PK
        text name
        text category
        text manufacturer
        text part_number
        jsonb mechanical_properties
        jsonb cad_model
        jsonb parametric_data
        text material
        decimal weight
        decimal cost
        text supplier_url
        timestamp created_at
        timestamp updated_at
    }
```

## Pipeline Orchestration Logic

```mermaid
stateDiagram-v2
    [*] --> Initialized: Create Pipeline

    Initialized --> Validating: Start Execution
    Validating --> Running: Validation Success
    Validating --> Failed: Validation Failed

    Running --> StageExecution: Process Stages

    state StageExecution {
        [*] --> Pending
        Pending --> CheckDependencies
        CheckDependencies --> Ready: Dependencies Met
        CheckDependencies --> Waiting: Dependencies Not Met
        Waiting --> CheckDependencies: Retry

        Ready --> Executing: Start Stage
        Executing --> Success: Complete
        Executing --> Retry: Failure
        Retry --> Executing: Retry Attempt
        Retry --> StageError: Max Retries

        Success --> [*]
        StageError --> [*]
    }

    StageExecution --> Running: More Stages
    StageExecution --> Completed: All Stages Done
    StageExecution --> PartiallyCompleted: Some Stages Failed

    Running --> Paused: User Pause
    Paused --> Running: User Resume
    Running --> Cancelled: User Cancel

    Completed --> [*]
    PartiallyCompleted --> [*]
    Failed --> [*]
    Cancelled --> [*]
```

## CAD Generation Algorithm

```mermaid
flowchart TD
    Start([Start CAD Generation])

    Start --> Input[Receive Parameters]
    Input --> ValidateParams{Validate<br/>Parameters?}

    ValidateParams -->|Invalid| Error1[Return Error]
    ValidateParams -->|Valid| SelectType{Component<br/>Type?}

    SelectType -->|Box| BoxGen[Generate Box Geometry]
    SelectType -->|Cylinder| CylGen[Generate Cylinder]
    SelectType -->|Housing| HouseGen[Generate Housing]
    SelectType -->|Heatsink| HeatGen[Generate Heatsink]
    SelectType -->|Bracket| BrackGen[Generate Bracket]

    BoxGen --> Features
    CylGen --> Features
    HouseGen --> Features
    HeatGen --> Features
    BrackGen --> Features

    Features[Apply Features]
    Features --> Holes[Add Mounting Holes]
    Holes --> Vents[Add Ventilation]
    Vents --> Thickness[Apply Wall Thickness]

    Thickness --> MfgCheck{Check Manufacturing<br/>Constraints?}

    MfgCheck -->|3D Printing| Check3D[Validate for 3D Printing<br/>- Min wall: 1mm<br/>- Max overhang: 45°<br/>- Min feature: 0.5mm]
    MfgCheck -->|CNC| CheckCNC[Validate for CNC<br/>- Min wall: 2mm<br/>- Tool accessibility<br/>- Min radius: 1mm]
    MfgCheck -->|Injection| CheckInj[Validate for Injection<br/>- Min wall: 1.5mm<br/>- Draft angles: 2°<br/>- Uniform thickness]

    Check3D --> Valid{Constraints<br/>Valid?}
    CheckCNC --> Valid
    CheckInj --> Valid

    Valid -->|No| Adjust[Adjust Geometry]
    Adjust --> MfgCheck
    Valid -->|Yes| Generate[Generate Mesh]

    Generate --> Format{Export<br/>Format?}

    Format -->|STL| STLExp[Generate STL<br/>- Triangulate mesh<br/>- Apply resolution<br/>- Binary/ASCII]
    Format -->|STEP| STEPExp[Generate STEP<br/>- B-Rep conversion<br/>- Add metadata<br/>- AP214 format]

    STLExp --> Store[Store Model]
    STEPExp --> Store
    Store --> UpdateDB[Update Database]
    UpdateDB --> End([Return CAD Model])

    Error1 --> End
```

## AI Design Generation Flow

```mermaid
flowchart TD
    Start([Start AI Generation])

    Start --> Requirements[Parse Requirements]
    Requirements --> Context[Build Context]

    Context --> SystemPrompt[Create System Prompt<br/>- Domain expertise<br/>- Output format<br/>- Constraints]

    SystemPrompt --> UserPrompt[Create User Prompt<br/>- Specifications<br/>- Requirements<br/>- Preferences]

    UserPrompt --> APICall[OpenAI API Call]

    APICall --> Response{Valid<br/>Response?}

    Response -->|No| Retry{Retry<br/>Count?}
    Retry -->|< 3| APICall
    Retry -->|>= 3| Fallback[Use Fallback Design]

    Response -->|Yes| Parse[Parse JSON Response]

    Parse --> Validate{Validate<br/>Design?}

    Validate -->|Invalid| Refine[Refine Prompt]
    Refine --> APICall

    Validate -->|Valid| Extract[Extract Components]

    Extract --> CheckAvail[Check Availability]
    CheckAvail --> Substitute{Need<br/>Substitutes?}

    Substitute -->|Yes| FindAlt[Find Alternatives]
    FindAlt --> RegenerateAPI[Regenerate with Constraints]
    RegenerateAPI --> APICall

    Substitute -->|No| GenerateCode[Generate Code/Firmware]

    GenerateCode --> BuildBOM[Build BOM]
    BuildBOM --> CalcCost[Calculate Cost]

    CalcCost --> BudgetCheck{Within<br/>Budget?}

    BudgetCheck -->|No| Optimize[Optimize Design]
    Optimize --> APICall

    BudgetCheck -->|Yes| SaveDesign[Save Design]
    SaveDesign --> UpdateTokens[Update Token Usage]
    UpdateTokens --> End([Return Design])

    Fallback --> End
```

## WebSocket Communication Protocol

```mermaid
sequenceDiagram
    participant Client
    participant WSServer as WebSocket Server
    participant OrchEngine as Orchestration Engine
    participant Services as Services

    Client->>WSServer: Connect
    WSServer->>Client: Connection Established

    Client->>WSServer: Subscribe to Project
    WSServer->>WSServer: Add to Room

    loop Orchestration Updates
        OrchEngine->>WSServer: Stage Started
        WSServer->>Client: {type: "stage_started", data}

        Services->>OrchEngine: Progress Update
        OrchEngine->>WSServer: Progress Event
        WSServer->>Client: {type: "progress", data}

        Services->>OrchEngine: Stage Complete
        OrchEngine->>WSServer: Stage Complete
        WSServer->>Client: {type: "stage_complete", data}
    end

    Client->>WSServer: Canvas Update
    WSServer->>WSServer: Broadcast to Room
    WSServer->>Client: {type: "canvas_update", data}

    Client->>WSServer: Disconnect
    WSServer->>WSServer: Remove from Room
```

## Security Architecture (Current vs Target)

```mermaid
graph TB
    subgraph "Current State - Development"
        MockAuth[Mock Authentication<br/>Hardcoded User ID]
        NoSession[No Session Management]
        PlainAPI[Unprotected API]
        NoRateLimit[No Rate Limiting]

        style MockAuth fill:#ffcccc
        style NoSession fill:#ffcccc
        style PlainAPI fill:#ffcccc
        style NoRateLimit fill:#ffcccc
    end

    subgraph "Target State - Production"
        RealAuth[JWT Authentication]
        Session[Redis Session Store]
        RBAC[Role-Based Access]
        RateLimit[Rate Limiting]
        APIKey[API Key Management]
        Encryption[Data Encryption]

        RealAuth --> Session
        Session --> RBAC
        RBAC --> APIKey
        APIKey --> RateLimit
        RateLimit --> Encryption

        style RealAuth fill:#ccffcc
        style Session fill:#ccffcc
        style RBAC fill:#ccffcc
        style RateLimit fill:#ccffcc
        style APIKey fill:#ccffcc
        style Encryption fill:#ccffcc
    end
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Production Infrastructure"
        LB[Load Balancer]

        subgraph "Application Tier"
            Node1[Node.js Instance 1]
            Node2[Node.js Instance 2]
            Node3[Node.js Instance 3]
        end

        subgraph "Data Tier"
            PGPool[PostgreSQL<br/>Connection Pool]
            Redis[Redis Cache]
            S3[S3/Object Storage<br/>CAD Files]
        end

        subgraph "External Services"
            OpenAI[OpenAI API]
            Monitoring[Monitoring<br/>& Logging]
        end
    end

    Internet[Internet] --> LB
    LB --> Node1
    LB --> Node2
    LB --> Node3

    Node1 --> PGPool
    Node2 --> PGPool
    Node3 --> PGPool

    Node1 --> Redis
    Node2 --> Redis
    Node3 --> Redis

    Node1 --> S3
    Node2 --> S3
    Node3 --> S3

    Node1 --> OpenAI
    Node2 --> OpenAI
    Node3 --> OpenAI

    Node1 --> Monitoring
    Node2 --> Monitoring
    Node3 --> Monitoring
```

## Technology Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query, React Hook Form
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: TailwindCSS
- **3D Visualization**: Three.js, React Three Fiber
- **Graph Visualization**: XYFlow React
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Real-time**: WebSocket (ws)
- **Database**: PostgreSQL (Neon Serverless)
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **AI Integration**: OpenAI SDK

### Infrastructure
- **Development**: Vite Dev Server
- **Production Build**: ESBuild
- **Database Hosting**: Neon (PostgreSQL)
- **Environment**: Node.js 20+

## Performance Considerations

1. **Database Optimization**
   - Connection pooling via Neon
   - Indexed queries on frequently accessed columns
   - JSONB for flexible schema fields

2. **Caching Strategy**
   - In-memory cache for component library
   - Query caching via TanStack Query
   - Potential Redis integration for production

3. **Real-time Performance**
   - WebSocket for low-latency updates
   - Debounced canvas updates
   - Efficient diff algorithms for state sync

4. **AI Service Optimization**
   - Token usage tracking
   - Request batching where possible
   - Caching of common prompts

5. **File Generation**
   - Streaming for large CAD files
   - Async processing for exports
   - Background job queue for heavy operations

## Scalability Considerations

1. **Horizontal Scaling**
   - Stateless application design
   - Session management via external store
   - WebSocket scaling via Redis pub/sub

2. **Service Separation**
   - Microservices architecture ready
   - Independent scaling of AI, CAD, EDA services
   - Queue-based job processing

3. **Database Scaling**
   - Read replicas for query distribution
   - Sharding strategy for large datasets
   - Archive strategy for old projects

4. **CDN Integration**
   - Static asset distribution
   - CAD model caching
   - Geographic distribution

This architecture provides a robust foundation for a production-ready hardware design automation platform with clear separation of concerns, scalability paths, and integration points for future enhancements.