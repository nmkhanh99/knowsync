# 4. Thêm ngôn ngữ mới

Ví dụ: thêm **Go**.

### Bước 1 — Cài grammar

```bash
npm install tree-sitter-go --legacy-peer-deps
```

### Bước 2 — Thêm vào code-parser.ts

Mở `src/indexer/code-parser.ts`, tìm hàm `getParser`:

```typescript
function getParser(language: string): Parser {
  const parser = new Parser();
  if (language === 'javascript' || language === 'typescript') {
    const JS = require('tree-sitter-javascript');
    parser.setLanguage(JS);
  } else if (language === 'python') {
    const Python = require('tree-sitter-python');
    parser.setLanguage(Python);
  } else if (language === 'go') {           // ← thêm case mới
    const Go = require('tree-sitter-go');
    parser.setLanguage(Go);
  }
  return parser;
}
```

### Bước 3 — Thêm node type mappings

Trong hàm `tryExtractSymbol`, thêm case cho Go AST node types:

```typescript
if (language === 'go') {
  if (nodeType === 'function_declaration') return 'Function';
  if (nodeType === 'method_declaration') return 'Method';
  if (nodeType === 'type_declaration') return 'Type';
  if (nodeType === 'var_declaration') return 'Variable';
  if (nodeType === 'const_declaration') return 'Variable';
}
```

### Bước 4 — Thêm vào file-crawler.ts

Trong `LANGUAGE_EXTENSIONS`:

```typescript
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',           // ← thêm dòng này
};
```

### Bước 5 — Cập nhật default config

Trong `src/cli/commands/init.ts`, thêm `'go'` vào mảng `languages` mặc định:

```typescript
const defaultConfig = {
  include: ['src/**'],
  exclude: ['node_modules', 'dist', '.git'],
  languages: ['typescript', 'javascript', 'python', 'go'],  // ← thêm 'go'
  docsGlob: 'docs/**/*.md',
};
```

### Bước 6 — Build và test

```bash
npm run build
knowsync index /path/to/go-project
knowsync list
# Kiểm tra symbols Go đã được index
sqlite3 /path/to/go-project/.knowsync/graph.db \
  "SELECT type, name, file_path FROM symbols WHERE file_path LIKE '%.go' LIMIT 10;"
```

---
