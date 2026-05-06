# 8. MCP Server — 30 tools

**File:** `src/mcp/server.ts` và `src/mcp/tools/`

**Transport:** `StdioServerTransport`

**SDK:** `@modelcontextprotocol/sdk`

`@startMcpServer` hiện đăng ký **30 tools**. Docs cũ ghi 17 tools là đã lỗi thời.

Tài liệu này chi tiết hóa [[doc:./02-2-pipeline-tong-the.md#2-pipeline-tong-the]] ở lớp MCP boundary, và map trực tiếp tới `@startMcpServer`, `@wrap`, `@asyncWrap`, `@buildGraph`, `@getDocSection`, `@getDocVisualization`.

Tools được khai báo theo mẫu:

```typescript
server.tool(name, description, zodSchema, handler)
```

### 1. Graph query và context

| Tool | File | Mô tả |
|------|------|-------|
| `knowsync_get_symbol` | `tools/get-symbol.ts` | Thông tin chi tiết symbol |
| `knowsync_get_callers` | `tools/get-callers.ts` | Callers của function |
| `knowsync_get_linked_docs` | `tools/get-linked-docs.ts` | Docs liên kết với symbol |
| `knowsync_get_impact` | `tools/get-impact.ts` | Impact analysis |
| `knowsync_get_process_flow` | `tools/get-process-flow.ts` | Call flow trace từ entry point |
| `knowsync_get_doc_flow_trace` | `tools/get-doc-flow-trace.ts` | Trace flow từ tài liệu xuống linked symbols và CALLS flow trong code |
| `knowsync_get_graph_stats` | `tools/get-graph-stats.ts` | Baseline counts cho graph, docs, parse rules, parse artifacts và source config |
| `knowsync_search_graph` | `tools/search-graph.ts` | BM25 full-text search |
| `knowsync_check_doc_sync` | `tools/check-doc-sync.ts` | Doc sync check |
| `knowsync_get_project_info` | `server.ts` | Trả về `activeProject` và `availableProjects` trong MCP session |
| `knowsync_set_active_project` | `tools/set-active-project.ts` + `server.ts` | Chuyển active project theo `projectCode` |
| `knowsync_get_module_overview` | `tools/get-module-overview.ts` | Module overview |
| `knowsync_get_doc_section_content` | `tools/get-doc-section.ts` | Nội dung Markdown đầy đủ + slug + trace metadata + `relatedDocs` + `beforeDocs` + `afterDocs` |
| `knowsync_get_full_context` | `tools/get-full-context.ts` | Rich context: callers + callees + docs + siblings |
| `knowsync_get_doc_visualization` | `tools/get-doc-visualization.ts` | Doc subgraph cho visualization |
| `knowsync_get_requirement_trace` | `tools/get-requirement-trace.ts` | Trace requirement ↔ code ↔ docs |

### 2. AI-assisted doc linking

| Tool | File | Mô tả |
|------|------|-------|
| `knowsync_suggest_doc_links` | `tools/suggest-doc-links.ts` | Gợi ý links chưa được tạo |
| `knowsync_create_doc_link` | `tools/create-doc-link.ts` | Tạo REFERENCES edge thủ công |
| `knowsync_validate_links` | `tools/validate-links.ts` | Tìm stale edges + coverage stats |
| `knowsync_get_doc_link_marks` | `tools/get-doc-link-marks.ts` | Lấy pending UI marks cần phản ánh vào markdown gốc |
| `knowsync_resolve_doc_link_mark` | `tools/resolve-doc-link-mark.ts` | Đánh dấu mark đã được sửa trong source docs |
| `knowsync_regenerate_doc` | `tools/regenerate-doc.ts` | Tạo/cập nhật DocSection với AI content |

### 3. Parse rules và preview

| Tool | File | Mô tả |
|------|------|-------|
| `knowsync_provide_parse_rules` | `tools/provide-parse-rules.ts` | Ghi rules/query packs/artifacts vào DB |
| `knowsync_preview_parse_rules` | `tools/preview-parse-rules.ts` | Preview rules trên file thật, không ghi DB |
| `knowsync_preview_apply_parse_rules` | `tools/preview-apply-parse-rules.ts` | Preview nhiều vòng rồi apply/index nếu sạch |
| `knowsync_build_graph` | `tools/build-graph.ts` | Trigger full/delta graph build |

### 4. Doc source và Visual Docs config

| Tool | File | Mô tả |
|------|------|-------|
| `knowsync_scan_doc_sources` | `tools/scan-doc-sources.ts` | Quét candidate Markdown sources từ source paths đã cấu hình |
| `knowsync_set_visual_docs_config` | `tools/set-visual-docs-config.ts` | Lưu codeSources, docSources, visualDocs config; `path` trong sources nên là absolute path |

### 5. RuleSet orchestration

| Tool | File | Mô tả |
|------|------|-------|
| `knowsync_rule_sets` | `tools/rule-sets.ts` | CRUD RuleSet, inheritance, resolved chain |
| `knowsync_rule_links` | `tools/rule-links.ts` | Quản lý dependency links giữa RuleSets |

### Error handling

- Handler sync đi qua `wrap()`
- Handler async đi qua `asyncWrap()`
- Lỗi được trả về `isError: true` với payload text JSON hoặc message

### Liên kết code quan trọng

- `@startMcpServer` là điểm đăng ký tool và quản lý active project context cho MCP multi-project
- `@provideParseRules`, `@previewParseRules`, `@previewApplyParseRules` là trục parse-rule runtime
- `@suggestDocLinks`, `@createDocLink`, `@validateLinks` là trục docs-linking
- `@getDocSection` là tool đọc một DocSection hoàn chỉnh, gồm `relatedDocs` để giữ tương thích cũ và `beforeDocs` / `afterDocs` cho doc-to-doc layering rõ hướng
- `@getDocFlowTrace` là cầu nối cho workflow “flow tài liệu -> flow code”, gom `REFERENCES_DOC`, doc->code edges, rồi trace tiếp `CALLS`

Nếu code comment hoặc docs khác cần map lại phần này, dùng `@doc:../../docs/architecture/08-8-mcp-server-17-tools-3-groups.md#8-mcp-server-27-tools`.
