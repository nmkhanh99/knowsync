# 11. Một số lưu ý khi phát triển

### Tree-sitter: named vs anonymous nodes

Tree-sitter có hai loại node:
- **Named nodes**: `function_declaration`, `identifier`, ... — dùng `node.namedChild(i)` hoặc `node.childForFieldName('name')`
- **Anonymous nodes**: `(`, `)`, `{`, `;`, ... — tránh extract từ chúng

Luôn dùng `node.childForFieldName('name')` thay vì `node.child(0)` để lấy tên chính xác, vì index của children có thể thay đổi giữa các phiên bản grammar.

### remark: SKIP constant

Khi dùng `unist-util-visit`, phải `return SKIP` sau khi xử lý một block node (paragraph, list, code) để tránh visitor descend vào children và count text hai lần:

```typescript
import { visit, SKIP } from 'unist-util-visit';

visit(tree, (node) => {
  if (node.type === 'paragraph') {
    // xử lý paragraph...
    return SKIP;  // ← quan trọng: không descend vào children
  }
});
```

### better-sqlite3: synchronous API

`better-sqlite3` hoàn toàn synchronous — không có async/await. Đây là thiết kế chủ ý: SQLite operations trong Node.js single-thread hiệu quả nhất khi synchronous. Không bao giờ `await` một statement của better-sqlite3.

### ESM + CJS interop

`graphology`, `graphology-communities-louvain`, `better-sqlite3`, `ignore` đều là CJS packages. Dùng `createRequire` và handle `default` export:

```typescript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const lib = require('some-cjs-lib') as any;
const actualExport = lib.default ?? lib;
```

### marked.js: UMD global

Trong UI public, `marked` được load từ `/vendor/marked.umd.js` và expose global `marked`. Runtime hiện nằm chủ yếu trong `app.js`. Khi cần render Markdown:

```javascript
// Render Markdown → HTML
const html = marked.parse(markdownString);
container.innerHTML = html;
```

### is_manual edges: không bao giờ xóa bằng deleteByFilePath

Khi thêm code mới xóa edges, luôn thêm điều kiện `AND (is_manual = 0 OR is_manual IS NULL)` để bảo vệ manual links do AI tạo ra.

### resolveDb vs resolve trong viz server

Trong `src/viz/server.ts`, hàm helper resolve DB có tên `resolveDb` — KHÔNG phải `resolve`. Tên `resolve` đã bị `path.resolve` từ Node.js `path` module chiếm dụng cùng scope. Luôn dùng `resolveDb(req)` khi cần lấy GraphDB instance trong endpoint handlers.
