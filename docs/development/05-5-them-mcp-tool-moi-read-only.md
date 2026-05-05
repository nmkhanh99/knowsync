# 5. Thêm MCP tool mới (read-only)

Ví dụ: thêm tool `knowsync_get_cluster` — trả về tất cả symbols trong cùng cluster.

### Bước 1 — Thêm DB method

Trong `src/graph/db.ts`:

```typescript
getSymbolsByCluster(clusterId: string): GraphNode[] {
  return (this.db.prepare(`SELECT * FROM symbols WHERE cluster_id = ?`)
    .all(clusterId) as Record<string, unknown>[]).map(rowToNode);
}
```

### Bước 2 — Tạo tool file

Tạo `src/mcp/tools/get-cluster.ts`:

```typescript
import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import type { GraphNode } from '../../types/index.js';

export const schema = {
  clusterId: z.string().describe('Cluster ID to look up'),
};

export function getCluster(db: GraphDB, args: { clusterId: string }): GraphNode[] {
  return db.getSymbolsByCluster(args.clusterId);
}
```

### Bước 3 — Đăng ký trong server.ts

Trong `src/mcp/server.ts`:

```typescript
import { getCluster, schema as getClusterSchema } from './tools/get-cluster.js';

// ... trong startMcpServer(), sau khi đăng ký các tools khác:
server.tool(
  'knowsync_get_cluster',
  'Get all symbols belonging to a specific cluster',
  getClusterSchema,
  async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(getCluster(db, args), null, 2) }]
  })
);
```

### Bước 4 — Build và test

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/cli/index.js mcp .
# → phải thấy "knowsync_get_cluster" trong danh sách tools
```

---
