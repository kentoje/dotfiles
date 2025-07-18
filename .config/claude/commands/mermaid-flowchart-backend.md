# Claude Code Custom Slash Command: Backend TypeScript Flowcharts

## Command Name: `/backend-flowcharts`

## Purpose

Create Mermaid flowcharts to visualize backend TypeScript architecture, API endpoints, data flow, service layers, and middleware interactions before starting development. This enables clear planning of server architecture, database interactions, and request/response patterns.

## Command Definition

```xml
<slash_command>
  <n>backend-flowcharts</n>
  <description>Create a Mermaid flowchart to plan backend TypeScript architecture, API design, and service layer interactions</description>
  <prompt>
    I need to create a Mermaid flowchart to plan backend TypeScript architecture and request flow. Please help me:

    1. **Analyze the backend structure requirements**: Based on the context or description I provide, identify:
       - API endpoints and their relationships
       - Service layer architecture and dependencies
       - Database models and relationships
       - Middleware stack and request pipeline
       - Authentication and authorization flows
       - External service integrations
       - Error handling and logging patterns
       - Background jobs and queue systems

    2. **Create a focused flowchart**: Generate clean, readable Mermaid syntax with:
       - Essential backend elements only (controllers, services, repositories, middleware)
       - Clear request/response flow using appropriate arrows
       - Logical grouping of related services and modules
       - Decision points for authentication, validation, and business logic
       - Simple node shapes that represent different element types:
         * Rectangles for controllers/routes
         * Rounded rectangles for services
         * Cylinders for databases/external APIs
         * Diamonds for validation/auth decisions
         * Hexagons for middleware
         * Circles for background processes
       - Skip implementation details like:
         * Import statements
         * Type definitions
         * Configuration files
         * Build/deployment scripts

    3. **Focus on backend patterns**:
       - Request lifecycle from endpoint to response
       - Service layer separation and dependency injection
       - Repository pattern and data access
       - Middleware execution order
       - Error handling propagation
       - Authentication/authorization gates
       - Caching strategies
       - Rate limiting and throttling
       - Event-driven architecture
       - Microservice boundaries (if applicable)

    4. **Provide backend-specific insights**: After the diagram, include:
       - **Service breakdown**: Role and responsibility of each service/module
       - **Data flow analysis**: How requests move through the system
       - **Database strategy**: Entity relationships and query patterns
       - **Middleware stack**: Order and purpose of each middleware
       - **Security considerations**: Auth flows and data protection
       - **Performance considerations**: Bottlenecks and optimization points
       - **Implementation order**: Suggested development sequence
       - **Testing strategy**: Unit, integration, and end-to-end test points

    5. **Enable easy iteration**: Format the response to facilitate:
       - Visual review of service dependencies
       - Refinement of API design patterns
       - Addition of new endpoints or services
       - Adjustment of data flow architecture
       - Identification of potential circular dependencies

    **Context and Files**:
    {input}

    $ARGUMENTS

    Please create a simple flowchart that shows the essential backend service relationships and request flow. Focus on the core architecture and how requests move through the system. This is the PLANNING phase - show the main service structure and interaction patterns.

    If files or directories were provided, analyze the existing code structure to understand:
    - Current service architecture and dependencies
    - Existing middleware and request pipeline
    - Database models and relationships
    - API endpoint organization
    - Authentication and authorization patterns
    - External service integrations
    - Areas that need architectural improvement

    After creating the diagram, ask specific questions about any ambiguous backend patterns to ensure the plan captures the best architectural approach for scalability, maintainability, and performance.
  </prompt>
</slash_command>
```

## Usage Examples

### API Service Architecture Planning

```bash
/backend-flowcharts Design a REST API for an e-commerce platform with user management, product catalog, orders, and payment processing
```

### Analyzing Existing Service Structure

```bash
/backend-flowcharts src/services/UserService.ts
```

### Planning from Existing Directory

```bash
/backend-flowcharts src/controllers/
```

### Middleware Pipeline with Code Context

```bash
/backend-flowcharts src/middleware/ Plan the request pipeline for authentication, validation, rate limiting, and logging
```

### Database Layer Architecture

```bash
/backend-flowcharts src/repositories/ Design the data access layer with repositories, models, and database connections
```

### Microservice Boundaries Planning

```bash
/backend-flowcharts src/services/ Analyze service dependencies and identify potential microservice boundaries
```

### Authentication Flow Design

```bash
/backend-flowcharts Design JWT-based authentication with refresh tokens, role-based access control, and session management
```

### Background Jobs and Queue System

```bash
/backend-flowcharts src/jobs/ Plan the background processing system with email notifications, data processing, and scheduled tasks
```

## Key Backend Patterns Covered

- **Layered Architecture**: Controllers → Services → Repositories → Database
- **Dependency Injection**: Service dependencies and IoC container usage
- **Middleware Stack**: Request processing pipeline and cross-cutting concerns
- **API Design**: RESTful endpoints, GraphQL resolvers, or RPC methods
- **Data Access Patterns**: Repository pattern, ORM usage, query optimization
- **Security Flows**: Authentication, authorization, input validation
- **Error Handling**: Exception propagation and error response patterns
- **Integration Patterns**: External APIs, message queues, event systems
- **Performance Patterns**: Caching, rate limiting, connection pooling
