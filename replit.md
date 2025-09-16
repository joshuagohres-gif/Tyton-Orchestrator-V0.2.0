# Tyton Orchestrator - AI-Powered Hardware Design Platform

## Overview

Tyton Orchestrator is a comprehensive AI-powered hardware design platform that enables researchers and engineers to design, validate, and manufacture both electronic systems and mechanical enclosures through automated workflows. The application orchestrates end-to-end hardware design projects from initial concept to manufacturing-ready outputs, leveraging AI to generate circuit schematics, PCB layouts, 3D mechanical CAD models, and firmware code automatically.

The platform provides real-time collaborative design capabilities with a visual canvas interface for electronics and an interactive 3D viewer for mechanical components. It includes component sourcing with pricing data, parametric CAD generation for housings and heat sinks, and comprehensive export functionality for production-ready artifacts including KiCad files, STL/STEP models for 3D printing and CNC manufacturing, BOMs, and netlists.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The client is built as a single-page application using React with TypeScript, utilizing Vite as the build tool. The UI framework is based on Radix UI components with shadcn/ui styling system and Tailwind CSS for consistent design. Key architectural decisions include:

- **Component Library**: Extensive use of Radix UI primitives for accessibility and consistent behavior
- **State Management**: React Query (TanStack Query) for server state management with local component state for UI interactions
- **Routing**: Wouter for lightweight client-side routing
- **Canvas Visualization**: React Flow (@xyflow/react) for interactive hardware design canvas with drag-and-drop component placement
- **3D Visualization**: Three.js with React Three Fiber for interactive 3D CAD model viewing and manipulation
- **Real-time Updates**: WebSocket integration for live collaboration and orchestration progress updates

### Backend Architecture
The server implements a REST API using Express.js with TypeScript, following a modular service-oriented approach:

- **API Layer**: Express routes handling CRUD operations for projects, components, orchestration control, and CAD generation
- **Business Logic**: Separate service modules for orchestration engine, EDA processing, CAD generation, and OpenAI integration
- **CAD Service**: Parametric CAD generation for mechanical components with STL/STEP export capabilities
- **Storage Layer**: Abstracted storage interface allowing for flexible database implementations
- **WebSocket Server**: Real-time communication for collaborative features and live progress updates

### Data Storage
The application uses PostgreSQL as the primary database with Drizzle ORM for type-safe database operations:

- **Schema Design**: Relational model with tables for users, projects, components, modules (electrical/mechanical/hybrid), connections, mechanical components, and orchestration runs
- **Database Provider**: Neon serverless PostgreSQL with connection pooling
- **Migrations**: Drizzle Kit for schema management and migrations
- **Type Safety**: Generated TypeScript types from database schema using drizzle-zod
- **CAD Storage**: Parametric data and geometry stored as JSONB for flexible 3D model representation

### Authentication and Authorization
Currently implements a mock user system for demonstration purposes with a fixed demo user ID. The architecture supports extension to full authentication:

- **Session Management**: Prepared for cookie-based sessions with connect-pg-simple
- **User Model**: Database schema includes users table with username, email, and password fields
- **Authorization**: Project-level access control based on user ownership

## External Dependencies

### AI/LLM Integration
- **OpenAI API**: GPT integration for circuit generation, validation, and firmware code creation
- **Model Configuration**: Uses GPT-5 for advanced hardware design capabilities
- **Budget Management**: Built-in LLM token budget tracking and spending limits per project

### UI Component Libraries
- **Radix UI**: Complete set of unstyled, accessible UI primitives (@radix-ui/react-*)
- **Tailwind CSS**: Utility-first CSS framework with custom design system variables
- **Lucide Icons**: Comprehensive icon library for consistent iconography
- **React Flow**: Specialized library for node-based graph interfaces and canvas interactions
- **Three.js & React Three Fiber**: 3D graphics library for WebGL-based CAD model visualization
- **React Three Drei**: Helper components for Three.js including OrbitControls and environment presets

### Database and Infrastructure
- **Neon Database**: Serverless PostgreSQL with WebSocket support for real-time features
- **Drizzle ORM**: Type-safe database toolkit with PostgreSQL adapter
- **Connection Pooling**: @neondatabase/serverless for optimized database connections

### Development and Build Tools
- **Vite**: Frontend build tool with React plugin and development server
- **TypeScript**: Full type coverage across frontend and backend
- **ESBuild**: Backend bundling for production deployment
- **PostCSS**: CSS processing with Tailwind and Autoprefixer

### Real-time Communication
- **WebSocket (ws)**: Native WebSocket implementation for server-side real-time features
- **Custom WebSocket Client**: Frontend WebSocket hook with automatic reconnection logic

### Component Sourcing and EDA
- **Component Database**: Built-in component library with specifications, pricing, and availability data
- **EDA Export**: KiCad file generation capabilities for professional PCB design workflows
- **BOM Generation**: Automated bill of materials creation with supplier integration readiness