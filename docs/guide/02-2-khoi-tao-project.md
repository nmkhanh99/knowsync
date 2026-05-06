# 2. Khởi tạo project

### Bước 1 — Tạo config file (tùy chọn)

```bash
knowsync init [path]
```

Tạo `knowsync.config.json` tại thư mục chỉ định (mặc định là thư mục hiện tại). File này cấu hình per-project:

```json
{
  "include": ["src/**/*.ts", "src/**/*.js"],
  "exclude": ["node_modules", "dist", ".git"],
  "languages": ["typescript", "javascript", "python"],
  "docsGlob": "docs/**/*.md"
}
```

`knowsync.config.json` là **tùy chọn** — nếu không có, KnowSync dùng giá trị mặc định.

### Bước 2 — Đăng ký project vào registry

```bash
knowsync register [path]
```

Đăng ký project vào registry toàn cục `~/.knowsync/registry.json`. Mặc định không bao gồm `Code Sources` hay `Doc Sources`.

CLI hiện chỉ hỗ trợ chỉ định `Doc Sources` trực tiếp bằng flag `--docs-source` (có thể dùng nhiều lần):

```bash
# Chỉ đăng ký project
knowsync register /path/to/myproject

# Đăng ký với một docs source
knowsync register /path/to/myproject --docs-source docs

# Đăng ký với nhiều docs sources
knowsync register /path/to/myproject \
  --docs-source docs \
  --docs-source wiki \
  --docs-source README.md
```

Mỗi `--docs-source` nên là absolute path tới file hoặc thư mục nguồn.

`Code Sources` hiện được cấu hình qua Web UI hoặc MCP config. Sau khi áp dụng rule source-boundary mới:

- không có `Code Sources` thì backend từ chối index code
- chạy `--docs` mà không có `Doc Sources` thì backend từ chối index docs
- không còn fallback quét toàn repo cho code hoặc docs

### Xem danh sách projects đã đăng ký

```bash
knowsync list
```

### Bỏ đăng ký project

```bash
knowsync unregister <id>
```

---
