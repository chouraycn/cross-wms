# Memory Core Extension

Advanced memory management with semantic search and clustering for cross-wms.

## Features

- Semantic search
- Hybrid search (semantic + keyword)
- Memory clustering and consolidation
- Session-scoped memory
- Configurable embedding dimensions

## Usage

```typescript
import { extensionLoader } from '@cross-wms/extensions';

await extensionLoader.loadAll();
await extensionLoader.enable('memory-core');
```

## API

### MemoryStore

```typescript
import { MemoryStore } from '@cross-wms/memory-core-extension';

const store = new MemoryStore();

store.insert({
  id: 'mem-1',
  content: 'User prefers dark mode',
  timestamp: Date.now(),
  sessionId: 'session-1',
});

const results = store.search('dark mode', { limit: 5 });
console.log(results);
```