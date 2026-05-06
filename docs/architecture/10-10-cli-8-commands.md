# 10. CLI — 8 commands

**File:** `src/cli/index.ts` + `src/cli/commands/`

Commander 12. Entry point: `dist/cli/index.js`.

| Command | File | Mô tả |
|---------|------|-------|
| `init [path]` | `commands/init.ts` | Tạo `knowsync.config.json` |
| `register [path]` | `commands/register.ts` | Đăng ký project (`--docs-source` repeatable; `codeSources` cấu hình qua UI/MCP) |
| `unregister <id>` | `commands/register.ts` | Bỏ đăng ký project |
| `list` | `commands/register.ts` | Liệt kê tất cả projects |
| `index [path]` | `commands/index-cmd.ts` | Index (--docs, --delta, --all) |
| `validate [path]` | `commands/validate.ts` | Tìm symbols thiếu docs |
| `viz [path]` | `commands/viz.ts` | Start viz server (load tất cả từ registry nếu không có path) |
| `mcp` | `commands/mcp-cmd.ts` | Start MCP server stdio |

### Registry

`src/cli/registry.ts` quản lý `~/.knowsync/registry.json`:

```typescript
interface RegisteredProject {
  id: string;          // stable id derived from code or source signature
  name: string;
  docSources: Array<{ path: string; label?: string }>;
  codeSources?: Array<{ path: string; label?: string }>;
  registeredAt: number;
}
```

---
