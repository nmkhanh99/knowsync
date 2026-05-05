# 4. CodeParser + RulesEngine

**File:** `src/indexer/code-parser.ts`, `src/indexer/rules-engine.ts`

Nhiệm vụ của lớp này là parse code bằng Tree-sitter, dựng symbols/edges built-in, trích comment-docs/docstrings, rồi áp thêm parse rules và artifacts do AI cung cấp.

Tài liệu này chi tiết hóa [[doc:./02-2-pipeline-tong-the.md#2-pipeline-tong-the]] ở nhánh code parsing, và map trực tiếp tới `@parseCodeFile`, `@extractSymbolInfo`, `@buildEmbeddedDocs`, `@applyParseRules`, `@applyDocLinkRulesDetailed`, `@applyParseArtifacts`.

Lưu ý: `CodeParser` có thể tạo embedded docs từ file code, nhưng `@runIndex` chỉ persist các `DocSection` đó nếu file gốc thuộc `docSources`. Nếu file chỉ thuộc `codeSources`, phần code vẫn được index đầy đủ nhưng embedded docs/doc links sẽ bị bỏ qua.

### Luồng xử lý hiện tại

```text
@parseCodeFile(filePath, language, contentHash, lastModified, parseRules, parseArtifacts)
  1. Đọc source
  2. getParser(language) → grammar JS / TS / Python
  3. parser.parse(source) → Tree-sitter AST
  4. walkNode(rootNode, ctx)
     - tryExtractSymbol(node)
     - push/pop scopeStack cho function-like symbols
     - gom deferredCalls, IMPORTS, inheritance/export relations
  5. resolveCallEdges(ctx)
  6. buildEmbeddedDocs(ctx.nodes)
  7. @applyDocLinkRules(tree, filePath, language, parseRules)
  8. @applyParseArtifacts(tree, filePath, language, parseArtifacts)
  9. merge embedded docs + regions
```

### Scope stack

`scopeStack` chỉ theo function-like owners. `call_expression` và `new_expression` được gán caller theo frame trên cùng của stack.

### Pending calls và second pass

- Nếu callee chưa resolve được trong file hiện tại, parser đẩy vào `pendingCalls`
- `@runIndex` sẽ làm second pass để nối các `CALLS` liên file
- Phần nối `pendingCalls` về graph xem thêm [[doc:./02-2-pipeline-tong-the.md#2-pipeline-tong-the]] và `@resolvePendingCalls`

### Built-in parser coverage

### JavaScript / TypeScript

| AST node type | NodeType |
|---------------|----------|
| `function_declaration` | `Function` |
| `generator_function_declaration` | `Function` |
| `variable_declarator` với `arrow_function` hoặc `function_expression` | `Function` |
| `method_definition` | `Method` |
| `class_declaration` / `class_expression` | `Class` |
| `interface_declaration` | `Interface` |
| `type_alias_declaration` | `Type` |
| `enum_declaration` | `Type` |
| một số `variable_declarator` còn lại | `Variable` |

### Python

| AST node type | NodeType |
|---------------|----------|
| `function_definition` | `Function` |
| `class_definition` | `Class` |
| docstring/comment trước symbol | embedded docs |

### RulesEngine hiện hỗ trợ gì

`src/indexer/rules-engine.ts` không còn là một class stateful như docs cũ mô tả. Nó cung cấp các hàm thuần:

- `@applyParseRules`: sinh thêm `nodes` và `edges` từ `node`/`edge` rules
- `@applyDocLinkRulesDetailed`: sinh `DocSection` từ `doc_link` rules và trả kèm `matchDetails`, `queryErrors`
- `@applyParseArtifacts`: xử lý `injection_query` và `included_ranges`

### Rule types và artifacts

- Rule types: `node`, `edge`, `resolve`, `linking`, `doc_link`
- Pack type đang dùng ổn định: `comment_doc_linking`
- Artifact types: `injection_query`, `included_ranges`

### Kết quả quan trọng

- Built-in parser và AI rules bổ sung cho nhau, không thay thế nhau
- Comment docs và injected Markdown đều có thể đi vào graph dưới dạng `DocSection`
  - nhưng chỉ khi file nguồn nằm trong `docSources`
- Requirement IDs được kéo từ code comment/docstring về metadata để nối với `SATISFIES`
- Comment/docstring hoặc generated doc sections có thể map ngược về tài liệu gốc bằng `@doc:path#slug` hoặc `[[doc:path#slug]]`

Nếu code comment hoặc docs khác cần map lại phần này, dùng `@doc:../../docs/architecture/04-4-codeparser-rulesengine.md#4-codeparser-rulesengine`.
