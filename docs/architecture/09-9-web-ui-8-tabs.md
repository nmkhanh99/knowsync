# 9. Web UI — 8 tabs

**Files:** `src/viz/public/index.html`, `src/viz/public/app.js`, `src/viz/public/app-search.js`, `src/viz/public/app-analysis.js`, `src/viz/public/app-docs.js`, `src/viz/public/app-mcp.js`, `src/viz/public/app-parse-rules.js`, `src/viz/public/app-rulesets.js`, `src/viz/public/app-vdocs.js`, `src/viz/public/app-vdocs-config.js`, `src/viz/public/app-vdocs-outline.js`, `src/viz/public/app-vdocs-graph.js`

SPA không dùng framework. Sau refactor mới:

- `index.html` là shell: layout HTML, modal markup, vendor script tags, và các module runtime
- `app.js` chứa core runtime: project manager, graph panel/popup helpers, bootstrap
- `app-search.js` chứa riêng Search tab: result state, type filters, detail expanders
- `app-analysis.js` chứa riêng các tab phân tích: Impact, Flow, Module
- `app-docs.js` chứa cụm Docs: coverage, linked docs, doc sync, validate links, links manager, forward refs
- `app-mcp.js` chứa MCP client config và shared state/filter cho rules tooling
- `app-parse-rules.js` chứa parse-rules import/validate/export UI
- `app-rulesets.js` chứa RuleSets UI: tree, detail panel, inheritance, links, assign/import
- `app-vdocs.js` giữ shared state và load/render dispatcher cho Visual Docs
- `app-vdocs-config.js` chứa config panel của Visual Docs
- `app-vdocs-outline.js` chứa outline tree, preview, và doc-structure helpers
- `app-vdocs-graph.js` chứa links graph và overlay panel của Visual Docs

Vendor dependencies:

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

Doc-centric graph riêng biệt (Sigma.js instance thứ hai). Filter bar: pattern + type pills. Injected Markdown xuất hiện thành `EmbeddedDocRegion` root node trước, rồi mới drill xuống nested `DocSection` children. Click panel hiển thị Markdown content (render bằng marked.js), `sourceArtifact`, `path`/`parentHeading`, và linked symbols. Slug anchors hiển thị cho mỗi DocSection.

### Tab 8 — MCP

Config JSON sẵn sàng copy-paste cho Claude Desktop, Cursor, Windsurf. Lấy từ `/api/mcp-config`.

---
