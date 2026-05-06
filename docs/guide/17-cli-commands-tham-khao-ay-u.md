# CLI commands — tham khảo đầy đủ

| Lệnh | Flags | Mô tả |
|------|-------|-------|
| `knowsync init [path]` | — | Tạo `knowsync.config.json` |
| `knowsync register [path]` | `--docs-source <path>` (repeatable) | Đăng ký project vào registry; `codeSources` cấu hình qua UI/MCP |
| `knowsync unregister <id>` | — | Bỏ đăng ký project khỏi registry |
| `knowsync list` | — | Liệt kê tất cả projects đã đăng ký |
| `knowsync index [path]` | `--docs`, `--delta`, `--all` | Index code từ `Code Sources`, và docs từ `Doc Sources` khi có `--docs` |
| `knowsync validate [path]` | — | Tìm symbols thiếu docs |
| `knowsync viz [path]` | `-p, --port <number>` | Mở Web UI (mặc định port 4242) |
| `knowsync mcp` | — | Khởi động MCP server (stdio) |

Lưu ý:

- CLI không còn fallback quét toàn repo nếu thiếu source config
- `--docs` chỉ có tác dụng khi project đã có `Doc Sources`

---
