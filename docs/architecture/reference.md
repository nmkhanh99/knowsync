# KnowSync Architecture

## Overview

KnowSync là local-first knowledge graph cho code và tài liệu. Parser mặc định vẫn là static analysis thuần `Tree-sitter` + `remark`, nhưng runtime hiện còn có AI-assisted `parse rules`, `query packs`, `artifacts`, RuleSets và docs-link workflows.

Pipeline đầu cuối đi qua `@runIndex` và được persist bởi `@GraphDB`. `BRD-REQ-001` bao phủ shared code+docs graph, còn `PRD-UI-002` bao phủ injected Markdown regions hiển thị trong Visual Docs.

## Pipeline

```text
Repo Files
    ↓
FileCrawler         (respects .gitignore, codeSources, docSources)
    ↓
CodeParser          (Tree-sitter → symbols + edges + embedded docs)
DocsParser          (remark → DocSection nodes + references + requirements)
RulesEngine         (doc_link rules + parse artifacts)
    ↓
@GraphDB (SQLite)   (persist nodes + edges + rules + config + marks)
    ↓
Clustering          (Louvain algorithm)
    ↓
MCP Server          (27 tools via stdio)
Viz Server          (43 routes + Web UI)
```

## Runtime node và edge types

### Persisted node types

| Type | Source | Description |
|------|--------|-------------|
| `Function` | Code | Function hoặc callable symbol |
| `Class` | Code | Class declaration |
| `Method` | Code | Class method |
| `Module` | Code | File/module node |
| `Interface` | Code (TS) | TypeScript interface |
| `Type` | Code (TS) | Type alias |
| `Variable` | Code | Variable declaration |
| `Export` | Code | Export wrapper |
| `DocSection` | Docs | Markdown section |
| `Heading` | Docs | Heading node dùng ở một số view/docs layers |
| `Requirement` | Docs/Code | `BRD-*`, `PRD-*`, `FRD-*` |

### Persisted edge types

| Type | From → To | Description |
|------|-----------|-------------|
| `CALLS` | Symbol → Symbol | Function calls another function |
| `IMPORTS` | Symbol → Symbol | Import relation |
| `DOCUMENTED_BY` | Symbol → DocSection | Symbol có linked documentation |
| `REFERENCES` | DocSection → Symbol | Doc section references a symbol |
| `EXPLAINS_FLOW` | DocSection → Symbol | Doc section explains a flow |
| `EXPORTS` | Module → Symbol | Module exports a symbol |
| `INHERITS` | Class → Class | Class extends another |
| `IMPLEMENTS` | Class → Interface | Class implements an interface |
| `SATISFIES` | Symbol/DocSection → Requirement | Traceability edge |

### Visualization-only concepts

- `EmbeddedDocRegion` và `DocFile` được dựng ở lớp doc visualization/UI.
- `CONTAINS` là edge của visualization tree, không phải persisted `EdgeType` trong `src/types/index.ts`.

## Database schema

`@GraphDB` dùng SQLite qua `better-sqlite3`, WAL mode, FTS5, multi-project bằng `project_id`.

Các bảng chính:

- `symbols`
- `doc_sections`
- `edges`
- `doc_link_marks`
- `file_cache`
- `parse_rules`
- `parse_artifacts`
- `rule_sets`
- `rule_links`
- `project_config`
- `parse_rule_refine_sessions`

Tham chiếu schema chi tiết: `06-6-graphdb-schema-ay-u.md`

## MCP server

MCP chạy qua stdio. Entry point là `@startMcpServer`.

```json
{
  "mcpServers": {
    "knowsync": {
      "command": "node",
      "args": ["/path/to/knowsync/dist/cli/index.js", "mcp", "/path/to/repo"]
    }
  }
}
```

## Parse rules runtime

Trục parse-rule hiện tại:

- `@provideParseRules`: ghi rules/query packs/artifacts vào DB
- `@previewParseRules`: preview trên file thật, không mutate DB
- `@previewApplyParseRules`: preview nhiều vòng, có refine session `stateToken`, có thể apply và `build_graph`
- `knowsync_rule_sets` / `knowsync_rule_links`: tổ chức inheritance và dependency giữa RuleSets

## Visual Docs và docs-link workflow

- `@parseMarkdownSectionsFromText` tạo `DocSection` với `@symbol`, `[[WikiLink]]`, requirement refs
- `@applyDocLinkRulesDetailed` và `@applyParseArtifacts` nối comment/docstring với docs graph
- `knowsync_suggest_doc_links`, `knowsync_create_doc_link`, `knowsync_validate_links` xử lý gap giữa docs và code
- `knowsync_get_doc_link_marks`, `knowsync_resolve_doc_link_mark` giúp đồng bộ thao tác UI trở lại markdown gốc

## Clustering

Uses Louvain community detection (`graphology-communities-louvain`) trên graph in-memory dựng từ quan hệ code. Kết quả cluster được lưu lại để phục vụ Search, Impact, Module, và Graph tab.
