# 8. AI Parse Rules

KnowSync cho phép AI agent cung cấp Tree-sitter S-expression rules để mở rộng khả năng nhận diện symbols mà parser mặc định bỏ sót. Runtime hiện hỗ trợ thêm `queryPacks`, `artifacts`, preview nhiều vòng bằng `stateToken`, và RuleSet inheritance.

### Cơ chế

1. AI gọi `knowsync_preview_parse_rules` hoặc `knowsync_preview_apply_parse_rules` để test query trên file thật
2. Khi query sạch, AI gọi `knowsync_provide_parse_rules` để đẩy rules/query packs/artifacts vào SQLite
3. AI gọi `knowsync_build_graph` để trigger index và áp dụng rules từ DB

Rules được lưu persistent trong DB — không cần cung cấp lại sau mỗi lần index.

### Case thật trong KnowSync

Project này hiện đã dùng MCP RuleSets để vá parser cho UI public của KnowSync:

- một RuleSet TypeScript để bắt thêm `Schema` constants, regex/constants lớn, và comment docs đứng trước chúng
- một RuleSet JavaScript để bắt constants + top-level UI state/runtime state, ban đầu trên `index.html`, hiện chủ yếu trên `src/viz/public/app.js`
- một query pack `comment_doc_linking` để biến heading comments như `Project management`, `MCP tab`, `RuleSets`, `Visual Docs tab` thành `Comment Doc` linked tới symbol mở đầu cụm state

Điểm quan trọng là runtime từng parse được `HTML + embedded JavaScript`, và sau refactor mới thì đã tách runtime chính sang `app.js`. Điều này làm graph sạch hơn vì rules JavaScript giờ áp trực tiếp lên file `.js`.

### Cấu trúc rule

```json
{
  "language": "typescript",
  "queryPacks": [
    {
      "name": "ts-comment-doc-linking",
      "packType": "comment_doc_linking",
      "rules": [
        {
          "name": "comment-before-function",
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
    }
  ]
}
```

| Field | Mô tả |
|-------|-------|
| `language` | Ngôn ngữ áp dụng (`typescript`, `javascript`, `python`, ...) |
| `name` | Tên rule (unique trong phạm vi language + pack) |
| `ruleType` | `"node"`, `"edge"`, `"resolve"`, `"linking"`, `"doc_link"` |
| `nodeType` | Loại node tạo ra: `Function`, `Class`, `Method`, `Variable`, ... |
| `query` | Tree-sitter S-expression query (chuẩn `tree-sitter query`) |
| `nameCapture` | Tên capture group chứa tên symbol (`@name`) |
| `sourceCapture` | (edge only) Capture group cho source node |
| `targetCapture` | (edge only) Capture group cho target node |
| `docCapture` | (doc_link) Capture group chứa comment/doc block |
| `symbolCapture` | (doc_link) Capture group chứa symbol được link |
| `edgeType` | (edge only) `CALLS`, `IMPORTS`, ... |
| `priority` | Số nguyên — rule có priority cao hơn chạy trước |

Ngoài `rules[]`, payload còn có thể có:

- `queryPacks[]`: nhóm rule có `packName`
- `artifacts[]`: `injection_query`, `included_ranges`
- `ruleSetId`: gán rule/artifact vào RuleSet
- `replace`: thay toàn bộ rules của language đó trước khi import

### Ví dụ: nhận diện React components

```json
{
  "language": "typescript",
  "rules": [
    {
      "name": "react_component",
      "ruleType": "node",
      "nodeType": "Function",
      "query": "(variable_declarator name: (identifier) @name value: [(arrow_function) (function_expression)])",
      "nameCapture": "name"
    },
    {
      "name": "react_hook",
      "ruleType": "node",
      "nodeType": "Function",
      "query": "(function_declaration name: (identifier) @name (#match? @name \"^use[A-Z]\"))",
      "nameCapture": "name"
    }
  ]
}
```

### Workflow AI Parse Rules

```
1. AI gọi knowsync_preview_parse_rules(language="typescript", filePaths=["/abs/path/to/project/src/a.ts"], queryPacks=[...])
   → Xem trước `matchDetails`, `queryErrors`, `embeddedDocRegions`
   → Sửa query/rule nếu preview chưa sạch

2. AI gọi knowsync_preview_apply_parse_rules(...)
   → Nếu sạch thì apply rules/query packs/artifacts vào DB
   → Nếu `applyIndex: true` thì trigger build_graph ngay

3. AI gọi knowsync_provide_parse_rules(language="typescript", queryPacks=[...], artifacts=[...])
   → Rules và artifacts lưu vào DB với priority/pack metadata

4. AI gọi knowsync_build_graph(delta=false)
   → RulesEngine load rules và artifacts từ DB
   → Parse với cả built-in patterns lẫn AI rules
   → Graph được rebuild

5. AI gọi knowsync_get_symbol(symbolName="MyComponent")
   → Kiểm tra symbol đã được nhận diện chưa
```

### Workflow end-to-end cho agent

Đây là luồng nên dùng khi AI cần quét một project từ đầu và tối ưu dần parsing/linking:

```
1. AI đọc cấu trúc project
   → knowsync_get_module_overview
   → knowsync_search_graph
   → knowsync_get_doc_visualization

2. AI suy convention của code/docs
   → Tìm pattern comment/docstring
   → Tìm symbol naming style
   → Tìm doc sources, embedded Markdown regions, requirement IDs

3. AI sinh parse rules/query packs/artifacts
   → knowsync_preview_parse_rules
   → xem matchDetails, queryErrors, embeddedDocRegions
   → chỉnh S-expression, capture names, doc-link rules

4. AI lặp refine một vài vòng
   → knowsync_preview_parse_rules lại cho đến khi query sạch
   → nếu cần apply thử: knowsync_preview_apply_parse_rules
   → nếu cần giữ state giữa nhiều vòng refine: dùng `stateToken`
   → nếu muốn lưu: applyIndex=true

5. AI ghi rules ổn định vào DB
   → knowsync_provide_parse_rules
   → knowsync_build_graph để rebuild graph với rules mới

6. AI dựng cây tài liệu và embedded regions
   → knowsync_get_doc_visualization
   → đọc embeddedDocRegions, sourceArtifact, path, parentHeading
   → kiểm tra Visual Docs để xác nhận hierarchy

7. AI link tài liệu với code
   → knowsync_suggest_doc_links
   → knowsync_create_doc_link
   → knowsync_validate_links

8. AI chuẩn hóa comment/doc format để tăng linkability
   → thêm @symbol, [[WikiLink]], @doc:path#slug, [[doc:path#slug]], BRD/PRD/FRD IDs
   → tách doc comments theo convention ổn định
   → nếu cần cập nhật content docs: knowsync_regenerate_doc

### Chuẩn trace annotation nên dùng

Để map nhiều tầng tài liệu và code ổn định, agent nên ưu tiên:

- `@symbolName` hoặc `[[SymbolName]]` cho doc -> code
- `@doc:path/to/file.md#slug` hoặc `[[doc:path/to/file.md#slug]]` cho doc -> doc
- `@doc:#slug` hoặc `[[doc:#slug]]` cho link trong cùng file
- `@doc:path/to/file.md#slug` trong code comment/docstring cho code -> doc

Ý nghĩa về hướng:

- section hiện tại tham chiếu tài liệu nền/tầng trước bằng `@doc:` hoặc `[[doc:...]]`
- edge đó được lưu thành `REFERENCES_DOC`
- trong Docs workflow và Visual Docs:
  - `Before` = outgoing doc refs
  - `After` = incoming doc refs

Ví dụ:

```md
## @runIndex
Chi tiết hóa [[doc:../architecture/02-2-pipeline-tong-the.md#pipeline-tong-the]].
Xem thêm [[doc:#source-boundaries]].
```

```ts
/**
 * @doc:../../docs/frd/indexing.md#index-pipeline
 * @doc:../../docs/prd/search.md#search-flow
 */
```

9. AI re-index và kiểm tra lại
   → knowsync_build_graph(delta=true, includeDocs=true)
   → knowsync_check_doc_sync
   → knowsync_get_full_context / knowsync_get_requirement_trace
```

### Lưu rules ổn định rồi rebuild graph

Khi query pack/rules đã ổn, agent chuyển sang lưu DB và rebuild graph:

```json
{
  "language": "typescript",
  "queryPacks": [
    {
      "name": "ts-comment-doc-linking",
      "packType": "comment_doc_linking",
      "rules": [
        {
          "name": "comment-before-function",
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
    }
  ],
  "replace": false
}
```

1. Gọi `knowsync_provide_parse_rules(...)`
   - lưu rules/query packs/artifacts vào DB
   - nếu `replace: true`, xóa rules cũ của ngôn ngữ đó trước khi lưu

2. Gọi `knowsync_build_graph(...)`
   - `runIndex` đọc lại rules/artifacts từ DB
   - parse code + docs bằng rules mới
   - rebuild graph, edges, docs, requirement trace

3. Kiểm tra kết quả
   - `knowsync_get_symbol`
   - `knowsync_get_doc_visualization`
   - `knowsync_get_requirement_trace`
   - `knowsync_validate_links`

Nguyên tắc:
- `provide_parse_rules` là bước ghi ổn định vào DB.
- `build_graph` là bước áp dụng lại toàn bộ graph từ DB.
- Nếu chỉ muốn test, dùng `preview_parse_rules` trước, không lưu gì.

### Mẫu rule cho runtime UI JavaScript

Ví dụ dưới đây là dạng rule đang hoạt động trong KnowSync để bắt top-level UI state:

```json
{
  "language": "javascript",
  "rules": [
    {
      "name": "js_top_level_ui_state",
      "ruleType": "node",
      "nodeType": "Variable",
      "query": "(lexical_declaration (variable_declarator name: (identifier) @name value: [(array) (object) (new_expression) (string) (null)])) (#match? @name \"^(currentProject|allProjects|mcpData|rsAllSets|rsSelected|vdocsData|vdocsLinksData|vdocsCollapsed|vdocsSelectedId)$\")",
      "nameCapture": "name",
      "priority": 18
    }
  ]
}
```

Ví dụ query pack để link heading comment vào variable đầu cụm:

```json
{
  "language": "javascript",
  "queryPacks": [
    {
      "name": "js-ui-state-comment-linking",
      "packType": "comment_doc_linking",
      "rules": [
        {
          "name": "comment-before-project-management-state",
          "ruleType": "doc_link",
          "query": "((comment) @doc . (lexical_declaration (variable_declarator name: (identifier) @symbol value: [(string) (array) (false)])) (#match? @symbol \"^currentProject$\"))",
          "docCapture": "doc",
          "symbolCapture": "symbol"
        }
      ]
    }
  ]
}
```

Nguyên tắc thực thi:
- Preview trước, apply sau.
- Query lỗi thì sửa query, không đẩy thẳng vào DB.
- Khi linking docs, ưu tiên convention ổn định hơn là viết rule quá rộng.
- Nếu muốn agent chỉnh code để tăng linkability, hãy sửa comment/docstring và anchor text theo convention của repo, sau đó re-index.

### Convention baseline cho agent

Đây là quy ước ngắn để agent đọc và áp dụng khi quét project:

```
Comment/docstring:
  - giữ ngắn, rõ, đúng vai trò
  - dùng block marker để chia khối logic
  - ưu tiên comment ngay trước symbol cần mô tả

Naming:
  - function / variable: camelCase
  - type / interface / class: PascalCase
  - constant / regex / set: SCREAMING_SNAKE_CASE
  - file/module: kebab-case
  - MCP tool: knowsync_*

Traceability:
  - dùng BRD-REQ-001, PRD-UI-045, FRD-FUNC-112 trong comment/docs
  - thêm @symbolName hoặc [[WikiLink]] trong Markdown để tạo REFERENCES edge

Embedded Markdown:
  - coi injected Markdown là region riêng có provenance
  - đọc sourceArtifact trước, rồi drill xuống DocSection con
  - dùng path / parentHeading để trace hierarchy
```

---
