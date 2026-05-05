# 15. Dependency stack

| Package | Version | Mục đích |
|---------|---------|---------|
| `tree-sitter` | 0.22.x | Native parser bindings |
| `tree-sitter-javascript` | 0.23.x | JS/TS grammar |
| `tree-sitter-typescript` | 0.23.x | TypeScript grammar |
| `tree-sitter-python` | 0.23.x | Python grammar |
| `better-sqlite3` | 11.x | SQLite synchronous, embedded |
| `graphology` | 0.25.x | In-memory directed graph |
| `graphology-communities-louvain` | 2.0.x | Louvain clustering |
| `@modelcontextprotocol/sdk` | 1.12.x | MCP server |
| `remark` + `remark-parse` | 15.x | Markdown AST (unified ecosystem) |
| `unist-util-visit` | 5.x | AST visitor |
| `commander` | 12.x | CLI |
| `express` | 4.x | Viz HTTP server |
| `sigma` | 2.x | WebGL graph renderer (UMD, bundled offline) |
| `marked` | 18.x | Markdown → HTML (UMD, bundled offline) |
| `zod` | 3.x | MCP tool schema validation |
| `ignore` | 6.x | .gitignore parsing |

**Vendor bundling:** `sigma`, `graphology` và `marked` UMD builds được copy từ `node_modules` vào `dist/viz/public/vendor/` trong bước build — Web UI load từ `/vendor/` thay vì CDN để hoạt động offline.
