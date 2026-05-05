# 7. Viz Server — 43 routes

**File:** `src/viz/server.ts`

`@startVizServer` là REST facade và host cho Web UI. Runtime hiện có **43 routes** tính cả SPA fallback `GET *`. Nếu chỉ tính API routes dưới `/api/*` thì có 42.

Tài liệu này chi tiết hóa [[doc:./02-2-pipeline-tong-the.md#2-pipeline-tong-the]] ở lớp Web UI boundary, và map trực tiếp tới `@startVizServer`, `@resolveDb`, `@scanDocSources`, `@setVisualDocsConfig`, `@provideParseRules`, `@previewParseRules`.

Express server nhận `initialProjects: ProjectEntry[]`, mở một `@GraphDB` connection cho mỗi project, lưu trong `Map<id, GraphDB>`, rồi dùng `resolveDb(req)` để map mọi request về đúng project.

### Project lifecycle

```text
GET    /api/projects
GET    /api/browse
POST   /api/projects
PATCH  /api/projects/:id
DELETE /api/projects/:id
POST   /api/index
POST   /api/index-all
GET    /api/mcp-config
```

### Parse rules và RuleSets

```text
POST   /api/provide-parse-rules
POST   /api/validate-parse-rules
GET    /api/rule-sets
POST   /api/rule-sets
GET    /api/rule-sets/:id
GET    /api/rule-sets/:id/resolved
PATCH  /api/rule-sets/:id
DELETE /api/rule-sets/:id
POST   /api/rule-sets/:id/fork
POST   /api/rule-sets/:id/assign-rules
GET    /api/rule-links
POST   /api/rule-links
DELETE /api/rule-links/:id
```

### Graph và docs queries

```text
GET    /api/graph
GET    /api/search
GET    /api/symbol
GET    /api/symbol-by-id
GET    /api/impact
GET    /api/flow
GET    /api/doc-flow
GET    /api/module
GET    /api/docsync
GET    /api/validate
GET    /api/doc-graph
GET    /api/doc-neighborhood
GET    /api/all-links
GET    /api/forward-refs
GET    /api/validate-links
```

### Visual Docs config và doc sources

```text
GET    /api/doc-sources/scan
PATCH  /api/visual-docs-config
```

### AI-assisted doc linking

```text
GET    /api/suggest-links
POST   /api/create-doc-link
POST   /api/unlink-doc
GET    /api/doc-link-marks
PATCH  /api/doc-link-marks/:id/resolve
```

### SPA fallback

```text
GET    *
```

### Liên hệ với MCP layer

- `/api/provide-parse-rules` gọi `@provideParseRules`
- `/api/validate-parse-rules` gọi `@previewParseRules`
- `/api/suggest-links` gọi `@suggestDocLinks`
- `/api/create-doc-link` gọi `@createDocLink`
- `/api/validate-links` gọi `@validateLinks`
- `/api/doc-link-marks` và `/api/doc-link-marks/:id/resolve` nối UI với `@getDocLinkMarks` / `@resolveDocLinkMark`
- `/api/doc-neighborhood` và `/api/doc-graph` là cầu nối giữa Visual Docs với `REFERENCES`, `REFERENCES_DOC`, `DOCUMENTED_BY`
- `/api/doc-flow` là REST facade cho workflow “flow tài liệu -> flow code”, nối `REFERENCES_DOC` -> doc-to-code -> `CALLS`

### Điểm khác so với docs cũ

- Không còn đúng khi nói Viz Server chỉ có 20 endpoint.
- Layer này giờ bao luôn RuleSet CRUD, parse-rule validation, doc-link mark workflow, doc-neighborhood, symbol-by-id, all-links, forward-refs.
- `GET *` là route cuối để phục vụ `src/viz/public/index.html`.

Nếu code comment hoặc docs khác cần map lại phần này, dùng `@doc:../../docs/architecture/07-7-viz-server-20-endpoints.md#7-viz-server-43-routes`.
