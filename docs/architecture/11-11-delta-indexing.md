# 11. Delta Indexing

Tài liệu này chi tiết hóa [[doc:./01-1-tong-quan.md#1-tong-quan]] và [[doc:./02-2-pipeline-tong-the.md#2-pipeline-tong-the]]. Phần implementation nằm ở `@runIndex`, `@isFileCached`, và `@updateFileCache`.

```
Index lần 1 (full):
  File A (hash: aaa) → index → lưu file_cache(A, aaa)
  File B (hash: bbb) → index → lưu file_cache(B, bbb)

Index lần 2 (--delta):
  File A (hash: aaa) → isFileCached(A, aaa) = true → SKIP
  File B (hash: ccc, đã thay đổi) → isFileCached(B, ccc) = false → index lại
  File C (mới)       → isFileCached(C, ...) = false → index
```

---
