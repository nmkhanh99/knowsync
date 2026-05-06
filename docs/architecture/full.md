# Kiến trúc KnowSync

## 1. Tổng quan

KnowSync phân tích tĩnh repo (code + docs) và lưu kết quả vào SQLite dạng knowledge graph. Ngoài parser tĩnh (Tree-sitter + remark), AI agent có thể cung cấp Tree-sitter S-expression rules qua MCP để mở rộng khả năng nhận diện symbols. MCP server hiện expose graph qua 27 tools để AI bên ngoài truy vấn, preview rules, quản lý RuleSets và đồng bộ docs-link workflow.

Khi đọc tài liệu này, agent nên bám trực tiếp các symbol thật như `@runIndex`, `@parseCodeFile`, `@parseDocFile`, `@GraphDB`, `@getDocVisualization` và `[[doc:../guide/11-4-7-tab-visual-docs.md#links-view]]` để tạo edge giữa docs ↔ code và docs ↔ docs. Quy ước traceability hiện dùng các ID kiểu `BRD-REQ-001`, `PRD-UI-002`, `FRD-TRACE-003`.

---

## 2. Pipeline tổng thể

```
┌─────────────────────────────────────────────────────────────────┐
│                         Repo Files                               │
│          (*.ts, *.js, *.py, docs/**/*.md, wiki/*.md, ...)       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ FileCrawler  │  glob + .gitignore
                    │              │  codeSources + docSources
                    │              │  SHA-256 content hash
                    └──────┬──────┘
                           │
             ┌─────────────┴─────────────┐
             │                           │
      ┌──────▼──────┐             ┌──────▼──────┐
      │  CodeParser  │             │  DocsParser  │
      │ (Tree-sitter)│             │   (remark)   │
      │              │             │              │
      │ Built-in     │             │ Markdown AST │
      │ patterns +   │             │ → DocSection │
      │ RulesEngine  │             │   nodes      │
      │ (AI rules)   │             │              │
      │              │             │ @ref/[[link]]│
      │ PendingCalls │             │   → REFERENCES│
      │ (cross-file) │             │              │
      └──────┬──────┘             └──────┬──────┘
             │                           │
             └─────────────┬─────────────┘
                           │ Pass 2: resolvePendingCalls
                           │ (cross-file CALLS edges)
                    ┌──────▼──────┐
                    │   GraphDB    │  better-sqlite3 11
                    │              │  WAL mode
                    │  symbols     │
                    │  doc_sections│
                    │  edges       │
                    │  parse_rules │
                    │  file_cache  │
                    │  FTS5 index  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Clustering  │  Louvain algorithm
                    │              │  graphology 0.25
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐     │     ┌──────▼──────┐
       │  MCP Server  │     │     │  Viz Server  │
       │  stdio       │     │     │  Express     │
       │  27 tools    │     │     │  43 routes   │
       └──────┬──────┘     │     └──────┬──────┘
              │             │            │
   ┌──────────┴───┐         │     ┌──────▼──────┐
   │  Claude AI   │         │     │   Web UI     │
   │  Cursor      │         │     │   8 tabs     │
   │  Windsurf    │         │     │   Sigma.js   │
   └──────────────┘         │     │   marked.js  │
                            │     └─────────────┘
                    ┌───────▼──────┐
                    │  CLI (8 cmds) │
                    │  Commander 12 │
                    └──────────────┘
```

---

## 3. FileCrawler

**File:** `src/indexer/file-crawler.ts`

**Nhiệm vụ:** Quét thư mục, phân loại file code vs doc, tính SHA-256 hash cho delta indexing.

```
crawlRepo(languages?, docSources?, codeSources?)
  → { codeFiles: CrawledFile[], docFiles: CrawledFile[] }
```

### source boundary logic

`codeSources` và `docSources` được đọc từ registry hoặc project config theo từng project:

```
codeSources = project.codeSources  (array of { path, label? })
docSources  = project.docSources   (array of { path, label? })
```

- `Code Sources` là phạm vi duy nhất để quét code
- `Doc Sources` là phạm vi duy nhất để quét tài liệu
- nếu thiếu `Code Sources`, `@runIndex` sẽ từ chối index code
- nếu bật docs mà thiếu `Doc Sources`, `@runIndex` sẽ từ chối index docs
- không còn fallback quét toàn repo cho code hoặc docs

### CrawledFile

```typescript
interface CrawledFile {
  filePath: string;       // absolute path
  language: string;       // "typescript" | "javascript" | "python" | "markdown"
  contentHash: string;    // SHA-256(fileContent) — hex string
  lastModified: number;   // Date.now()
}
```

### LANGUAGE_EXTENSIONS

```
.ts / .tsx  → "typescript"
.js / .jsx  → "javascript"
.py         → "python"
.md         → "markdown"
```

---

## 4. CodeParser + RulesEngine

**File:** `src/indexer/code-parser.ts`, `src/indexer/rules-engine.ts`

**Nhiệm vụ:** Parse file code bằng Tree-sitter, trích xuất symbols/edges built-in, dựng embedded docs từ comment/docstring, rồi áp thêm AI-provided parse rules và artifacts.

### Luồng xử lý

```
@parseCodeFile(filePath, language, contentHash, lastModified, parseRules, parseArtifacts)
  1. Đọc source
  2. getParser(language) → grammar JS / TS / Python
  3. parser.parse(source) → Tree-sitter AST
  4. walkNode(rootNode, ctx)
     - tryExtractSymbol(node)
     - push/pop scopeStack cho function-like symbols
     - gom deferredCalls, IMPORTS, inheritance/export relations
  5. resolveCallEdges(ctx)
  6. buildEmbeddedDocs(ctx.nodes)
  7. @applyDocLinkRules(tree, filePath, language, parseRules)
  8. @applyParseArtifacts(tree, filePath, language, parseArtifacts)
  9. merge embedded docs + embedded regions
```

### Scope stack

`scopeStack` chỉ theo function-like owners. `call_expression` và `new_expression` được gán caller theo frame trên cùng của stack.

### Pending calls

Callee chưa tìm thấy trong file hiện tại → đẩy vào `pendingCalls` để `@runIndex` resolve ở pass 2.

### Built-in symbols — JavaScript/TypeScript

| AST node type | NodeType |
|---------------|----------|
| `function_declaration` | Function |
| `arrow_function` trong `variable_declarator` | Function |
| `class_declaration` | Class |
| `method_definition` | Method |
| `import_statement` | Module |
| `interface_declaration` | Interface |
| `type_alias_declaration` | Type |
| `lexical_declaration` / `variable_declaration` | Variable |
| `export_statement` | Export |

### Built-in symbols — Python

| AST node type | NodeType |
|---------------|----------|
| `function_definition` | Function |
| `class_definition` | Class |
| `decorated_definition` bao function | Function / Method |

### RulesEngine runtime

`src/indexer/rules-engine.ts` hiện là tập các hàm thuần:

- `@applyParseRules`: sinh thêm `nodes` và `edges` từ `node`/`edge` rules
- `@applyDocLinkRulesDetailed`: sinh `DocSection` từ `doc_link` rules và trả `matchDetails`, `queryErrors`
- `@applyParseArtifacts`: xử lý `injection_query` và `included_ranges`

Rule types runtime hiện có: `node`, `edge`, `resolve`, `linking`, `doc_link`.

Artifact types runtime hiện có: `injection_query`, `included_ranges`.

Rules từ AI bổ sung cho built-in parser, không thay thế built-in parser.

---

## 5. DocsParser

**File:** `src/indexer/docs-parser.ts`

**Nhiệm vụ:** Parse Markdown, phân đoạn theo heading, trích xuất symbol references và doc references nhiều tầng.

### Luồng xử lý

```
parseDocFile(filePath, contentHash, lastModified)
  1. readFile → source string
  2. unified().use(remarkParse).parse(source) → Markdown AST (remark 15)
  3. visit(tree, ...) — single-pass với SKIP để tránh double-count
  4. Mỗi heading node → DocSection mới:
     - heading: text content của heading
     - slug: slugify(heading) — dùng để tạo anchor
     - headingLevel: 1–6 (h1–h6)
     - content: accumulated text đến heading tiếp theo
     - start_line / end_line: vị trí trong file
  5. Trích xuất trace references từ content:
     - @symbolName / [[SymbolName]] → doc -> code
     - @doc:path#slug / [[doc:path#slug]] → doc -> doc
     - @doc:#slug / [[doc:#slug]] → same-file doc -> doc
  6. Trả về ParsedDoc { sections }
```

### DocSection schema

```typescript
interface DocSection {
  id: string;           // "doc:" + SHA1(filePath:heading:startLine)[0:16]
  file_path: string;
  heading: string;
  slug: string;         // lowercase, hyphens (dùng cho anchor links)
  heading_level: number; // 1–6
  content: string;      // full Markdown text của section
  metadata?: Record<string, unknown>; // provenance, sourceArtifact, traceability extras
  start_line: number;
  end_line: number;
}
```

`slug` được lưu trong DB và exposed qua MCP tool `knowsync_get_doc_section_content` — AI có thể dùng slug để tạo deep links đến docs.
`metadata.sourceArtifact` được gắn khi DocSection sinh từ `injection_query` hoặc `included_ranges`; Visual Docs và preview trả trực tiếp provenance này để drill vào injected Markdown region root trước khi đi xuống sections con.

Ngoài `linkedSymbols`, metadata của DocSection còn mang `primarySymbolName`, `linkedDocTargets`, `linkedRequirements`. Sau khi persist toàn bộ docs, index chạy thêm pass resolve để tạo edge `REFERENCES_DOC`.

Khi agent chỉnh docs/code format để tăng linkability, ưu tiên:
- viết `@runIndex`, `@parseCodeFile`, `@GraphDB` trong Markdown thay vì chỉ nói "hàm này" / "lớp này"
- thêm `[[Visual Docs]]`, `[[Module overview]]`, `[[Requirements Trace]]` cho các section liên quan
- gắn requirement IDs BRD/PRD/FRD vào heading hoặc đoạn mô tả để tạo traceability bền

---

## 6. GraphDB — Schema đầy đủ

**File:** `src/graph/db.ts`

**Storage:** better-sqlite3 11, WAL mode, multi-project trong một central DB bằng `project_id`.

`@GraphDB` hiện không chỉ lưu symbols/docs/edges. Nó còn lưu parse rules, parse artifacts, RuleSets, doc-link marks, project config và refine sessions cho parse rules.

### Tables

```sql
symbols
doc_sections
edges
doc_link_marks
file_cache
parse_rules
parse_artifacts
rule_sets
rule_links
project_config
parse_rule_refine_sessions
symbols_fts
docs_fts
```

### Schema notes

- Hầu hết bảng đều có `project_id`
- `doc_sections` có `slug`, `heading_level`, `metadata_json`
- `edges` có `is_manual`
- `parse_rules` có thêm `pack_name`, `doc_capture`, `symbol_capture`
- `parse_artifacts` lưu `injection_query` và `included_ranges`
- `rule_sets` và `rule_links` phục vụ inheritance / override / inject
- `doc_link_marks` lưu các thao tác link/unlink phát sinh từ UI

### FTS5 Virtual Tables

```sql
-- External content FTS5 (không lưu nội dung riêng, dùng content từ bảng gốc)
CREATE VIRTUAL TABLE symbols_fts USING fts5(
  name, signature, doc_string,
  content='symbols', content_rowid='rowid'
);

CREATE VIRTUAL TABLE docs_fts USING fts5(
  heading, content,
  content='doc_sections', content_rowid='rowid'
);
```

Vì dùng external content, 6 triggers tự động đồng bộ FTS index:

```
symbols_ai  — AFTER INSERT ON symbols
symbols_au  — AFTER UPDATE ON symbols
symbols_ad  — AFTER DELETE ON symbols
docs_ai     — AFTER INSERT ON doc_sections
docs_au     — AFTER UPDATE ON doc_sections
docs_ad     — AFTER DELETE ON doc_sections
```

### WAL mode

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```

Cho phép concurrent reads (nhiều connections đọc đồng thời trong khi một connection đang ghi).

### is_manual flag

Khi re-index xóa và rebuild nodes của một file, `deleteByFilePath` chỉ xóa edges có `is_manual = 0`:

```typescript
// Chỉ xóa auto-generated edges
DELETE FROM edges
WHERE (source_id IN (...) OR target_id IN (...))
  AND (is_manual = 0 OR is_manual IS NULL)
```

Edges với `is_manual = 1` (tạo qua `knowsync_create_doc_link`) tồn tại vĩnh viễn — chỉ mất khi cả hai đầu (DocSection + Symbol) đều bị xóa.

### Migrations

`GraphDB.init()` tự động tạo schema, migrate DB cũ, rồi backfill FTS khi cần.

### BM25 Search

```sql
-- searchSymbols
SELECT s.*, bm25(symbols_fts) AS score
FROM symbols_fts
JOIN symbols s ON s.rowid = symbols_fts.rowid
WHERE symbols_fts MATCH ?
ORDER BY score;

-- searchDocs
SELECT d.*, bm25(docs_fts) AS score
FROM docs_fts
JOIN doc_sections d ON d.rowid = docs_fts.rowid
WHERE docs_fts MATCH ?
ORDER BY score;
```

`bm25()` trả giá trị âm — gần 0 hơn là relevance cao hơn. Helper `toFtsQuery`:

```typescript
toFtsQuery('runIndex')    → '"runIndex"*'
toFtsQuery('run index')  → '"run"* "index"*'
```

Dấu `*` cho phép prefix matching (`run` khớp `runIndex`, `runner`, ...).

### Node types và Edge types

**Node types:** Function · Class · Method · Module · Interface · Type · Variable · Export · DocSection · Heading · Requirement

**Edge types:** CALLS · IMPORTS · DOCUMENTED_BY · REFERENCES · REFERENCES_DOC · EXPLAINS_FLOW · EXPORTS · INHERITS · IMPLEMENTS · SATISFIES

---

## 7. Viz Server — 43 routes

**File:** `src/viz/server.ts`

`@startVizServer` là REST facade và host cho Web UI. Runtime hiện có **43 routes** tính cả SPA fallback `GET *`.

Nó nhận `initialProjects: ProjectEntry[]`, mở một `GraphDB` connection cho mỗi project, rồi resolve mọi request theo `?project=<id>`.

### Các nhóm route chính

- Project lifecycle: `/api/projects`, `/api/browse`, `/api/index`, `/api/index-all`, `/api/mcp-config`
- Parse rules + RuleSets: `/api/provide-parse-rules`, `/api/validate-parse-rules`, `/api/rule-sets*`, `/api/rule-links*`
- Graph + docs queries: `/api/graph`, `/api/search`, `/api/symbol`, `/api/symbol-by-id`, `/api/impact`, `/api/flow`, `/api/doc-flow`, `/api/module`, `/api/docsync`, `/api/validate`, `/api/doc-graph`, `/api/doc-neighborhood`, `/api/all-links`, `/api/forward-refs`, `/api/validate-links`
- Visual Docs config: `/api/doc-sources/scan`, `/api/visual-docs-config`
- Docs linking: `/api/suggest-links`, `/api/create-doc-link`, `/api/unlink-doc`, `/api/doc-link-marks`, `/api/doc-link-marks/:id/resolve`
- SPA fallback: `GET *`

---

## 8. MCP Server — 27 tools

**File:** `src/mcp/server.ts` và `src/mcp/tools/`

**Transport:** `StdioServerTransport` — nhận JSON-RPC qua stdin, trả kết quả qua stdout.

**SDK:** `@modelcontextprotocol/sdk` 1.12.

Tools đăng ký qua:

```typescript
server.tool(name, description, zodSchema, handler)
```

### Group 1 — Graph query và context

| Tool | File | Mô tả |
|------|------|-------|
| `knowsync_get_symbol` | `tools/get-symbol.ts` | Thông tin chi tiết symbol |
| `knowsync_get_callers` | `tools/get-callers.ts` | Callers của function |
| `knowsync_get_linked_docs` | `tools/get-linked-docs.ts` | Docs liên kết với symbol |
| `knowsync_get_impact` | `tools/get-impact.ts` | Impact analysis (direct + transitive + docs) |
| `knowsync_get_process_flow` | `tools/get-process-flow.ts` | Call flow trace từ entry point |
| `knowsync_get_doc_flow_trace` | `tools/get-doc-flow-trace.ts` | Trace flow từ tài liệu xuống linked symbols và CALLS flow trong code |
| `knowsync_search_graph` | `tools/search-graph.ts` | BM25 full-text search |
| `knowsync_check_doc_sync` | `tools/check-doc-sync.ts` | Doc sync check (docstring + linked docs) |
| `knowsync_get_module_overview` | `tools/get-module-overview.ts` | Module overview |
| `knowsync_get_doc_section_content` | `tools/get-doc-section.ts` | Nội dung Markdown đầy đủ + slug + trace metadata + `relatedDocs` + `beforeDocs` + `afterDocs` |
| `knowsync_get_full_context` | `tools/get-full-context.ts` | Rich context: callers + callees + docs + siblings |
| `knowsync_get_doc_visualization` | `tools/get-doc-visualization.ts` | Doc subgraph (DocSections + embeddedDocRegions + linked Symbols + doc-to-doc edges) |
| `knowsync_get_requirement_trace` | `tools/get-requirement-trace.ts` | Trace requirement ↔ code ↔ docs |

### Group 2 — Docs linking và regeneration

| Tool | File | Mô tả |
|------|------|-------|
| `knowsync_suggest_doc_links` | `tools/suggest-doc-links.ts` | Gợi ý links chưa được tạo |
| `knowsync_create_doc_link` | `tools/create-doc-link.ts` | Tạo REFERENCES edge (`is_manual=1`) |
| `knowsync_validate_links` | `tools/validate-links.ts` | Tìm stale edges + coverage stats |
| `knowsync_get_doc_link_marks` | `tools/get-doc-link-marks.ts` | Lấy pending marks để phản ánh vào markdown gốc |
| `knowsync_resolve_doc_link_mark` | `tools/resolve-doc-link-mark.ts` | Đánh dấu mark đã được sửa ngoài source |
| `knowsync_regenerate_doc` | `tools/regenerate-doc.ts` | Tạo/cập nhật DocSection với AI content |

### Group 3 — Parse rules runtime

| Tool | File | Mô tả |
|------|------|-------|
| `knowsync_provide_parse_rules` | `tools/provide-parse-rules.ts` | AI đẩy Tree-sitter S-expression rules vào DB |
| `knowsync_preview_parse_rules` | `tools/preview-parse-rules.ts` | Preview rules/query packs/artifacts trên file thật |
| `knowsync_preview_apply_parse_rules` | `tools/preview-apply-parse-rules.ts` | Preview nhiều vòng rồi apply/index nếu sạch |
| `knowsync_build_graph` | `tools/build-graph.ts` | Trigger index + áp dụng rules |

### Group 4 — Doc source và Visual Docs config

| Tool | File | Mô tả |
|------|------|-------|
| `knowsync_scan_doc_sources` | `tools/scan-doc-sources.ts` | Quét candidate Markdown sources |
| `knowsync_set_visual_docs_config` | `tools/set-visual-docs-config.ts` | Lưu codeSources/docSources/visualDocs config |

### Group 5 — RuleSet orchestration

| Tool | File | Mô tả |
|------|------|-------|
| `knowsync_rule_sets` | `tools/rule-sets.ts` | CRUD RuleSet, inheritance, resolved chain |
| `knowsync_rule_links` | `tools/rule-links.ts` | Quản lý dependency links giữa RuleSets |

### Error handling

Mọi tool handler đều được bọc bởi `wrap()`:

```typescript
function wrap(handler) {
  return async (args) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await handler(args), null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  };
}
```

---

## 9. Web UI — 8 tabs

**Files:** `src/viz/public/index.html`, `src/viz/public/app.js`

SPA không dùng framework. `index.html` là shell, `app.js` là runtime chính. Vendor dependencies:

- **Sigma.js 2** (UMD, `vendor/sigma.min.js`) — WebGL graph rendering
- **graphology UMD** (`vendor/graphology.umd.min.js`) — in-memory graph cho Sigma
- **marked 18** (UMD, `vendor/marked.umd.js`) — Markdown → HTML rendering (offline, không dùng CDN)

Tất cả vendor files được copy từ `node_modules` vào `dist/viz/public/vendor/` trong bước build.

### Tab 1 — Graph

Sigma.js WebGL renderer. Index toolbar nhúng trực tiếp trong tab. Click node → panel phải hiển thị metadata, callers, callees, linked docs, và quick-jump buttons (Impact / Flow).

### Tab 2 — Search

FTS5/BM25 search. Type filter pills. Expandable symbol detail cards với callers/callees/docs.

### Tab 3 — Impact

Phân tích impact per symbol: direct callers, transitive callers (theo depth), linked docs.

### Tab 4 — Flow

Trace call chain từ entry point. Kết quả dạng cây indent.

### Tab 5 — Module

Module overview theo file/path pattern. Số symbols, top-called, danh sách nhóm theo file.

### Tab 6 — Docs

4 sub-sections:
- **Coverage**: undocumented symbols với "Suggest Links" button → suggestions → "Link" button
- **Linked Docs**: tìm docs đã liên kết với symbol
- **Doc Sync**: kiểm tra docstring + linked docs status
- **Validate Links**: tìm stale doc→symbol edges (click "Check")

### Tab 7 — Visual Docs

Doc-centric graph riêng biệt (Sigma.js instance thứ hai). Filter bar: pattern + type pills. Injected Markdown xuất hiện thành `EmbeddedDocRegion` root node trước, rồi mới drill xuống nested `DocSection` children. Click panel hiển thị Markdown content (render bằng marked.js), `sourceArtifact`, `path`/`parentHeading`, linked symbols, related docs, và slug anchors cho mỗi DocSection.

`Visual Docs -> Links` hiện lấy cả subtree con của DocSection đang chọn. Cạnh doc -> doc dùng `REFERENCES_DOC`, còn doc -> code tiếp tục dùng `REFERENCES` hoặc `DOCUMENTED_BY`.

### Tab 8 — MCP

Config JSON sẵn sàng copy-paste cho Claude Desktop, Cursor, Windsurf. Lấy từ `/api/mcp-config`.

---

## 10. CLI — 8 commands

**File:** `src/cli/index.ts` + `src/cli/commands/`

Commander 12. Entry point: `dist/cli/index.js`.

| Command | File | Mô tả |
|---------|------|-------|
| `init [path]` | `commands/init.ts` | Tạo `knowsync.config.json` |
| `register [path]` | `commands/register.ts` | Đăng ký project (`--docs-source` repeatable; `codeSources` cấu hình qua UI/MCP) |
| `unregister <id>` | `commands/register.ts` | Bỏ đăng ký project |
| `list` | `commands/register.ts` | Liệt kê tất cả projects |
| `index [path]` | `commands/index-cmd.ts` | Index (--docs, --delta, --all) |
| `validate [path]` | `commands/validate.ts` | Tìm symbols thiếu docs |
| `viz [path]` | `commands/viz.ts` | Start viz server (load tất cả từ registry nếu không có path) |
| `mcp` | `commands/mcp-cmd.ts` | Start MCP server stdio |

### Registry

`src/cli/registry.ts` quản lý `~/.knowsync/registry.json`:

```typescript
interface RegisteredProject {
  id: string;          // stable id derived from code or source signature
  name: string;
  docSources: Array<{ path: string; label?: string }>;
  codeSources?: Array<{ path: string; label?: string }>;
  registeredAt: number;
}
```

---

## 11. Delta Indexing

```
Index lần 1 (full):
  File A (hash: aaa) → index → lưu file_cache(A, aaa)
  File B (hash: bbb) → index → lưu file_cache(B, bbb)

Index lần 2 (--delta):
  File A (hash: aaa) → isFileCached(A, aaa) = true → SKIP
  File B (hash: ccc, đã thay đổi) → isFileCached(B, ccc) = false → index lại
  File C (mới)       → isFileCached(C, ...) = false → index
```

---

## 12. Two-Pass Call Resolution

**Tại sao cần 2 pass?**

Khi parse `A.ts`, hàm `foo()` gọi `bar()`. Nếu `bar` định nghĩa trong `B.ts` (chưa parse), không thể tạo edge ngay.

**Pass 1** (per file): Nếu callee không tìm thấy trong file hiện tại:

```typescript
pendingCalls.push({ callerId: foo.id, calleeName: 'bar' })
```

**Pass 2** (sau khi tất cả files parse xong):

```typescript
resolvePendingCalls(db, allPendingCalls):
  for calleeName in unique(pendingCalls):
    callees = db.getSymbolByName(calleeName)  // tìm trong tất cả files
    for caller in callerIds:
      for callee in callees:
        db.upsertEdge(caller →CALLS→ callee)
```

---

## 13. Node ID và Edge ID

```
nodeId = SHA1("filePath:name:startLine").hex[0:16]
  e.g. "src/graph/db.ts:upsertNode:69" → "a3f4b2c1d5e60718"

docId = "doc:" + SHA1("filePath:heading:startLine").hex[0:16]
  e.g. "doc:a1b2c3d4e5f6a7b8"

edgeId = "${sourceId}->${TYPE}->${targetId}"
  e.g. "a3f4b2c1d5e60718->CALLS->b2c3d4e5f6a7b8c9"
  → Unique per (source, type, target)
  → INSERT OR IGNORE tránh duplicate
```

---

## 14. Clustering

**File:** `src/graph/clustering.ts`

```typescript
clusterGraph(graph: InMemoryGraph): ClusterResult[]
  → Louvain community detection (graphology-communities-louvain)
  → { nodeId, clusterId: string }[]

persistClusters(db, clusters)
  → db.setClusterId(nodeId, clusterId) cho từng node
```

Louvain tự động phát hiện modules chức năng dựa trên cấu trúc CALLS + IMPORTS edges.

**Cluster naming:** Sau khi Louvain gán cluster number, tìm node có degree cao nhất trong mỗi cluster → tên node đó trở thành `clusterId` (readable label thay vì số nguyên).

---

## 15. Dependency stack

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
