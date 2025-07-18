# Claude Code Custom Slash Command: Mermaid Flowcharts

## Command Name: `/mermaid-flowcharts`

## Purpose

Create Mermaid flowcharts to visualize React component relationships, data flow, state management, and hook interactions before starting development. This enables clear planning of component architecture and data flow patterns.

## Command Definition

```xml
<slash_command>
  <n>mermaid-flowcharts</n>
  <description>Create a Mermaid flowchart to plan React component relationships, data flow, and state management</description>
  <prompt>
    I need to create a Mermaid flowchart to plan React component architecture and data flow. Please help me:

    1. **Analyze the React structure requirements**: Based on the context or description I provide, identify:
       - Key React components and their relationships
       - Data flow between components (props, state, context)
       - Custom hooks and their usage patterns
       - Utility functions and their integration points
       - State management patterns (local state, context, external stores)
       - Event handling and user interactions

    2. **Create a focused flowchart**: Generate clean, readable Mermaid syntax with:
       - Essential React elements only (components, hooks, key utilities)
       - Clear data flow direction using appropriate arrows
       - Logical grouping of related components
       - Decision points for conditional rendering or state changes
       - Simple node shapes that represent different element types:
         * Rectangles for components
         * Rounded rectangles for hooks
         * Diamonds for decisions/conditions
         * Circles for user actions
       - Skip implementation details like:
         * Import statements
         * Prop type definitions
         * File structure
         * Build configurations

    3. **Focus on React patterns**:
       - Component composition and hierarchy
       - Props drilling vs context usage
       - State lifting and sharing patterns
       - Custom hook reusability
       - Event bubbling and handling
       - Conditional rendering logic
       - Side effect management

    4. **Provide React-specific insights**: After the diagram, include:
       - **Component breakdown**: Role and responsibility of each component
       - **Data flow analysis**: How state and props move through the app
       - **Hook strategy**: When and why to use custom hooks
       - **State management approach**: Local vs global state decisions
       - **Performance considerations**: Potential re-render issues
       - **Implementation order**: Suggested development sequence

    5. **Enable easy iteration**: Format the response to facilitate:
       - Visual review of component relationships
       - Refinement of data flow patterns
       - Addition of new components or hooks
       - Adjustment of state management strategy

    **Context and Files**:
    {input}

    $ARGUMENTS

    Please create a simple flowchart that shows the essential React component relationships and data flow. Focus on the core architecture and how data moves through the application. This is the PLANNING phase - show the main component structure and interaction patterns.

    If files or directories were provided, analyze the existing code structure to understand:
    - Current component hierarchy and relationships
    - Existing state management patterns
    - Custom hooks already in use
    - Data flow patterns
    - Areas that need architectural improvement

    After creating the diagram, ask specific questions about any ambiguous React patterns to ensure the plan captures the best architectural approach.
  </prompt>
</slash_command>
```

## Usage Examples

### Component Hierarchy Planning

```bash
/mermaid-flowcharts Design a React dashboard with user profile, settings panel, and data visualization widgets
```

### Analyzing Existing Code Structure

```bash
/mermaid-flowcharts src/components/Dashboard.jsx
```

### Planning from Existing Directory

```bash
/mermaid-flowcharts src/features/user-management/
```

### State Management Flow with Code Context

```bash
/mermaid-flowcharts src/hooks/useShoppingCart.js Plan the state flow for a shopping cart with product list, cart items, and checkout process
```

### Custom Hook Architecture from Existing Code

```bash
/mermaid-flowcharts src/components/forms/ Design a form system with validation hooks, input components, and error handling
```
