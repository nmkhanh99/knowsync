# 1. Setup môi trường

```bash
# Yêu cầu
node --version  # >= 20.0.0
npm --version   # >= 9

# Clone và cài deps
git clone <repo-url>
cd knowsync
npm install --legacy-peer-deps

# Build TypeScript → dist/ (bao gồm copy vendor + static assets)
npm run build

# Dev mode (ts-node/tsx, chạy trực tiếp từ src/ không cần build mỗi lần)
npm run dev -- index . --docs

# Type check không emit (nhanh hơn full build)
npm run typecheck
```

> `--legacy-peer-deps` cần vì `tree-sitter-javascript@0.23.x` và `tree-sitter-python@0.23.x` có peer dep lệch nhau với `tree-sitter`.

---
