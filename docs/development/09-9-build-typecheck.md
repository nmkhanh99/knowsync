# 9. Build + Typecheck

### Full build

```bash
npm run build
```

Chạy `tsc` rồi copy vendor files. Output ở `dist/`.

### Typecheck only (không emit, nhanh hơn)

```bash
npm run typecheck
```

Hữu ích khi muốn kiểm tra types nhanh mà không cần rebuild toàn bộ.

### Dev mode (tsx/ts-node)

```bash
# Chạy index command trực tiếp từ src/
npm run dev -- index /path/to/project --docs

# Chạy viz server
npm run dev -- viz /path/to/project
```

---
