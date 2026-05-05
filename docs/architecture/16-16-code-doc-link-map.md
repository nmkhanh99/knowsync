# 16. Bản đồ liên kết code và tài liệu

Tài liệu này gom các điểm nối quan trọng nhất giữa source code, tài liệu và khả năng parse/link của KnowSync. Mục tiêu là giúp AI agent hoặc maintainer đi từ docs sang code nhanh hơn, đồng thời tăng mật độ `@symbol` và `@doc:` để graph tạo `REFERENCES` và `REFERENCES_DOC` rõ hơn.

## Điểm vào chính

| Vai trò | Symbol / file | Tài liệu liên quan |
|--------|----------------|--------------------|
| Orchestrator index | `@runIndex` — `src/indexer/index.ts` | `[[doc:./01-1-tong-quan.md#tong-quan]]`, `[[doc:./02-2-pipeline-tong-the.md#pipeline-tong-the]]`, `[[doc:./11-11-delta-indexing.md#delta-indexing]]` |
| Parse code | `@parseCodeFile` — `src/indexer/code-parser.ts` | `[[doc:./04-4-codeparser-rulesengine.md#codeparser-rulesengine]]`, `[[doc:./12-12-two-pass-call-resolution.md#two-pass-call-resolution]]` |
| Parse docs Markdown | `@parseMarkdownSectionsFromText` — `src/indexer/docs-parser.ts` | `[[doc:./05-5-docsparser.md#docsparser]]` |
| Apply parse rules / artifacts | `@applyDocLinkRulesDetailed`, `@applyParseArtifacts` — `src/indexer/rules-engine.ts` | `[[doc:./04-4-codeparser-rulesengine.md#codeparser-rulesengine]]`, `[[doc:../development/08-8-them-ai-parse-rule-moi.md#them-ai-parse-rule-moi]]`, `[[doc:../guide/16-8-ai-parse-rules.md#ai-parse-rules]]` |
| Persist graph | `@GraphDB` — `src/graph/db.ts` | `[[doc:./06-6-graphdb-schema-ay-u.md#graphdb-schema-day-du]]` |
| MCP boundary | `@startMcpServer` — `src/mcp/server.ts` | `[[doc:./08-8-mcp-server-17-tools-3-groups.md#mcp-server-26-tools]]`, `[[doc:../guide/15-7-17-mcp-tools-bang-ay-u.md#mcp-tools-bang-day-du]]` |
| Web UI / REST boundary | `@startVizServer` — `src/viz/server.ts` | `[[doc:./07-7-viz-server-20-endpoints.md#viz-server-43-routes]]`, `[[doc:./09-9-web-ui-8-tabs.md#web-ui-8-tabs]]` |
| CLI boundary | `src/cli/index.ts` | `[[doc:./10-10-cli-8-commands.md#cli-8-commands]]`, `[[doc:../guide/17-cli-commands-tham-khao-ay-u.md#cli-commands-tham-khao-day-du]]` |

## Parse và linking

### Code → graph

- `@parseCodeFile` dựng `Module`, `Function`, `Class`, `Method`, `Interface`, `Type`, `Variable`, rồi sinh `CALLS`, `IMPORTS`, `EXPORTS`, `INHERITS`, `IMPLEMENTS`.
- `@resolveCallEdges` xử lý pass nội bộ trước, còn unresolved calls được đẩy qua `pendingCalls` để `@runIndex` xử lý pass 2.
- Requirement IDs `BRD-*`, `PRD-*`, `FRD-*` đi vào metadata symbol ngay từ parser.

### Docs → graph

- `@parseMarkdownSectionsFromText` cắt Markdown thành `DocSection` theo heading, đồng thời trích `@symbol`, `[[Symbol]]`, `@doc:...`, `[[doc:...]]`, requirement IDs.
- Comment/docstring nội bộ của code được dựng thành embedded docs trong `@parseCodeFile`.
- `@applyDocLinkRulesDetailed` cho phép AI rule nối comment → symbol theo Tree-sitter query.
- `@applyParseArtifacts` cho phép parse injected Markdown hoặc included ranges rồi đẩy thành `EmbeddedDocRegion` + `DocSection`.

### Docs ↔ code sau khi index

- `@GraphDB` duy trì `DOCUMENTED_BY`, `REFERENCES`, `REFERENCES_DOC`, `SATISFIES`.
- `knowsync_suggest_doc_links`, `knowsync_create_doc_link`, `knowsync_validate_links` là bộ công cụ bù các link còn thiếu hoặc bị stale.
- `knowsync_get_doc_link_marks` và `knowsync_resolve_doc_link_mark` nối thao tác UI với việc sửa markdown gốc ngoài source.

## Module map

### `src/indexer/`

- `file-crawler.ts`: quét file theo code/doc sources.
- `code-parser.ts`: parser Tree-sitter gốc.
- `docs-parser.ts`: parser Markdown gốc.
- `rules-engine.ts`: lớp parse-rule runtime cho `doc_link` và artifacts.
- `index.ts`: orchestration index, delta, second-pass resolution, clustering.

### `src/graph/`

- `db.ts`: schema, migrations, FTS5, project config, rule sets, refine sessions.
- `builder.ts`: `makeNodeId`, `makeDocId`, persist parsed outputs.
- `clustering.ts`: Louvain clustering.

### `src/mcp/tools/`

- Truy vấn graph: `get-symbol`, `get-callers`, `get-linked-docs`, `get-impact`, `get-process-flow`, `search-graph`, `get-module-overview`, `get-full-context`, `get-doc-section`, `get-doc-visualization`, `get-requirement-trace`.
- Linking docs: `suggest-doc-links`, `create-doc-link`, `validate-links`, `get-doc-link-marks`, `resolve-doc-link-mark`.
- Parse rules: `provide-parse-rules`, `preview-parse-rules`, `preview-apply-parse-rules`, `rule-sets`, `rule-links`.
- Cấu hình docs/UI: `scan-doc-sources`, `set-visual-docs-config`.

### `src/viz/`

- `server.ts`: REST facade cho graph queries, project CRUD, rule set CRUD, parse-rule preview/import, docs-link workflow.
- `public/index.html`: shell HTML + vendor assets + modal/container markup.
- `public/app.js`: core client-side runtime sau refactor.
- `public/app-search.js`: module Search tab và symbol detail expansions.
- `public/app-analysis.js`: module Impact/Flow/Module.
- `public/app-docs.js`: module Docs workflow và doc-link operations.
- `public/app-mcp.js`: module MCP client config và shared rule-filter state.
- `public/app-parse-rules.js`: module parse-rules import, validate, export, samples.
- `public/app-rulesets.js`: module RuleSets, inheritance, dependency links, assign/import.
- `public/app-vdocs.js`: shared state + load/render dispatcher cho Visual Docs.
- `public/app-vdocs-config.js`: module cấu hình Visual Docs.
- `public/app-vdocs-outline.js`: module outline, preview, doc grouping helpers.
- `public/app-vdocs-graph.js`: module links graph và overlay panel.

## Liên kết mới đã xác nhận trong UI public assets

### Embedded JavaScript parse coverage

- `file-crawler.ts` hiện đưa `.html` / `.htm` vào code scan như `javascript`.
- `@parseCodeFile` trong `src/indexer/code-parser.ts` trích riêng các block `<script>...</script>` rồi parse như JavaScript, giữ line offsets gần file gốc.
- Sau refactor mới, runtime UI đã được tách thành nhiều file `public/app*.js`, nên graph parse trực tiếp các file `.js` thay vì phụ thuộc vào embedded script trong HTML.

### UI state symbols đã vào graph qua MCP RuleSets

- Constants: `NODE_COLORS`, `EDGE_COLORS`, `PR_SAMPLES`
- Project state: `currentProject`, `allProjects`, `projectListenerAdded`
- Docs tab state: `validateLoaded`, `sigmaRenderer`, `currentDocsTab`
- MCP / RuleSets state: `mcpData`, `mcpActiveTool`, `rsAllSets`, `rsSelected`, `rulesData`
- Visual Docs state: `vdocsRenderer`, `vdocsData`, `vdocsLinksData`, `vdocsSelectedId`, `vdocsCollapsed`, `vdocsNodeById`
- Bootstrap helpers sau refactor: `initMermaidRendering`, `initMarkedMermaidRenderer`

### Comment docs đã link được tới state đầu cụm

- `currentProject Comment Doc` ← heading `Project management` → linked qua `knowsync_get_linked_docs("currentProject")`
- `validateLoaded Comment Doc` ← heading `Tab switching` → linked qua `knowsync_get_linked_docs("validateLoaded")`
- `searchResults Comment Doc` ← heading `Search tab` → linked qua `knowsync_get_linked_docs("searchResults")`
- `searchTypeFilter Comment Doc` ← heading `Search tab` → linked qua `knowsync_get_linked_docs("searchTypeFilter")`
- `mcpData Comment Doc` ← heading `MCP tab` → linked qua `knowsync_get_linked_docs("mcpData")`
- `mcpActiveTool Comment Doc` ← heading `MCP active tool` → linked qua `knowsync_get_linked_docs("mcpActiveTool")`
- `mcpRuleLanguage Comment Doc` ← heading `MCP tab` → linked qua `knowsync_get_linked_docs("mcpRuleLanguage")`
- `mcpRuleKind Comment Doc` ← heading `MCP tab` → linked qua `knowsync_get_linked_docs("mcpRuleKind")`
- `mcpRuleSearch Comment Doc` ← heading `MCP tab` → linked qua `knowsync_get_linked_docs("mcpRuleSearch")`
- `rsAllSets Comment Doc` ← heading `RuleSets` → linked qua `knowsync_get_linked_docs("rsAllSets")`
- `rsSelected Comment Doc` ← heading `RuleSets` → linked qua `knowsync_get_linked_docs("rsSelected")`
- `rsNewForm Comment Doc` ← heading `RuleSets new form state` → linked qua `knowsync_get_linked_docs("rsNewForm")`
- `rulesData Comment Doc` ← heading `Legacy rules config` → linked qua `knowsync_get_linked_docs("rulesData")`
- `vdocsRenderer Comment Doc` ← heading `Visual Docs tab` → linked qua `knowsync_get_linked_docs("vdocsRenderer")`
- `vdocsData Comment Doc` ← heading `Visual Docs tab` → linked qua `knowsync_get_linked_docs("vdocsData")`
- `vdocsLinksData Comment Doc` ← heading `Visual Docs tab` → linked qua `knowsync_get_linked_docs("vdocsLinksData")`
- `vdocsTypeFilter Comment Doc` ← heading `Visual Docs tab` → linked qua `knowsync_get_linked_docs("vdocsTypeFilter")`
- `vdocsSelectedId Comment Doc` ← heading `Visual Docs tab` → linked qua `knowsync_get_linked_docs("vdocsSelectedId")`
- `vdocsCollapsed Comment Doc` ← heading `Visual Docs tab` → linked qua `knowsync_get_linked_docs("vdocsCollapsed")`
- `_vdocsCfgSources Comment Doc` ← heading `Visual Docs tab` → linked qua `knowsync_get_linked_docs("_vdocsCfgSources")`
- `vdocsNodeById Comment Doc` ← heading `Visual Docs tab` → linked qua `knowsync_get_linked_docs("vdocsNodeById")`
- `loadProjects Comment Doc` ← heading `Init` → linked qua `knowsync_get_linked_docs("loadProjects")`
- `initMermaidRendering Comment Doc` ← heading `Mermaid init` → linked qua `knowsync_get_linked_docs("initMermaidRendering")`
- `initMarkedMermaidRenderer Comment Doc` ← heading `Marked Mermaid renderer` → linked qua `knowsync_get_linked_docs("initMarkedMermaidRenderer")`

## Chỗ dễ lệch giữa code và docs

- Số lượng MCP tools đã tăng lên 26; không còn đúng nếu docs vẫn ghi 17.
- `get-doc-section-content.ts` là tên cũ; file thực tế là `get-doc-section.ts`, còn tool name vẫn là `knowsync_get_doc_section_content`.
- Viz server hiện có 43 routes tính cả SPA fallback, không còn là 20 endpoint.
- Runtime graph có `Requirement` node và `SATISFIES` edge; Visual Docs còn dựng `EmbeddedDocRegion`, `DocFile`, `CONTAINS` ở lớp visualization.

## Checklist khi bổ sung tài liệu mới

1. Nếu tài liệu mô tả symbol thật, thêm `@symbolName` hoặc `[[SymbolName]]`.
2. Nếu tài liệu chi tiết hóa hoặc kế thừa tài liệu khác, thêm `@doc:path#slug` hoặc `[[doc:path#slug]]`.
3. Nếu mô tả yêu cầu nghiệp vụ, thêm `BRD-*`, `PRD-*`, `FRD-*`.
4. Nếu tài liệu nói về parse rules, liên kết đến `@previewParseRules`, `@previewApplyParseRules`, `@provideParseRules`.
5. Nếu tài liệu nói về docs linking, liên kết đến `@suggestDocLinks`, `@createDocLink`, `@validateLinks`.
6. Nếu tài liệu nói về index hoặc schema, liên kết đến `@runIndex`, `@GraphDB`, `@parseCodeFile`, `@parseMarkdownSectionsFromText`.
