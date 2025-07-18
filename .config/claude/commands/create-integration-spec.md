# Claude Code Custom Slash Command: Integration Container Spec

## Command Name: `/create-integration-spec`

## Purpose

Create comprehensive integration container specifications for React components that connect UI components to backend services, state management, and data flow. This enables thorough planning of data integration, state synchronization, and component orchestration before implementation.

## Command Definition

```xml
<slash_command>
  <n>create-integration-spec</n>
  <description>Create a comprehensive integration container specification through iterative conversation, focusing on React + TypeScript + Apollo GraphQL</description>
  <prompt>
    I need to create an integration container specification. Please help me build this spec iteratively through conversation:

    1. **Container Purpose Analysis**: Based on the container description I provide, help me define:
       - Clear business logic responsibilities
       - Data requirements and sources
       - User workflow integration
       - Page/feature context and boundaries

    2. **State Management Design**: Work with me to define:
       - React state management patterns (useState, useReducer, useContext)
       - Local vs component state decisions
       - State synchronization strategies
       - Optimistic updates and conflict resolution

    3. **GraphQL Integration Planning**: Help me specify:
       - Apollo queries and mutations with proper typing
       - Cache management and update strategies
       - Loading and error state handling
       - Subscription requirements and real-time updates

    4. **Component Orchestration**: Guide me through:
       - UI component composition and prop passing
       - Data flow and transformation logic
       - Event handling and side effects
       - Navigation and routing integration

    5. **Data Flow Diagram**: Create a Mermaid diagram showing:
       - GraphQL queries and mutations flow
       - Apollo cache interactions
       - Component state updates
       - UI component prop passing and re-renders

    6. **Error Handling & Validation**: Define:
       - Form validation patterns and strategies
       - API error handling and user feedback
       - Fallback states and error boundaries
       - Recovery mechanisms

    **Technology Stack**: React, TypeScript, Apollo GraphQL

    **Container Context**: $ARGUMENTS

    Please start by asking me clarifying questions about the container's purpose, data requirements, and user interactions. Let's build this spec step by step, ensuring we cover all necessary integration aspects before moving to implementation.

    After each section, ask specific questions to refine the specification and ensure we haven't missed any important details. Focus on how this container connects UI components to backend services and manages application state.

    **CRITICAL VALIDATION**: Throughout the specification process, actively identify and raise concerns about:
    - Misalignments between UI component capabilities and required functionality
    - GraphQL queries/mutations that don't provide the data needed for the UI
    - UI components expecting data that isn't available from the backend
    - Integration patterns that won't work with the current UI component APIs
    - State management approaches that conflict with component design
    - Missing queries/mutations needed to support the planned user interactions

    When you identify these issues, stop and explicitly call them out so we can address them together before continuing with the specification.
  </prompt>
</slash_command>
```

## Usage Examples

### Data Management Containers

```bash
/create-integration-spec Create a user profile container that fetches user data, handles profile updates, and manages avatar uploads
```

### Form Integration Containers

```bash
/create-integration-spec Build a contact form container with validation, submission handling, and success/error feedback
```

### List/Table Containers

```bash
/create-integration-spec Design a product listing container with filtering, sorting, pagination, and real-time inventory updates
```

### Dashboard Containers

```bash
/create-integration-spec Create a dashboard container that aggregates data from multiple APIs and manages widget state
```

### Real-time Feature Containers

```bash
/create-integration-spec Build a chat container with message handling, typing indicators, and user presence management
```

## Expected Output Format

The command should produce iterative conversation leading to:

1. **Integration Container Specification Document**

   ````markdown
   # Integration Container Spec: [ContainerName]

   ## 1. Container Purpose

   **Business Logic Responsibilities:**
   [Clear definition of what business logic this container handles]

   **Data Requirements:**
   [What data this container needs and from where]

   **User Workflow Integration:**
   [How this fits into user journeys and workflows]

   ## 2. State Management

   **React State Patterns:**

   ```typescript
   interface ContainerState {
     // State interface definitions
   }
   ```
   ````

   **Local vs Component State:**
   [Decisions on what state lives where]

   ## 3. GraphQL Integration

   **Queries and Mutations:**

   ```typescript
   // Apollo GraphQL operations
   ```

   **Cache Management:**
   [Caching strategies and update policies]

   ## 4. Component Orchestration

   **UI Component Composition:**
   [How UI components are composed and connected]

   **Data Flow:**
   [How data flows through the container]

   ## 5. Data Flow Diagram

   ```mermaid
   graph TD
     A[GraphQL Query] --> B[Apollo Cache]
     B --> C[Container Hook]
     C --> D[UI Components]
     D --> E[User Interactions]
     E --> F[GraphQL Mutations]
     F --> B
   ```

   ## 6. Error Handling & Validation

   [Comprehensive error handling strategies]

   ## 7. Validation & Self-Check

   - Implementation readiness criteria
   - Integration completeness checklist
   - UI/Backend compatibility validation
   - Critical issues and misalignments identified

   ```

   ```

2. **Iterative Conversation Flow**

   - **Clarifying Questions**: Specific questions about data flow, state management, and integration requirements
   - **Architecture Decisions**: Options for structuring the integration
   - **Critical Issue Identification**: Misalignments between UI capabilities and backend data
   - **Performance Considerations**: Caching, optimization, and loading strategies
   - **Next Steps**: Clear path to implementation

3. **Final Approval Process**
   - Specification review and confirmation
   - Integration readiness verification
   - Handoff to development phase

## Workflow Integration

### Phase 1: Initial Discovery

```bash
/create-integration-spec [Your container description]
```

### Phase 2: Iterative Refinement

- Answer questions about data requirements and sources
- Define React state management strategies
- Specify GraphQL operations and caching
- Plan component composition and data flow
- Review error handling and validation

### Phase 3: Implementation Readiness

- Final specification review
- Confirm all integration points are covered
- Approve for development
- Move to implementation phase

## Best Practices

### For Users:

1. **Think Data-First**: Start with what data you need and where it comes from
2. **Define User Flows**: Be clear about the user journeys this container supports
3. **Consider State Scope**: Think about what state should be local vs component-level vs Apollo cache
4. **Plan for Errors**: Consider all the ways things can go wrong
5. **Focus on Integration**: Keep the conversation on how components connect, not individual component design
6. **Be Critical**: Question whether the UI components can actually support the planned functionality
7. **Validate Backend Alignment**: Ensure GraphQL operations provide the data the UI components need

### For Container Specs:

1. **Clear Data Flow**: Define how data moves through the system
2. **State Management**: Proper separation of concerns for React state management
3. **Error Handling**: Comprehensive error and loading state management
4. **Performance**: Consider caching, optimization, and user experience
5. **Type Safety**: Use proper TypeScript types for all data and state
6. **Testing**: Plan for integration testing scenarios
7. **Critical Validation**: Identify and address UI/backend misalignments early

## Example Interaction Flow

```
You: /create-integration-spec Create a user profile container that fetches user data, handles profile updates, and manages avatar uploads

Claude: Great! Let's build a comprehensive user profile container spec. I have a few questions to start:

1. What user data fields do you need to fetch and display?
2. Should the profile data be stored in React state or kept in Apollo cache?
3. Are there real-time updates needed (like when other users update their profiles)?
4. For avatar uploads, do you need progress tracking and preview functionality?
5. What validation rules apply to profile updates?
6. Should changes be auto-saved or require explicit save actions?

Let's start with the data requirements and then we'll design the state management...

You: [Answers questions]

Claude: Perfect! Based on your answers, let me draft the Container Purpose section:

## Container Purpose
**Business Logic Responsibilities:**
Manages user profile data lifecycle including fetching, updating, and avatar management with optimistic updates and conflict resolution.

**Data Requirements:**
- User profile data from /user/profile endpoint
- Avatar upload to /user/avatar endpoint
- Real-time profile updates via GraphQL subscription

Does this capture the core responsibilities? Should we add anything else?

**CRITICAL VALIDATION**: I need to check - do your current UI components support avatar upload with progress tracking? And do you have GraphQL mutations for both profile updates and avatar uploads? If not, we need to address these gaps first.

[Continues iteratively through each section...]
```

## Benefits

- **Complete Integration Planning**: Full specification of data flow and state management
- **Backend Connection**: Clear definition of API integration and data synchronization
- **State Management**: Proper planning of local vs global state decisions
- **Error Handling**: Comprehensive error and loading state management
- **Performance**: Built-in consideration for caching and optimization
- **Type Safety**: Full TypeScript integration throughout the data flow

## Advanced Features

### Integration Patterns

- **Optimistic Updates**: Immediate UI updates with rollback capabilities
- **Real-time Subscriptions**: GraphQL subscriptions for live data
- **Cache Synchronization**: Apollo cache management and updates
- **State Persistence**: Component state persistence and session management
- **Error Boundaries**: Graceful error handling and recovery

### Data Flow Patterns

- **CRUD Operations**: Create, read, update, delete with proper state management
- **Pagination**: Infinite scroll and traditional pagination patterns
- **Filtering & Search**: Real-time filtering with debouncing
- **Batch Operations**: Multiple selections and bulk actions
- **Offline Support**: Offline-first data management

## Integration Capabilities

- Export to API documentation
- Generate GraphQL operation templates
- Create integration test scenarios
- Link to backend API specifications

## Notes

- Focus on integration between UI and backend services
- Emphasize proper state management and data flow
- Include comprehensive error handling strategies
- Support both real-time and traditional data patterns
- Ensure type safety throughout the integration layer
- Plan for scalability and performance optimization
