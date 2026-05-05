# 17. Audit parse/link cho UI public (`index.html` + `app.js` + `app-search.js` + `app-analysis.js` + `app-docs.js` + `app-mcp.js` + `app-parse-rules.js` + `app-rulesets.js` + `app-vdocs.js` + `app-vdocs-config.js` + `app-vdocs-outline.js` + `app-vdocs-graph.js`)

Trang này chốt trạng thái hiện tại của UI public sau khi đã mở rộng parser qua MCP RuleSets, tách runtime core ra `src/viz/public/app.js`, tách riêng cụm Search ra `src/viz/public/app-search.js`, cụm Analysis ra `src/viz/public/app-analysis.js`, cụm Docs ra `src/viz/public/app-docs.js`, cụm MCP client config ra `src/viz/public/app-mcp.js`, cụm parse-rules tooling ra `src/viz/public/app-parse-rules.js`, cụm RuleSets ra `src/viz/public/app-rulesets.js`, và tách Visual Docs thành `src/viz/public/app-vdocs.js`, `src/viz/public/app-vdocs-config.js`, `src/viz/public/app-vdocs-outline.js`, `src/viz/public/app-vdocs-graph.js`.

## Tóm tắt

- `src/viz/public/index.html` hiện là shell HTML mỏng, nạp các module `app*.js`
- `src/viz/public/app.js` là runtime UI core
- `src/viz/public/app-search.js` là runtime riêng cho Search tab
- `src/viz/public/app-analysis.js` là runtime riêng cho Impact/Flow/Module
- `src/viz/public/app-docs.js` là runtime riêng cho Docs workflow và doc-link operations
- `src/viz/public/app-mcp.js` là runtime riêng cho MCP client config và shared state/filter
- `src/viz/public/app-parse-rules.js` là runtime riêng cho parse-rules import/validate/export
- `src/viz/public/app-rulesets.js` là runtime riêng cho RuleSets, inheritance, links, assign/import
- `src/viz/public/app-vdocs.js` giữ shared state và load/render dispatcher cho Visual Docs
- `src/viz/public/app-vdocs-config.js` là runtime riêng cho config panel của Visual Docs
- `src/viz/public/app-vdocs-outline.js` là runtime riêng cho outline, preview, và doc-structure helpers
- `src/viz/public/app-vdocs-graph.js` là runtime riêng cho links graph và overlay panel
- graph hiện index cụm UI này ổn định và đã nhận diện được constants, top-level UI state, runtime state, cùng comment docs nội bộ

## RuleSets MCP đang dùng

### TypeScript

- RuleSet: `KnowSync TS Symbol Extensions`
- RuleSet ID: `rs:2443934f5833`
- Mục tiêu:
  - bắt thêm schema constants
  - bắt regex / named constants lớn
  - link comment docs đứng trước constant

### JavaScript

- RuleSet: `KnowSync JS Embedded Constants`
- RuleSet ID: `rs:b04c3280ab28`
- Mục tiêu:
  - ban đầu bắt constants trong JavaScript nhúng của `index.html`
  - sau refactor tiếp tục áp dụng trực tiếp cho các file `app*.js`
  - bắt top-level UI state / runtime state
  - link heading comments của các cụm UI state vào symbol đầu cụm

## Symbol đã vào graph

### Constants

- `NODE_COLORS`
- `EDGE_COLORS`
- `PR_SAMPLES`

### Project / docs / MCP / RuleSets state

- `currentProject`
- `allProjects`
- `projectListenerAdded`
- `validateLoaded`
- `sigmaRenderer`
- `currentDocsTab`
- `searchResults`
- `searchTypeFilter`
- `mcpData`
- `mcpActiveTool`
- `mcpRuleLanguage`
- `mcpRuleKind`
- `mcpRuleSearch`
- `rsAllSets`
- `rsSelected`
- `rsNewForm`
- `rulesData`

### Visual Docs state

- `vdocsRenderer`
- `vdocsData`
- `vdocsLinksData`
- `vdocsTypeFilter`
- `vdocsSelectedId`
- `vdocsCollapsed`
- `_vdocsCfgSources`
- `vdocsNodeById`
- `_vdocsCfgEditIdx`

### UI bootstrap / rendering helpers

- `initMermaidRendering`
- `initMarkedMermaidRenderer`

## Comment docs đã link được

Các link dưới đây đã được verify bằng `knowsync_get_linked_docs`:

- `Constants` → `NODE_COLORS`
- `Project management` → `currentProject`
- `Tab switching` → `validateLoaded`
- `Search tab` → `searchResults`
- `Search tab` → `searchTypeFilter`
- `MCP tab` → `mcpData`
- `MCP active tool` → `mcpActiveTool`
- `MCP tab` → `mcpRuleLanguage`
- `MCP tab` → `mcpRuleKind`
- `MCP tab` → `mcpRuleSearch`
- `RuleSets` → `rsAllSets`
- `RuleSets` → `rsSelected`
- `RuleSets new form state` → `rsNewForm`
- `Legacy rules config (MCP tab still uses this)` → `rulesData`
- `Visual Docs tab` → `vdocsRenderer`
- `Visual Docs tab` → `vdocsData`
- `Visual Docs tab` → `vdocsLinksData`
- `Visual Docs tab` → `vdocsTypeFilter`
- `Visual Docs tab` → `vdocsSelectedId`
- `Visual Docs tab` → `vdocsCollapsed`
- `Visual Docs tab` → `_vdocsCfgSources`
- `Visual Docs tab` → `vdocsNodeById`
- `Init` → `loadProjects`
- `Mermaid init` → `initMermaidRendering`
- `Marked Mermaid renderer` → `initMarkedMermaidRenderer`

## Kết quả build đã xác nhận

Lần rebuild gần nhất sau khi tách tiếp `app-vdocs-config.js`, `app-vdocs-outline.js`, và `app-vdocs-graph.js`:

- `codeFiles: 60`
- `docFiles: 58`
- `errors: 0`

## Trạng thái coverage

- top-level state chính của UI runtime hiện đã có coverage gần như đầy đủ ở mức symbol + comment-doc link
- `Symbol popup` đã có coverage qua `openSymPopup Comment Doc`
- bước nâng cấp tiếp theo, nếu muốn, là dọn các helper chưa dùng trong Visual Docs, đặc biệt các layout helper cũ nếu không còn được gọi

## Ghi chú kỹ thuật

- `Init` link được vì comment đứng ngay trước call chain có thể neo vào symbol thật `loadProjects`
- `Mermaid init` đã được giải quyết bằng refactor code: tách statement runtime thành function declaration `initMermaidRendering()`, nhờ đó parser mặc định và comment-doc linking hoạt động sạch hơn
- `mcpActiveTool` và `rsNewForm` được giải quyết theo cùng nguyên tắc: thêm comment riêng ngay trên declaration, rồi dùng rule hẹp chỉ match đúng symbol đó

## Liên kết liên quan

- [16. Bản đồ liên kết code và tài liệu](./16-16-code-doc-link-map.md)
- [8. AI Parse Rules](../guide/16-8-ai-parse-rules.md)
- [8. Thêm AI Parse Rule mới](../development/08-8-them-ai-parse-rule-moi.md)
