# 7. MCP Tools — bảng đầy đủ

MCP server hiện cung cấp **26 tools**. Tên file tài liệu cũ vẫn giữ để tránh đứt link, nhưng nội dung dưới đây phản ánh implementation hiện tại trong `src/mcp/server.ts`.

### Nhóm 1 — Graph query và context

| Tool | Params chính | Mô tả |
|------|-------------|-------|
| `knowsync_get_symbol` | `symbolName`, `filePath?` | Thông tin chi tiết symbol |
| `knowsync_get_callers` | `functionName` | Danh sách symbols gọi đến function này |
| `knowsync_get_linked_docs` | `symbolName` | DocSections liên kết với symbol |
| `knowsync_get_impact` | `symbolName`, `depth` | Impact analysis |
| `knowsync_get_process_flow` | `entryPoint`, `maxDepth` | Trace call chain từ entry point |
| `knowsync_get_doc_flow_trace` | `query`, `maxDocDepth`, `maxCodeDepth` | Trace từ flow tài liệu xuống doc layers, linked symbols, rồi CALLS flow trong code |
| `knowsync_search_graph` | `query`, `nodeTypes?`, `limit?` | Tìm kiếm FTS5/BM25 trên symbols và docs |
| `knowsync_check_doc_sync` | `symbolName` | Kiểm tra symbol có docs đồng bộ không |
| `knowsync_get_module_overview` | `moduleName` | Tổng quan module |
| `knowsync_get_doc_section_content` | `docSectionId` | Nội dung Markdown đầy đủ + slug + trace metadata + `relatedDocs` + `beforeDocs` + `afterDocs` |
| `knowsync_get_full_context` | `symbolName` | Context giàu: callers + callees + docs + module siblings |
| `knowsync_get_doc_visualization` | `pattern?` | Subgraph doc-centric |
| `knowsync_get_requirement_trace` | `requirementId?`, `symbolName?` | Truy vết requirement ↔ code ↔ docs |

### Nhóm 2 — Docs linking và regeneration

| Tool | Params chính | Mô tả |
|------|-------------|-------|
| `knowsync_suggest_doc_links` | `docSectionId?`, `symbolName?` | Gợi ý DocSection↔Symbol links chưa được tạo |
| `knowsync_create_doc_link` | `docSectionId`, `symbolName` | Tạo REFERENCES edge thủ công |
| `knowsync_validate_links` | none | Tìm stale links + coverage stats |
| `knowsync_get_doc_link_marks` | `resolved?` | Lấy pending marks cần phản ánh vào source docs, gồm cả `doc -> symbol` và `doc -> doc` |
| `knowsync_resolve_doc_link_mark` | `markId` | Đánh dấu mark đã được sửa trong markdown gốc |
| `knowsync_regenerate_doc` | `symbolName`, `heading`, `content` | Tạo/cập nhật DocSection với AI content |

### Nhóm 3 — Parse rules runtime

| Tool | Params chính | Mô tả |
|------|-------------|-------|
| `knowsync_provide_parse_rules` | `language`, `rules[]`, `queryPacks[]`, `artifacts[]`, `ruleSetId?` | Ghi parse rules vào DB |
| `knowsync_preview_parse_rules` | `rootPath`, `language`, `filePaths?`, `limit?` | Preview rules trên file thật, không ghi DB |
| `knowsync_preview_apply_parse_rules` | `mode`, `stateToken?`, `applyIndex?` | Preview nhiều vòng rồi apply/index |
| `knowsync_build_graph` | `rootPath`, `delta?`, `includeDocs?`, `docSources?`, `codeSources?` | Trigger index + áp dụng parse rules |

### Nhóm 4 — Doc source và Visual Docs config

| Tool | Params chính | Mô tả |
|------|-------------|-------|
| `knowsync_scan_doc_sources` | `rootPath` | Quét các Markdown source khả dụng |
| `knowsync_set_visual_docs_config` | `rootPath?`, `docSources?`, `codeSources?`, `visualDocs?` | Lưu config phục vụ Visual Docs |

### Nhóm 5 — RuleSet orchestration

| Tool | Params chính | Mô tả |
|------|-------------|-------|
| `knowsync_rule_sets` | `action`, `ruleSetId?`, `language?`, ... | CRUD RuleSet, fork, resolved chain |
| `knowsync_rule_links` | `action`, `sourceId?`, `targetId?`, `linkType?` | Quản lý dependency links giữa RuleSets |

### Gợi ý sử dụng

1. Khi cần đọc graph: bắt đầu bằng `knowsync_search_graph`, `knowsync_get_symbol`, `knowsync_get_full_context`
2. Khi cần vá docs-link: dùng `knowsync_suggest_doc_links` → `knowsync_create_doc_link` → `knowsync_validate_links`
3. Khi cần thêm parse rules: dùng `knowsync_preview_parse_rules` hoặc `knowsync_preview_apply_parse_rules` trước, rồi mới `knowsync_provide_parse_rules`
