# 1. Yêu cầu hệ thống và cài đặt

### Yêu cầu

- Node.js >= 20.0.0
- npm >= 9

### Cài đặt

```bash
git clone <repo-url>
cd knowsync
npm install --legacy-peer-deps
npm run build
npm link
```

> `npm run build` biên dịch TypeScript, copy UI assets và vendor JS (sigma, graphology, marked) vào `dist/`.
> `npm link` tạo symlink global để dùng lệnh `knowsync` từ bất kỳ đâu.

Không muốn link global:

```bash
node dist/cli/index.js <command>
```

> `--legacy-peer-deps` cần vì `tree-sitter-javascript@0.23.x` và `tree-sitter-python@0.23.x` có peer dep lệch nhau với `tree-sitter`.

---
