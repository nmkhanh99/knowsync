# 8. Thêm AI Parse Rule mới

KnowSync hiện hỗ trợ nhiều lớp parse runtime hơn bản docs cũ: `rules[]`, `queryPacks[]`, `artifacts[]`, preview nhiều vòng, và RuleSet inheritance. Khi thêm rule mới, đi theo luồng `@previewParseRules` → `@previewApplyParseRules` → `@provideParseRules` → `@runIndex`.

### Luồng khuyến nghị

1. Preview query trên vài file bằng `knowsync_preview_parse_rules`
2. Nếu cần refine nhiều vòng, dùng `knowsync_preview_apply_parse_rules` với `stateToken`
3. Khi query sạch, gọi `knowsync_provide_parse_rules`
4. Re-index bằng `knowsync_build_graph`

### Qua MCP (recommended)

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

### Những gì implementation hiện hỗ trợ

- `rules[]`: `node`, `edge`, `resolve`, `linking`, `doc_link`
- `queryPacks[]`: hiện pack type ổn định là `comment_doc_linking`
- `artifacts[]`: `injection_query`, `included_ranges`
- `ruleSetId`: gán rule/artifact vào RuleSet để dùng inheritance
- `replace`: thay toàn bộ rules của một language trước khi import

### Lưu ý riêng cho file HTML có JavaScript nhúng

- `src/indexer/file-crawler.ts` hiện scan `.html` / `.htm` như `javascript`
- `src/indexer/code-parser.ts` trích block `<script>...</script>` rồi parse như JavaScript
- trước khi tách runtime ra file riêng, có thể bắt symbol trong `src/viz/public/index.html` bằng `language: "javascript"` thay vì `html`
- sau refactor mới của KnowSync, runtime chính đã nằm ở `src/viz/public/app.js`, nên ưu tiên target file `.js` này trước
- nếu query không match, kiểm tra lại AST shape của `lexical_declaration`, `variable_declarator`, `function_declaration` trong JavaScript trước khi nghi parser hỏng

### Preview nhanh trước khi ghi DB

```json
{
  "rootPath": "/abs/path/to/repo",
  "language": "typescript",
  "limit": 3,
  "onlyRuleMatches": true,
  "matchDetails": true,
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
  ]
}
```

Preview trả về `matchDetails`, `queryErrors`, `embeddedDocRegions`, rất hữu ích để sửa query trước khi ghi DB.

### Trực tiếp qua DB (dev/debug)

```bash
sqlite3 /path/to/project/.knowsync/graph.db "
INSERT INTO parse_rules (project_id, id, language, rule_type, name, query, node_type, name_capture, priority, created_at)
VALUES (
  'your-project-id',
  hex(randomblob(8)),
  'typescript',
  'node',
  'my_custom_rule',
  '(function_declaration name: (identifier) @name)',
  'Function',
  'name',
  5,
  unixepoch() * 1000
);
"
```

Không khuyến nghị ghi tay vào DB nếu đang dùng `queryPacks`, `artifacts`, `rule_sets`, hoặc refine session vì dễ làm lệch metadata.

Sau khi apply:

```bash
knowsync index /path/to/project --docs
```

### Checklist tối thiểu

- Rule có capture đúng chưa: `nameCapture`, `sourceCapture`, `targetCapture`, `docCapture`, `symbolCapture`
- Query đã preview trên file thật chưa
- Có cần `artifact` để parse injected Markdown không
- Có cần `ruleSetId` để đưa rule vào chain kế thừa không
- Đã re-index và kiểm tra bằng `knowsync_get_symbol` hoặc `knowsync_get_doc_visualization` chưa
- Nếu file là HTML có JS nhúng hoặc vừa được tách sang `.js`, đã verify lại bằng `knowsync_search_graph` hoặc `knowsync_get_linked_docs` trên symbol thật trong file runtime chưa
