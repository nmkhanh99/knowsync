# Troubleshooting

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `command not found: knowsync` | Chưa link global | `npm link` trong thư mục knowsync |
| `ENOENT: dist/viz/public/index.html` | Chưa build | `npm run build` |
| `Sigma is not defined` | Vendor files chưa được copy | `npm run build` |
| `marked is not defined` | Vendor files chưa được copy | `npm run build` |
| Graph trống trong UI | Chưa index | Nhấn **⟳ Index** trong UI |
| `Cannot find module` | Chưa build hoặc build cũ | `npm run build` |
| `--legacy-peer-deps` lỗi | npm version cũ | Nâng npm >= 9 |
| Doc graph không hiển thị links | Chưa index docs | `--docs` flag khi index |
| MCP tools không thấy project | Project chưa đăng ký | `knowsync register [path]` |
