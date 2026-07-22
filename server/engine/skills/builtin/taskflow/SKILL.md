---
name: taskflow
description: "Coordinate multi-step detached tasks as one durable TaskFlow job with owner context, state, waits, and child tasks."
metadata: { "openclaw": { "emoji": "🪝" } }
---

# TaskFlow

Use TaskFlow when a job needs to outlive one prompt or one detached run, but you still want one owner session, one return context, and one place to inspect or resume the work.

## When to use it

- Multi-step background work with one owner
- Work that waits on detached ACP or subagent tasks
- Jobs that may need to emit one clear update back to the owner
- Jobs that need small persisted state between steps

## Lifecycle

1. `createManaged(...)` - Create a managed flow
2. `runTask(...)` - Launch a child task linked to the flow
3. `setWaiting(...)` - Wait on a person or external system
4. `resume(...)` - Continue work
5. `finish(...)` or `fail(...)` - Complete the flow

## Design constraints

- Use managed TaskFlows when your code owns the orchestration.
- Treat `stateJson` as the persisted state bag.
- Every mutating method after creation is revision-checked.
- `runTask(...)` links the child task to the flow.

## Example

```ts
const taskFlow = api.runtime.tasks.flow.fromToolContext(ctx);
const created = taskFlow.createManaged({
  controllerId: "my-plugin/workflow",
  goal: "process data",
  currentStep: "classify",
  stateJson: {},
});
```
