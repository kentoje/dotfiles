# Claude Code Custom Slash Command: UI Component Spec

## Command Name: `/create-ui-spec`

## Purpose

Create comprehensive UI component specifications for React components using TypeScript, designed for iterative development through conversation. This enables thorough planning of component APIs, behaviors, and implementation details before starting development.

## Command Definition

```xml
<slash_command>
  <n>create-ui-spec</n>
  <description>Create a comprehensive UI component specification through iterative conversation, focusing on React + TypeScript + framer-motion</description>
  <prompt>
    I need to create a UI component specification. Please help me build this spec iteratively through conversation:

    1. **Component Overview Analysis**: Based on the component description I provide, help me define:
       - Clear purpose and responsibility
       - Design system alignment and visual consistency
       - Core functionality and user interactions
       - Component boundaries and scope

    2. **Progressive API Design**: Work with me to define:
       - TypeScript props interface with proper types
       - Event handlers and callback patterns
       - Ref forwarding requirements (if needed)
       - Default values and optional props
       - Validation and error handling

    3. **State and Behavior Planning**: Help me specify:
       - Visual states (default, loading, error, success, empty)
       - Interactive states (hover, focus, active, disabled)
       - Animation specifications (if needed) (if needed)
       - Internal state management needs
       - Custom hooks integration

    4. **Implementation Structure**: Guide me through:
       - Component composition patterns
       - Styling approach and CSS architecture
       - Performance considerations
       - Testing strategy and edge cases

    5. **Visual Flow Diagram**: Create a Mermaid diagram showing:
       - Component state transitions
       - User interaction flows
       - Data flow and prop passing
       - Event handling patterns

    6. **Examples and Validation**: Create:
       - Basic usage examples with TypeScript
       - Complex composition scenarios
       - Edge case handling
       - Implementation readiness checklist

    **Technology Stack**: React, TypeScript, Apollo GraphQL

    **Component Context**: $ARGUMENTS

    Please start by asking me clarifying questions about the component's purpose, basic functionality, and expected user interactions. Let's build this spec step by step, ensuring we cover all necessary aspects before moving to implementation.

    After each section, ask specific questions to refine the specification and ensure we haven't missed any important details. Keep the conversation focused on the UI component itself, not backend integration.
  </prompt>
</slash_command>
```

## Usage Examples

### Form Components

```bash
/create-ui-spec Create a reusable form input component with validation, error states, and customizable styling
```

### Navigation Components

```bash
/create-ui-spec Design a sidebar navigation component with collapsible sections, active states, and smooth animations
```

### Data Display Components

```bash
/create-ui-spec Build a data table component with sorting, filtering, pagination, and loading states
```

### Interactive Components

```bash
/create-ui-spec Create a modal component with backdrop, close animations, and flexible content areas
```

### Layout Components

```bash
/create-ui-spec Design a card component with various layouts, hover effects, and optional actions
```

## Expected Output Format

The command should produce iterative conversation leading to:

1. **Component Specification Document**

   ````markdown
   # UI Component Spec: [ComponentName]

   ## 1. Component Overview

   **Purpose & Responsibility:**
   [Clear definition of what the component does]

   **Design System Alignment:**
   [How it fits within the design system]

   ## 2. Component API

   ```typescript
   interface ComponentProps {
     // Fully defined props with proper types
   }
   ```
   ````

   ## 3. Visual States & Behaviors

   - State variations with clear definitions
   - Interactive states with expected behaviors
   - Animation specifications

   ## 4. Component Structure

   - Internal state management approach
   - Custom hooks usage
   - Composition patterns
   - Styling strategy

   ## 5. Component Flow Diagram

   ```mermaid
   stateDiagram-v2
     [*] --> Default
     Default --> Loading
     Default --> Error
     Loading --> Success
     Loading --> Error
     Error --> Default
     Success --> Default
   ```

   ## 6. Examples & Variants

   ```tsx
   // Comprehensive usage examples
   ```

   ## 7. Validation & Self-Check

   - Completeness checklist
   - Implementation readiness criteria

   ```

   ```

2. **Iterative Conversation Flow**

   - **Clarifying Questions**: Specific questions about functionality, behavior, and requirements
   - **Refinement Suggestions**: Options for improving the specification
   - **Implementation Considerations**: Technical details and constraints
   - **Next Steps**: Clear path to implementation

3. **Final Approval Process**
   - Specification review and confirmation
   - Implementation readiness verification
   - Handoff to development phase

## Workflow Integration

### Phase 1: Initial Discovery

```bash
/create-ui-spec [Your component description]
```

### Phase 2: Iterative Refinement

- Answer clarifying questions about functionality
- Refine props interface and component API
- Specify states and behaviors
- Define animation requirements
- Review and approve each section

### Phase 3: Implementation Readiness

- Final specification review
- Confirm all requirements are captured
- Approve for development
- Move to implementation phase

## Best Practices

### For Users:

1. **Start Simple**: Begin with basic component description and core functionality
2. **Think User-First**: Focus on user interactions and expected behaviors
3. **Be Specific**: Provide clear requirements for states, animations, and interactions
4. **Consider Reusability**: Think about how this component will be used across the application
5. **Stay UI-Focused**: Keep the conversation on the component itself, not data integration

### For Component Specs:

1. **Clear Boundaries**: Define what the component does and doesn't do
2. **Complete API**: Fully specify all props, events, and behaviors
3. **State Coverage**: Account for all possible component states
4. **Type Safety**: Use proper TypeScript types throughout
5. **Examples**: Provide clear, practical usage examples
6. **Validation**: Include checks for completeness and readiness

## Example Interaction Flow

```
You: /create-ui-spec Create a button component with loading states, various sizes, and click animations

Claude: Great! Let's build a comprehensive button component spec. I have a few questions to start:

1. What button variants do you need? (primary, secondary, danger, etc.)
2. What sizes should be supported? (small, medium, large, etc.)
3. For the loading state, do you want a spinner, text change, or both?
4. What kind of click animations are you envisioning?
5. Should this button support icons alongside text?

Let's start with the basic functionality and then we'll dive into the props interface...

You: [Answers questions]

Claude: Perfect! Based on your answers, let me draft the Component Overview section:

## Component Overview
**Purpose & Responsibility:**
A reusable button component that handles user interactions with support for multiple variants, sizes, loading states, and smooth click animations.

Does this capture what you're looking for? Should we add anything else to the purpose?

[Continues iteratively through each section...]
```

## Benefits

- **Thorough Planning**: Complete component specification before implementation
- **Type Safety**: Full TypeScript integration from the start
- **Reusability**: Design for reuse across multiple contexts
- **Animation Ready**: Built-in consideration for animations when needed
- **Implementation Clarity**: Clear handoff from specification to development
- **Quality Assurance**: Built-in validation and completeness checks

## Advanced Features

### Component Patterns

- **Compound Components**: Complex components with multiple sub-components
- **Render Props**: Flexible component composition patterns
- **Hook Integration**: Custom hooks for complex state management
- **Ref Forwarding**: Proper TypeScript ref handling
- **Generic Components**: Type-safe generic component patterns

### Integration Capabilities

- Export to design system documentation
- Generate initial component boilerplate
- Create comprehensive test scenarios
- Link to component usage guidelines

## Notes

- Focus exclusively on UI components, not data integration
- Emphasize TypeScript types and interfaces
- Include animation specifications when needed
- Support iterative refinement through conversation
- Ensure implementation readiness before completion
- Maintain focus on component boundaries and responsibilities
