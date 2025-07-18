# Claude Code Custom Slash Command: Mermaid Sequence Planning

## Command Name: `/mermaid-sequence`

## Purpose

Create Mermaid sequence diagrams to visualize interactions, API calls, user flows, and time-based processes before starting development. This enables clear planning of communication patterns and message flows between system components.

## Command Definition

```xml
<slash_command>
  <n>mermaid-sequence</n>
  <description>Create a Mermaid sequence diagram to plan interactions, API calls, and time-based flows before development</description>
  <prompt>
    I need to create a Mermaid sequence diagram to plan our system interactions. Please help me:

    1. **Analyze the interaction requirements**: Based on the context or description I provide, identify:
       - Key business actors (users, external services, major system components)
       - Core business interactions and data exchanges
       - Main decision points and business logic flows
       - Critical external API calls or service interactions
       - Essential error scenarios that affect the business flow

    2. **Create a focused sequence diagram**: Generate clean, readable Mermaid syntax with:
       - Only essential business participants (typically 3-4 main actors)
       - Core business interactions - skip implementation details like:
         * Logging statements
         * Variable initialization
         * Directory creation/cleanup
         * File system operations (unless core to the business logic)
         * Internal validation steps
         * Utility function calls
       - Focus on meaningful data exchanges and business decisions
       - Simple arrow types: `->` for calls, `-->>` for responses
       - Minimal alt blocks only for critical business paths

    3. **Focus on business-critical interactions**:
       - Main business process flow
       - Key external service calls
       - Critical decision points that affect outcomes
       - Essential error scenarios (not technical failures)
       - User-visible state changes

    4. **Provide detailed planning insights**: After the diagram, include:
       - **Participant breakdown**: Role and responsibility of each actor
       - **Message flow analysis**: Purpose and payload of each interaction
       - **Implementation considerations**: Technical requirements and constraints
       - **Error handling strategy**: How to handle failures at each step
       - **Performance considerations**: Bottlenecks and optimization opportunities
       - **Security implications**: Authentication, authorization, and data protection
       - **Testing strategy**: Key interaction scenarios to test

    5. **Enable easy iteration**: Format the response to facilitate:
       - Visual review of interaction flows
       - Specific modification requests
       - Addition of new participants or messages
       - Refinement of error handling
       - Clear approval and implementation handoff

    **Context**: {input}

    Please create a simple sequence diagram that shows only the essential business interactions. Exclude implementation details like logging, file operations, variable initialization, directory creation, or internal processing steps. Focus on the key actors and their meaningful business exchanges. This is the PLANNING phase - show the core business flow and main decision points.

    After creating the diagram, ask specific questions about any ambiguous interactions to ensure the plan captures all necessary communication patterns.
  </prompt>
</slash_command>
```

## Usage Examples

### API Authentication Flow

```bash
/mermaid-sequence Design the OAuth 2.0 authentication flow between a mobile app, auth server, and resource server
```

### Microservices Communication

```bash
/mermaid-sequence Plan the interaction flow for processing an e-commerce order across user service, inventory service, payment service, and notification service
```

### Real-time Features

```bash
/mermaid-sequence Design the WebSocket message flow for a collaborative document editor with multiple users, conflict resolution, and persistence
```

### User Registration Process

```bash
/mermaid-sequence Create the complete user registration flow including email verification, profile setup, and welcome sequence
```

### Payment Processing

```bash
/mermaid-sequence Plan the payment processing sequence with user, frontend, backend, payment gateway, and fraud detection service
```

## Expected Output Format

The command should produce:

1. **Mermaid Sequence Diagram Code Block**

   ```mermaid
   sequenceDiagram
       participant U as User
       participant F as Frontend
       participant B as Backend
       participant D as Database

       U->>F: Login Request
       F->>B: Authenticate User
       B->>D: Validate Credentials
       D-->>B: User Data
       B-->>F: Auth Token
       F-->>U: Login Success

       Note over U,D: Successful authentication flow
   ```

2. **Interaction Analysis**

   - **Participant Breakdown**: Detailed role of each actor
   - **Message Flow Analysis**: Purpose and data for each interaction
   - **Implementation Considerations**: Technical requirements and API specifications
   - **Error Handling Strategy**: Failure scenarios and recovery mechanisms
   - **Performance Considerations**: Timing, caching, and optimization opportunities
   - **Security Implications**: Authentication, authorization, and data protection needs
   - **Testing Strategy**: Key scenarios and edge cases to test

3. **Clarification Questions**

   - Specific questions about interaction patterns
   - Options for alternative communication approaches
   - Confirmation of assumptions about message flows

4. **Next Steps Prompt**
   - Clear options for iteration and refinement
   - Approval confirmation path
   - Implementation handoff checklist

## Workflow Integration

### Phase 1: Initial Planning

```bash
/mermaid-sequence [Your detailed interaction description]
```

### Phase 2: Iterative Refinement

- Review the generated sequence diagram
- Request specific changes: "Add retry logic for the payment processing"
- Refine flows: "Can you show what happens when the user is offline?"
- Add participants: "Include the notification service in the flow"
- Repeat until satisfied with all interactions

### Phase 3: Implementation Approval

- Confirm all interaction patterns are captured
- Verify error handling is comprehensive
- Approve and move to implementation

## Best Practices

### For Users:

1. **Focus on Business Value**: Describe the core business process, not implementation details
2. **Identify Key Actors**: Think about users, external services, and major system components
3. **Skip Technical Details**: Don't mention logging, file operations, or internal processing
4. **Highlight Decisions**: Focus on business logic and decision points that matter
5. **Think User Journey**: Consider what the user or external system experiences

### For Sequence Diagrams:

1. **Business Focus**: Show only business-relevant interactions
2. **Minimal Participants**: Keep to 3-4 main actors (User, Service, External API)
3. **Core Flow Only**: Skip logging, validation, cleanup, initialization
4. **Meaningful Messages**: Focus on data exchanges and business decisions
5. **Simple Structure**: Use basic arrows and minimal alt blocks
6. **No Implementation Details**: Avoid technical operations like file I/O, directory management

## Example Interaction Flow

```
You: /mermaid-sequence Design a script that downloads translation files from Lokalise API and updates the local files

Claude: [Generates simple sequence diagram showing:]
- Script, Lokalise API
- Request translation bundle
- Download and extract files
- Update local translations

Analysis:
- Core business flow: Get translations from external service
- Key decision points: Bundle availability, download success
- Implementation focus: API integration and file replacement

Questions:
- Are there specific error scenarios you want to highlight?
- Should we show any user interaction points?

You: This is perfect - shows just the essential business flow!

Claude: Great! Now let's implement the API integration...
```

## Benefits

- **Clear Communication Patterns**: Visual representation of all system interactions
- **Timing Clarity**: Understand the sequence and dependencies of operations
- **Error Handling**: Identify all failure points and recovery mechanisms
- **API Design**: Clear specification of message formats and protocols
- **Integration Planning**: Understand how different services communicate
- **Testing Guidance**: Clear scenarios for integration and end-to-end testing

## Advanced Features

### Sequence Diagram Patterns

- **Authentication flows**: OAuth, JWT, session management
- **CRUD operations**: Create, read, update, delete with proper error handling
- **Event-driven architectures**: Async messaging and event processing
- **Retry mechanisms**: Exponential backoff and circuit breakers
- **Saga patterns**: Distributed transaction management
- **Real-time communications**: WebSocket and Server-Sent Events

### Integration Capabilities

- Export to API documentation
- Generate test scenarios
- Create implementation templates
- Link to monitoring and observability setup

## Notes

- Focus exclusively on interaction patterns and message flows
- Emphasize timing and sequence of operations
- Include both synchronous and asynchronous communication patterns
- Always consider error scenarios and recovery mechanisms
- Support both simple request/response and complex distributed system interactions
- Encourage comprehensive planning of all communication touchpoints
