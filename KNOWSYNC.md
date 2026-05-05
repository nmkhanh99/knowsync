# KnowSync — Knowledge Graph + MCP Tool

**Phiên bản:** MVP 1.0 (2026)  
**Mục tiêu:** KnowSync là Graph Storage & Execution Engine. AI Agent cung cấp **parse rules** (Tree-sitter S-expression queries, resolve rules, linking rules). KnowSync dùng rules đó để parse, liên kết và xây graph cho từng project.

---

## Thiết kế

**AI Agent** đọc source code → phân tích → đưa ra quy tắc parse qua MCP.  
**KnowSync** nhận quy tắc → áp dụng vào Tree-sitter → parse code → xây graph → lưu vào SQLite (LadybugDB/Kuzu theo roadmap).

```
Code Files (.ts/.js/.py)   Markdown Docs (.md)
         │                         │
  Tree-sitter + AI Rules       remark AST
         │                         │
         └────────────┬────────────┘
                      │
            Knowledge Graph
          (SQLite + FTS5 BM25)
          ┌──────────────────┐
          │ symbols          │
          │ doc_sections     │
          │ edges (is_manual)│
          │ parse_rules      │  ← AI-provided rules
          │ file_cache       │
          └──────────────────┘
                      │
               ┌──────┴──────┐
               │             │
           MCP Server    Viz Server
           26 tools       Express
               │             │
           AI Agents      Web UI
    (Claude/Cursor/       8 tabs
       Windsurf)        Sigma.js
```

---

## Cài đặt

```bash
npm install --legacy-peer-deps
npm run build
npm link
```

---

## Quản lý nhiều project

```bash
knowsync register /path/to/project-a
knowsync list
knowsync index --all --docs
knowsync viz
```

---

## Web UI — 8 tabs

| Tab | Chức năng |
|-----|-----------|
| **◉ Graph** | Graph tổng thể |
| **⌕ Search** | BM25/FTS5 search |
| **⚑ Impact** | Impact analysis |
| **⟶ Flow** | Call chain trace |
| **▤ Module** | Module overview |
| **📄 Docs** | Coverage · Linked Docs · Doc Sync |
| **🔗 Visual Docs** | Doc-centric graph + Markdown render |
| **⬡ MCP** | Config JSON |

---

## Liên kết docs ↔ code

**Tự động:** Parser nhận biết `@symbol` và `[[Symbol]]` trong `.md`.

**Code comment docs:** KnowSync cũng trích `/** ... */`, `/// ...` và Python docstring thành `DocSection` nội bộ, render như Markdown và tự tạo `DOCUMENTED_BY` / `REFERENCES` edges cho symbol liên quan.

**Linkability baseline:** Khi viết docs hoặc comment, ưu tiên gọi thẳng tên symbol như `@runIndex`, `@parseCodeFile`, `@getDocVisualization`, `@createDocLink`. Với yêu cầu nghiệp vụ, dùng ID rõ ràng như `BRD-REQ-001`, `PRD-UI-002`, `FRD-TRACE-003` để `knowsync_get_requirement_trace` có thể nối requirement ↔ code ↔ docs.

**AI-Assisted:** AI dùng 3 tools để gợi ý và tạo links:
```
knowsync_suggest_doc_links → gợi ý
knowsync_create_doc_link   → tạo REFERENCES edge
knowsync_validate_links    → kiểm tra stale links
```

**AI-Generated Docs:** AI dùng `knowsync_regenerate_doc` để tạo/cập nhật DocSection với content mới.

Links `is_manual=1` không bị xóa khi re-index.

---

## AI Parse Rules

AI Agent cung cấp rules qua `knowsync_provide_parse_rules`:

```json
{
  "language": "typescript",
  "queryPacks": [
    {
      "name": "ts-doc-comments",
      "packType": "comment_doc_linking",
      "rules": [
        {
          "name": "jsdoc_function",
          "ruleType": "doc_link",
          "query": "((comment) @doc . (function_declaration name: (identifier) @symbol))",
          "docCapture": "doc",
          "symbolCapture": "symbol"
        }
      ]
    }
  ],
  "artifacts": [
    {
      "name": "ts-markdown-injections",
      "artifactType": "injection_query",
      "content": "((comment) @injection.content (#set! injection.language \"markdown\"))",
      "targetLanguage": "markdown"
    },
    {
      "name": "tsx-doc-ranges",
      "artifactType": "included_ranges",
      "query": "((comment) @range)",
      "rangeCapture": "range"
    }
  ]
}
```

Sau đó gọi `knowsync_build_graph` để KnowSync áp dụng rules và xây graph.

---

## 17 MCP Tools

### 9 Tools đọc (read-only)

| Tool | Mô tả |
|------|-------|
| `knowsync_get_symbol` | Thông tin symbol |
| `knowsync_get_callers` | Callers của function |
| `knowsync_get_linked_docs` | Docs liên kết với symbol |
| `knowsync_get_impact` | Impact analysis |
| `knowsync_get_process_flow` | Call chain trace |
| `knowsync_search_graph` | BM25 search |
| `knowsync_check_doc_sync` | Doc sync check |
| `knowsync_get_module_overview` | Module overview |
| `knowsync_get_doc_section_content` | Full Markdown content + slug |
| `knowsync_get_full_context` | Rich context: callers + callees + docs + module |
| `knowsync_get_doc_visualization` | Doc subgraph cho visualization |
| `knowsync_get_requirement_trace` | Truy vết requirement ↔ code ↔ docs |

### Tools AI-Assisted Linking

| Tool | Mô tả |
|------|-------|
| `knowsync_suggest_doc_links` | Gợi ý links chưa được tạo |
| `knowsync_create_doc_link` | Tạo REFERENCES edge thủ công |
| `knowsync_validate_links` | Tìm stale links |
| `knowsync_get_doc_link_marks` | Lấy pending marks cần phản ánh vào markdown gốc |
| `knowsync_resolve_doc_link_mark` | Đánh dấu mark đã được sửa trong source docs |

### Tools Rules-Based Build

| Tool | Mô tả |
|------|-------|
| `knowsync_provide_parse_rules` | AI đẩy Tree-sitter S-expression rules |
| `knowsync_preview_parse_rules` | Preview rules/query packs/artifacts trên file thật |
| `knowsync_preview_apply_parse_rules` | Preview nhiều vòng rồi apply/index nếu sạch |
| `knowsync_build_graph` | Trigger parse + xây graph theo rules |
| `knowsync_regenerate_doc` | Tạo/cập nhật DocSection với AI content |
| `knowsync_scan_doc_sources` | Quét candidate Markdown sources |
| `knowsync_set_visual_docs_config` | Lưu codeSources/docSources/visualDocs config |
| `knowsync_rule_sets` | CRUD RuleSets, inheritance, resolved chain |
| `knowsync_rule_links` | Quản lý dependency links giữa RuleSets |

### Traceability

KnowSync nhận biết requirement IDs dạng `BRD-*`, `PRD-*`, `FRD-*` trong Markdown docs, code comments và docstrings. Khi index:

- tạo node `Requirement`
- tạo edge `SATISFIES` từ symbol code tới requirement
- tạo edge `DOCUMENTED_BY` từ doc section tới requirement

MCP tool `knowsync_get_requirement_trace` cho phép truy vết hai chiều requirement ↔ code ↔ docs.

---

## MCP Config

```json
{
  "mcpServers": {
    "knowsync": {
      "command": "node",
      "args": ["/path/to/knowsync/dist/cli/index.js", "mcp", "/path/to/your-repo"]
    }
  }
}
```

---

## Tech Stack

| Thành phần | Package | Ghi chú |
|------------|---------|---------|
| Code parser | tree-sitter 0.22 | JS/TS/Python + AI rules |
| Docs parser | remark 15 | @ref + [[wiki]] |
| MD renderer | marked 18 (UMD) | Offline vendor |
| Graph DB | better-sqlite3 11 + FTS5 | WAL mode, BM25 |
| Clustering | graphology + Louvain | Auto cluster naming |
| MCP server | @modelcontextprotocol/sdk 1.12 | stdio, 26 tools |
| Web UI | Sigma.js 2 + graphology UMD | WebGL, offline |
| CLI | Commander 12 | 8 commands |

Node types: `Function` · `Class` · `Method` · `Module` · `Interface` · `Type` · `Variable` · `Export` · `DocSection` · `Heading` · `Requirement`

Edge types: `CALLS` · `IMPORTS` · `DOCUMENTED_BY` · `REFERENCES` · `EXPLAINS_FLOW` · `EXPORTS` · `INHERITS` · `IMPLEMENTS` · `SATISFIES`

---

## Roadmap

| Feature | Trạng thái |
|---------|-----------|
| BM25/FTS5 search | ✅ Done |
| Visual Doc View | ✅ Done |
| AI-Assisted Doc Linking | ✅ Done |
| Markdown rendering (slug, anchor) | ✅ Done |
| AI Parse Rules (Tree-sitter S-expr) | ✅ Done |
| AI-Generated Docs (regenerate_doc) | ✅ Done |
| LadybugDB / Kuzu migration | Planned |
| Leiden clustering | Planned |
| 10+ languages | Planned |
