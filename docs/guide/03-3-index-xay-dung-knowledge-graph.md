# 3. Index (xây dựng knowledge graph)

`Index` chỉ quét trong các source đã cấu hình:

- code chỉ lấy từ `Code Sources`
- docs chỉ lấy từ `Doc Sources`

Nếu chưa cấu hình source tương ứng, phần đó sẽ không được index.

Tài liệu này bám theo `@runIndex` và quy tắc source boundaries ở [[doc:../architecture/02-2-pipeline-tong-the.md#quy-uoc-source-boundaries]] cùng [[doc:../architecture/03-3-filecrawler.md#boundary-rule-khi-index]].

### Index một project

```bash
# Index code (không có docs)
knowsync index [path]

# Index code + docs Markdown
knowsync index [path] --docs

# Chỉ index các file đã thay đổi (nhanh hơn 10–100x)
knowsync index [path] --delta

# Kết hợp delta + docs
knowsync index [path] --docs --delta
```

### Index tất cả projects

```bash
knowsync index --all
knowsync index --all --docs
knowsync index --all --docs --delta
```

### Sau khi index

KnowSync tính SHA-256 hash từng file và lưu vào bảng `file_cache`. Lần index tiếp theo với `--delta` chỉ xử lý lại những file có hash thay đổi.

### Lưu ý

- `knowsync index [path]` chỉ index code trong `Code Sources`
- `knowsync index [path] --docs` index thêm docs trong `Doc Sources`
- không còn fallback quét toàn bộ repo khi chưa cấu hình source
- nếu code comment hoặc tài liệu nghiệp vụ cần map vào phần này, dùng `@doc:../guide/03-3-index-xay-dung-knowledge-graph.md#3-index-xay-dung-knowledge-graph`

---
