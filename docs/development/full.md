# Hướng dẫn phát triển KnowSync

## 1. Setup môi trường

```bash
# Yêu cầu
node --version  # >= 20.0.0
npm --version   # >= 9

# Clone và cài deps
git clone <repo-url>
cd knowsync
npm install --legacy-peer-deps

# Build TypeScript → dist/ (bao gồm copy vendor + static assets)
npm run build

# Dev mode (ts-node/tsx, chạy trực tiếp từ src/ không cần build mỗi lần)
npm run dev -- index . --docs

# Type check không emit (nhanh hơn full build)
npm run typecheck
```

> `--legacy-peer-deps` cần vì `tree-sitter-javascript@0.23.x` và `tree-sitter-python@0.23.x` có peer dep lệch nhau với `tree-sitter`.

---

## 2. Cấu trúc thư mục

```
knowsync/
├── src/
│   ├── types/
│   │   └── index.ts              — Tất cả interfaces: GraphNode, GraphEdge, DocSection,
│   │                               ParsedFile, ParsedDoc, CrawledFile, IndexSummary, ...
│   ├── indexer/
│   │   ├── file-crawler.ts       — Glob + .gitignore (thư viện ignore) + SHA-256 hash
│   │   │                           codeSources/docSources boundary logic
│   │   ├── code-parser.ts        — Tree-sitter parser, scope stack, pending calls
│   │   ├── rules-engine.ts       — RulesEngine: load AI rules từ parse_rules DB,
│   │   │                           áp dụng S-expression queries
│   │   ├── docs-parser.ts        — remark 15 + unist-util-visit, slug generation,
│   │   │                           @symbol / [[Symbol]] / @doc:... extraction
│   │   └── index.ts              — runIndex: orchestrator, two-pass, clustering
│   ├── graph/
│   │   ├── db.ts                 — GraphDB: auto-mkdir, WAL mode, FTS5, migrations,
│   │   │                           is_manual edges, getDocSubgraph, suggestLinks,
│   │   │                           validateLinks
│   │   ├── builder.ts            — makeNodeId, makeDocId, persistParsedFile,
│   │   │                           persistParsedDoc, buildInMemoryGraph
│   │   ├── clustering.ts         — Louvain + cluster naming (highest-degree node)
│   │   └── index.ts              — Re-exports
│   ├── mcp/
│   │   ├── server.ts             — @startMcpServer: đăng ký 26 MCP tools + wrap()/asyncWrap()
│   │   ├── index.ts              — Re-exports
│   │   └── tools/
│   │       ├── get-symbol.ts
│   │       ├── get-callers.ts
│   │       ├── get-linked-docs.ts
│   │       ├── get-impact.ts
│   │       ├── get-process-flow.ts
│   │       ├── search-graph.ts
│   │       ├── check-doc-sync.ts
│   │       ├── get-module-overview.ts
│   │       ├── get-doc-section.ts          — Nội dung Markdown đầy đủ + slug
│   │       ├── get-full-context.ts          — Rich context: callers+callees+docs+siblings
│   │       ├── get-doc-visualization.ts     — Doc subgraph
│   │       ├── suggest-doc-links.ts         — AI-assisted: gợi ý DocSection↔Symbol links
│   │       ├── create-doc-link.ts           — Tạo REFERENCES edge thủ công (is_manual=1)
│   │       ├── validate-links.ts            — Tìm stale edges + coverage stats
│   │       ├── provide-parse-rules.ts       — AI đẩy Tree-sitter S-expression rules
│   │       ├── build-graph.ts               — Trigger index + áp dụng AI rules
│   │       └── regenerate-doc.ts            — Tạo/cập nhật DocSection với AI content
│   ├── cli/
│   │   ├── index.ts              — Commander 12 entry point (8 commands)
│   │   ├── config.ts             — Load/init knowsync.config.json
│   │   ├── registry.ts           — Registry CRUD: load, save, register, update,
│   │   │                           unregister, makeProjectId
│   │   └── commands/
│   │       ├── init.ts           — knowsync init
│   │       ├── register.ts       — knowsync register / unregister / list
│   │       │                       (--docs-source flag, repeatable; codeSources qua UI/MCP)
│   │       ├── index-cmd.ts      — knowsync index (--all, --delta, --docs flags)
│   │       ├── validate.ts       — knowsync validate
│   │       ├── viz.ts            — knowsync viz (auto-load registry, --port flag)
│   │       └── mcp-cmd.ts        — knowsync mcp
│   └── viz/
│       ├── server.ts             — @startVizServer: 43 routes, runtime index, project CRUD,
│       │                           resolveDb() helper, multi-project Map<id, GraphDB>
│       └── public/
│           ├── index.html        — HTML shell + vendor script tags + modal markup
│           ├── app.js            — Runtime UI core: project manager, popup, bootstrap
│           ├── app-search.js     — Runtime Search: search results, symbol detail, type filters
│           ├── app-analysis.js   — Runtime Analysis: impact, flow, module
│           ├── app-docs.js       — Runtime Docs: coverage, links manager, doc sync, forward refs
│           ├── app-mcp.js        — Runtime MCP client config + shared rule-filter state
│           ├── app-parse-rules.js— Runtime parse-rules: import, validate, export, samples
│           ├── app-rulesets.js   — Runtime RuleSets: tree, detail, inheritance, links
│           ├── app-vdocs.js      — Runtime Visual Docs core: shared state + dispatcher
│           ├── app-vdocs-config.js — Runtime Visual Docs config panel
│           ├── app-vdocs-outline.js — Runtime Visual Docs outline + preview + grouping helpers
│           ├── app-vdocs-graph.js — Runtime Visual Docs links graph + overlay
│           └── vendor/           — KHÔNG commit (copy lúc build)
│               ├── sigma.min.js
│               ├── graphology.umd.min.js
│               ├── marked.umd.js
│               └── mermaid.min.js
├── dist/                         — Output build (không commit)
├── docs/
│   ├── architecture/
│   │   ├── README.md
│   │   ├── full.md
│   │   └── 01-... 15-...
│   ├── development/
│   │   ├── README.md
│   │   ├── full.md               ← (file này)
│   │   └── 01-... 11-...
│   └── guide/
│       ├── README.md
│       ├── full.md
│       ├── examples.md
│       └── 01-... 20-...
├── package.json                  — scripts: build, dev, typecheck
└── tsconfig.json                 — NodeNext module, strict mode
```

### Build script

```bash
tsc && \
  cp -r src/viz/public dist/viz/ && \
  mkdir -p dist/viz/public/vendor && \
  cp node_modules/sigma/build/sigma.min.js dist/viz/public/vendor/ && \
  cp node_modules/graphology/dist/graphology.umd.min.js dist/viz/public/vendor/ && \
  cp node_modules/marked/lib/marked.umd.js dist/viz/public/vendor/
```

Registry trung tâm: `~/.knowsync/registry.json` — nằm ngoài repo, dùng chung cho mọi project trên máy.

---

## 3. Module resolution

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

## 4. Thêm ngôn ngữ mới

Ví dụ: thêm **Go**.

### Bước 1 — Cài grammar

```bash
npm install tree-sitter-go --legacy-peer-deps
```

### Bước 2 — Thêm vào code-parser.ts

Mở `src/indexer/code-parser.ts`, tìm hàm `getParser`:

```typescript
function getParser(language: string): Parser {
  const parser = new Parser();
  if (language === 'javascript' || language === 'typescript') {
    const JS = require('tree-sitter-javascript');
    parser.setLanguage(JS);
  } else if (language === 'python') {
    const Python = require('tree-sitter-python');
    parser.setLanguage(Python);
  } else if (language === 'go') {           // ← thêm case mới
    const Go = require('tree-sitter-go');
    parser.setLanguage(Go);
  }
  return parser;
}
```

### Bước 3 — Thêm node type mappings

Trong hàm `tryExtractSymbol`, thêm case cho Go AST node types:

```typescript
if (language === 'go') {
  if (nodeType === 'function_declaration') return 'Function';
  if (nodeType === 'method_declaration') return 'Method';
  if (nodeType === 'type_declaration') return 'Type';
  if (nodeType === 'var_declaration') return 'Variable';
  if (nodeType === 'const_declaration') return 'Variable';
}
```

### Bước 4 — Thêm vào file-crawler.ts

Trong `LANGUAGE_EXTENSIONS`:

```typescript
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',           // ← thêm dòng này
};
```

### Bước 5 — Cập nhật default config

Trong `src/cli/commands/init.ts`, thêm `'go'` vào mảng `languages` mặc định:

```typescript
const defaultConfig = {
  include: ['src/**'],
  exclude: ['node_modules', 'dist', '.git'],
  languages: ['typescript', 'javascript', 'python', 'go'],  // ← thêm 'go'
  docsGlob: 'docs/**/*.md',
};
```

### Bước 6 — Build và test

```bash
npm run build
knowsync index /path/to/go-project
knowsync list
# Kiểm tra symbols Go đã được index
sqlite3 /path/to/go-project/.knowsync/graph.db \
  "SELECT type, name, file_path FROM symbols WHERE file_path LIKE '%.go' LIMIT 10;"
```

---

## 5. Thêm MCP tool mới (read-only)

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

## 6. Thêm MCP write tool (tạo/sửa dữ liệu)

Write tools khác read tools ở chỗ chúng thay đổi trạng thái DB. Ví dụ: thêm tool `knowsync_pin_symbol` — đánh dấu một symbol là "pinned".

### Bước 1 — Thêm column mới (nếu cần)

Trong `GraphDB.init()` ở `src/graph/db.ts`, thêm migration sau khi tạo tables:

```typescript
// Migration: thêm column pinned nếu chưa có
try {
  this.db.exec(`ALTER TABLE symbols ADD COLUMN pinned INTEGER DEFAULT 0`);
} catch {
  // Column đã tồn tại — bỏ qua
}
```

### Bước 2 — Thêm DB method

Trong `src/graph/db.ts`:

```typescript
pinSymbol(symbolId: string): void {
  this.db.prepare(`UPDATE symbols SET pinned = 1 WHERE id = ?`).run(symbolId);
}

unpinSymbol(symbolId: string): void {
  this.db.prepare(`UPDATE symbols SET pinned = 0 WHERE id = ?`).run(symbolId);
}

getPinnedSymbols(): GraphNode[] {
  return (this.db.prepare(`SELECT * FROM symbols WHERE pinned = 1`)
    .all() as Record<string, unknown>[]).map(rowToNode);
}
```

### Bước 3 — Tạo tool file

Tạo `src/mcp/tools/pin-symbol.ts`:

```typescript
import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';

export const schema = {
  symbolId: z.string().describe('ID of the symbol to pin'),
  pinned: z.boolean().default(true).describe('true to pin, false to unpin'),
};

export function pinSymbol(db: GraphDB, args: { symbolId: string; pinned: boolean }): { ok: boolean; symbolId: string } {
  if (args.pinned) {
    db.pinSymbol(args.symbolId);
  } else {
    db.unpinSymbol(args.symbolId);
  }
  return { ok: true, symbolId: args.symbolId };
}
```

### Bước 4 — Đăng ký trong server.ts

Trong `src/mcp/server.ts`:

```typescript
import { pinSymbol, schema as pinSymbolSchema } from './tools/pin-symbol.js';

server.tool(
  'knowsync_pin_symbol',
  'Mark or unmark a symbol as pinned for quick access',
  pinSymbolSchema,
  async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(pinSymbol(db, args), null, 2) }]
  })
);
```

**Lưu ý quan trọng cho write tools:**
- Validate input kỹ trước khi ghi (Zod schema + kiểm tra existence nếu cần)
- Luôn trả object mô tả kết quả rõ ràng (`{ ok: true, ... }`)
- Nếu tạo manual edge (như `knowsync_create_doc_link`), dùng `db.upsertEdge()` với `is_manual: 1` để edge không bị xóa khi re-index
- Dùng `wrap()` helper trong `server.ts` để bắt lỗi nhất quán

### Bước 5 — Build và test

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/cli/index.js mcp .
# → phải thấy "knowsync_pin_symbol" trong danh sách
```

---

## 7. Thêm API endpoint vào viz server

Mọi endpoint mới thêm vào `src/viz/server.ts` trong hàm `startVizServer()`:

### Read endpoint (GET)

```typescript
app.get('/api/my-endpoint', (req, res) => {
  // ← Dùng resolveDb, KHÔNG phải resolve (resolve là path.resolve, đã import cùng scope)
  const db = resolveDb(req);
  if (!db) { err404(res); return; }

  const param = req.query.param as string;
  if (!param) {
    res.status(400).json({ error: 'param is required' });
    return;
  }

  try {
    const result = db.myMethod(param);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
```

### Write endpoint (POST)

```typescript
app.post('/api/my-write-endpoint', (req, res) => {
  const db = resolveDb(req);
  if (!db) { err404(res); return; }

  const { field1, field2 } = req.body as { field1: string; field2: string };
  if (!field1 || !field2) {
    res.status(400).json({ error: 'field1 and field2 are required' });
    return;
  }

  try {
    db.myWriteMethod(field1, field2);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
```

### Lưu ý về resolveDb

```typescript
// resolveDb đọc ?project=<id> từ query string (GET) hoặc req.body.projectId (POST)
// và trả GraphDB instance tương ứng từ Map<id, GraphDB>
// Trả undefined nếu project không tồn tại hoặc không có ?project param
function resolveDb(req: Request): GraphDB | undefined {
  const id = (req.query.project ?? req.body?.projectId) as string | undefined;
  if (!id) return undefined;
  return dbMap.get(id);
}
```

---

## 8. Thêm AI Parse Rule mới

### Qua MCP (recommended)

```json
// Gọi knowsync_provide_parse_rules
{
  "language": "typescript",
  "rules": [
    {
      "name": "decorator_class",
      "ruleType": "node",
      "nodeType": "Class",
      "query": "(class_declaration name: (type_identifier) @name (class_body (decorator)))",
      "nameCapture": "name",
      "priority": 10
    }
  ]
}
```

Rules được lưu vào bảng `parse_rules` trong DB — tồn tại persistent.

### Trực tiếp qua DB (dev/debug)

```bash
sqlite3 /path/to/project/.knowsync/graph.db "
INSERT INTO parse_rules (id, language, rule_type, name, query, node_type, name_capture, priority, created_at)
VALUES (
  hex(randomblob(8)),
  'typescript',
  'node',
  'my_custom_rule',
  '(function_declaration name: (identifier) @name)',
  'Function',
  'name',
  5,
  unixepoch() * 1000
);
"
```

Sau đó trigger index lại:

```bash
knowsync index /path/to/project
```

---

## 9. Build + Typecheck

### Full build

```bash
npm run build
```

Chạy `tsc` rồi copy vendor files. Output ở `dist/`.

### Typecheck only (không emit, nhanh hơn)

```bash
npm run typecheck
```

Hữu ích khi muốn kiểm tra types nhanh mà không cần rebuild toàn bộ.

### Dev mode (tsx/ts-node)

```bash
# Chạy index command trực tiếp từ src/
npm run dev -- index /path/to/project --docs

# Chạy viz server
npm run dev -- viz /path/to/project
```

---

## 10. Debug tips

### Xem graph dump

```bash
node -e "
import('./dist/graph/db.js').then(({ GraphDB }) => {
  const db = new GraphDB('.knowsync/graph.db');
  db.init().then(() => {
    console.log(JSON.stringify(db.getAllNodes().slice(0, 10), null, 2));
    db.close();
  });
});
"
```

### Xem file cache

```bash
sqlite3 .knowsync/graph.db \
  "SELECT file_path, substr(content_hash,1,8) as hash, datetime(indexed_at/1000,'unixepoch') as time FROM file_cache LIMIT 20;"
```

### Xem edges của một symbol

```bash
sqlite3 .knowsync/graph.db "
SELECT e.type, s1.name AS src, s2.name AS tgt, e.is_manual
FROM edges e
JOIN symbols s1 ON s1.id = e.source_id
JOIN symbols s2 ON s2.id = e.target_id
WHERE s1.name = 'runIndex' OR s2.name = 'runIndex'
LIMIT 20;
"
```

### Xem parse_rules trong DB

```bash
sqlite3 .knowsync/graph.db \
  "SELECT language, rule_type, name, node_type, priority FROM parse_rules ORDER BY language, priority DESC;"
```

### Xem doc_sections

```bash
sqlite3 .knowsync/graph.db \
  "SELECT heading, slug, heading_level, file_path FROM doc_sections LIMIT 20;"
```

### Test MCP tools qua stdio

```bash
# Liệt kê tất cả tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  node dist/cli/index.js mcp /path/to/project

# Gọi một tool cụ thể
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"knowsync_search_graph","arguments":{"query":"runIndex"}}}' | \
  node dist/cli/index.js mcp /path/to/project
```

### Test endpoint viz server

```bash
# Sau khi knowsync viz đang chạy tại port 4242:

# Lấy danh sách projects
curl http://localhost:4242/api/projects

# Tìm kiếm
curl "http://localhost:4242/api/search?q=runIndex&project=<id>"

# Doc graph cho Visual Docs tab
curl "http://localhost:4242/api/doc-graph?project=<id>"
curl "http://localhost:4242/api/doc-graph?pattern=indexer&project=<id>"

# Suggest links cho một symbol
curl "http://localhost:4242/api/suggest-links?name=runIndex&project=<id>"

# Validate links
curl "http://localhost:4242/api/validate-links?project=<id>"
```

---

## 11. Một số lưu ý khi phát triển

### Tree-sitter: named vs anonymous nodes

Tree-sitter có hai loại node:
- **Named nodes**: `function_declaration`, `identifier`, ... — dùng `node.namedChild(i)` hoặc `node.childForFieldName('name')`
- **Anonymous nodes**: `(`, `)`, `{`, `;`, ... — tránh extract từ chúng

Luôn dùng `node.childForFieldName('name')` thay vì `node.child(0)` để lấy tên chính xác, vì index của children có thể thay đổi giữa các phiên bản grammar.

### remark: SKIP constant

Khi dùng `unist-util-visit`, phải `return SKIP` sau khi xử lý một block node (paragraph, list, code) để tránh visitor descend vào children và count text hai lần:

```typescript
import { visit, SKIP } from 'unist-util-visit';

visit(tree, (node) => {
  if (node.type === 'paragraph') {
    // xử lý paragraph...
    return SKIP;  // ← quan trọng: không descend vào children
  }
});
```

### better-sqlite3: synchronous API

`better-sqlite3` hoàn toàn synchronous — không có async/await. Đây là thiết kế chủ ý: SQLite operations trong Node.js single-thread hiệu quả nhất khi synchronous. Không bao giờ `await` một statement của better-sqlite3.

### ESM + CJS interop

`graphology`, `graphology-communities-louvain`, `better-sqlite3`, `ignore` đều là CJS packages. Dùng `createRequire` và handle `default` export:

```typescript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const lib = require('some-cjs-lib') as any;
const actualExport = lib.default ?? lib;
```

### marked.js: UMD global

Trong UI public, `marked` được load từ `/vendor/marked.umd.js` và expose global `marked`. Runtime hiện được tách thành nhiều file `app*.js`, với bootstrap core nằm trong `app.js`. Khi cần render Markdown:

```javascript
// Render Markdown → HTML
const html = marked.parse(markdownString);
container.innerHTML = html;
```

### is_manual edges: không bao giờ xóa bằng deleteByFilePath

Khi thêm code mới xóa edges, luôn thêm điều kiện `AND (is_manual = 0 OR is_manual IS NULL)` để bảo vệ manual links do AI tạo ra.

### resolveDb vs resolve trong viz server

Trong `src/viz/server.ts`, hàm helper resolve DB có tên `resolveDb` — KHÔNG phải `resolve`. Tên `resolve` đã bị `path.resolve` từ Node.js `path` module chiếm dụng cùng scope. Luôn dùng `resolveDb(req)` khi cần lấy GraphDB instance trong endpoint handlers.
