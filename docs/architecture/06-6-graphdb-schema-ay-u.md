# 6. GraphDB — Schema đầy đủ

**File:** `src/graph/db.ts`

**Storage:** `better-sqlite3`, WAL mode, multi-project trong một central DB bằng `project_id`.

Tài liệu này chi tiết hóa [[doc:./01-1-tong-quan.md#1-tong-quan]] và [[doc:./02-2-pipeline-tong-the.md#2-pipeline-tong-the]]. Phần implementation chính nằm ở `@GraphDB`, `@createSchema`, `@upsertDocSection`, `@getDocSubgraph`, `@getDocNeighborhood`, `@getRelatedDocs`.

`@GraphDB` hiện không chỉ lưu symbols/docs/edges. Nó còn lưu parse rules, parse artifacts, RuleSets, doc-link marks, project config và refine sessions cho parse rules.

### Các bảng chính

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

### Những điểm khác biệt so với schema cũ

- Hầu hết bảng đều có `project_id`
- `doc_sections` có `slug`, `heading_level`, `metadata_json`
- `edges` có `is_manual`
- Có thêm `parse_artifacts`, `doc_link_marks`, `rule_sets`, `rule_links`, `project_config`, `parse_rule_refine_sessions`

### Parse rules và artifacts

`parse_rules` lưu:

- `rule_type`
- `pack_name`
- `node_type`
- `edge_type`
- `name_capture`
- `source_capture`
- `target_capture`
- `doc_capture`
- `symbol_capture`
- `priority`

`parse_artifacts` lưu:

- `artifact_type`
- `pack_name`
- `content`
- `query`
- `target_language`
- `range_capture`
- `priority`

### RuleSets

`rule_sets` và `rule_links` cho phép:

- kế thừa nhiều tầng
- fork rule set
- override / inherit / inject links
- lấy resolved chain theo project + language

### Doc-link workflow persistence

`doc_link_marks` lưu các thao tác link/unlink phát sinh từ UI để AI hoặc user có thể sửa lại markdown gốc rồi gọi `knowsync_resolve_doc_link_mark`.

### FTS5

- `symbols_fts` index `name`, `signature`, `doc_string`
- `docs_fts` index `heading`, `content`
- Trigger `*_ai`, `*_au`, `*_ad` đồng bộ external-content FTS tables

### WAL mode

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```

### `is_manual` flag

Khi re-index, auto-generated edges bị xóa và dựng lại. Edges với `is_manual = 1` được giữ lại để các link tạo thủ công qua `knowsync_create_doc_link` không mất sau mỗi vòng index.

### Node types và Edge types đang dùng

**Persisted node types:** `Function`, `Class`, `Method`, `Module`, `Interface`, `Type`, `Variable`, `Export`, `DocSection`, `Heading`, `Requirement`

**Persisted edge types:** `CALLS`, `IMPORTS`, `DOCUMENTED_BY`, `REFERENCES`, `REFERENCES_DOC`, `EXPLAINS_FLOW`, `EXPORTS`, `INHERITS`, `IMPLEMENTS`, `SATISFIES`

Lưu ý:

- `EmbeddedDocRegion`, `DocFile`, `CONTAINS` là khái niệm của doc visualization/UI layer, không thuộc union `NodeType` / `EdgeType` persisted trong `src/types/index.ts`
- `REFERENCES_DOC` dùng riêng cho doc -> doc để không làm vỡ các workflow cũ vốn hiểu `REFERENCES` là doc -> symbol

### Migration behavior

`GraphDB.init()` sẽ:

1. `mkdir` thư mục cha của DB path
2. bật `WAL` và `foreign_keys`
3. tạo schema nếu chưa có
4. migrate DB cũ bằng `ALTER TABLE` hoặc recreate bảng cần thiết
5. backfill FTS nếu bảng gốc đã có dữ liệu

### Liên kết code quan trọng

- `@GraphDB` là boundary persist trung tâm
- `@runIndex` ghi dữ liệu qua graph builder vào DB này
- `@provideParseRules`, `@previewApplyParseRules`, `@ruleSets`, `@ruleLinks` đều phụ thuộc trực tiếp vào schema trong file này
- Nếu comment code cần map lại phần này, dùng `@doc:../../docs/architecture/06-6-graphdb-schema-ay-u.md#6-graphdb-schema-ay-u`
