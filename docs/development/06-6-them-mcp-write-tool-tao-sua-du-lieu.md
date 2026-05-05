# 6. Thêm MCP write tool (tạo/sửa dữ liệu)

Write tools khác read tools ở chỗ chúng thay đổi trạng thái DB. Ví dụ: thêm tool `knowsync_pin_symbol` — đánh dấu một symbol là "pinned".

### Bước 1 — Thêm column mới (nếu cần)

Trong `GraphDB.init()` ở `src/graph/db.ts`, thêm migration sau khi tạo tables:

```typescript
// Migration: thêm column pinned nếu chưa có
try {
  this.db.exec(`ALTER TABLE symbols ADD COLUMN pinned INTEGER DEFAULT 0`);
} catch {
  // Column đã tồn tại — bỏ qua
}
```

### Bước 2 — Thêm DB method

Trong `src/graph/db.ts`:

```typescript
pinSymbol(symbolId: string): void {
  this.db.prepare(`UPDATE symbols SET pinned = 1 WHERE id = ?`).run(symbolId);
}

unpinSymbol(symbolId: string): void {
  this.db.prepare(`UPDATE symbols SET pinned = 0 WHERE id = ?`).run(symbolId);
}

getPinnedSymbols(): GraphNode[] {
  return (this.db.prepare(`SELECT * FROM symbols WHERE pinned = 1`)
    .all() as Record<string, unknown>[]).map(rowToNode);
}
```

### Bước 3 — Tạo tool file

Tạo `src/mcp/tools/pin-symbol.ts`:

```typescript
import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';

export const schema = {
  symbolId: z.string().describe('ID of the symbol to pin'),
  pinned: z.boolean().default(true).describe('true to pin, false to unpin'),
};

export function pinSymbol(db: GraphDB, args: { symbolId: string; pinned: boolean }): { ok: boolean; symbolId: string } {
  if (args.pinned) {
    db.pinSymbol(args.symbolId);
  } else {
    db.unpinSymbol(args.symbolId);
  }
  return { ok: true, symbolId: args.symbolId };
}
```

### Bước 4 — Đăng ký trong server.ts

Trong `src/mcp/server.ts`:

```typescript
import { pinSymbol, schema as pinSymbolSchema } from './tools/pin-symbol.js';

server.tool(
  'knowsync_pin_symbol',
  'Mark or unmark a symbol as pinned for quick access',
  pinSymbolSchema,
  async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(pinSymbol(db, args), null, 2) }]
  })
);
```

**Lưu ý quan trọng cho write tools:**
- Validate input kỹ trước khi ghi (Zod schema + kiểm tra existence nếu cần)
- Luôn trả object mô tả kết quả rõ ràng (`{ ok: true, ... }`)
- Nếu tạo manual edge (như `knowsync_create_doc_link`), dùng `db.upsertEdge()` với `is_manual: 1` để edge không bị xóa khi re-index
- Dùng `wrap()` helper trong `server.ts` để bắt lỗi nhất quán

### Bước 5 — Build và test

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/cli/index.js mcp .
# → phải thấy "knowsync_pin_symbol" trong danh sách
```

---
