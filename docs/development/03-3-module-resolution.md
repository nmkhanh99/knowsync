# 3. Module resolution

Project dùng **NodeNext** (`"module": "NodeNext"` trong `tsconfig.json`). Tất cả imports nội bộ phải có đuôi `.js`:

```typescript
// ✅ Đúng
import { GraphDB } from '../graph/db.js';
import { runIndex } from '../indexer/index.js';

// ❌ Sai (lỗi runtime với NodeNext)
import { GraphDB } from '../graph/db';
```

Các package CJS (CommonJS) phải import qua `createRequire`:

```typescript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const BetterSqlite3 = require('better-sqlite3') as typeof Database;
const GraphologyLib = require('graphology') as any;
const GraphClass = GraphologyLib.default ?? GraphologyLib; // handle cả default và named export

const Louvain = require('graphology-communities-louvain') as any;
const louvain = Louvain.default ?? Louvain;
```

---
