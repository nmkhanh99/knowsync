# 5. Cấu hình Sources

`codeSources` và `docSources` là hai phạm vi index riêng cho từng project. Chúng được lưu trong registry (`~/.knowsync/registry.json`) hoặc DB config của project.

KnowSync hiện dùng ranh giới rõ ràng giữa hai loại source:

- `Code Sources`: chỉ để quét code và sinh graph code
- `Doc Sources`: để quét tài liệu Markdown, đồng thời cho phép embedded docs/comment-docs từ code được lưu thành `DocSection` và tạo doc links

Mỗi entry có dạng:

```json
{ "path": "docs", "label": "guides" }
```

`label` là tùy chọn. `path` là đường dẫn tương đối trong repo (file hoặc thư mục).

### 3 cách cấu hình docSources

**1. Khi đăng ký qua CLI:**

```bash
knowsync register /path/to/myproject \
  --docs-source docs \
  --docs-source wiki \
  --docs-source README.md
```

**2. Qua Web UI (config panel):**

Nhấn **⚙** → tìm phần **Doc Sources** → Add entry (nhập path và label tùy chọn) → **Save**.

**3. Qua MCP tool:**

```json
{
  "tool": "knowsync_build_graph",
  "args": {
    "rootPath": "/path/to/myproject",
    "includeDocs": true,
    "docSources": [
      { "path": "docs" },
      { "path": "README.md" }
    ]
  }
}
```

### Hành vi khi docSources rỗng

Nếu `docSources` không được cấu hình (mảng rỗng), KnowSync sẽ **không index docs** khi chạy `--docs`.

Ngoài ra:

- embedded docs trích từ file code sẽ **không** được persist vào graph nếu project không cấu hình `docSources`
- nếu bạn muốn một file trong `src/` vừa được index như code vừa được xem như nguồn tài liệu, file hoặc thư mục chứa nó phải nằm trong `docSources`

### Khi nào cần re-index

Sau khi đổi `docSources` hoặc `codeSources`, nên chạy lại `Index` để dọn dữ liệu cũ và rebuild graph theo boundary mới.

### Cấu hình codeSources

CLI hiện chưa có flag riêng cho `codeSources`. Có 2 cách chính:

**1. Qua Web UI (config panel):**

Nhấn **⚙** → tìm phần **Code Sources** → Add entry → **Save**.

**2. Qua MCP tool:**

```json
{
  "tool": "knowsync_set_visual_docs_config",
  "args": {
    "codeSources": [
      { "path": "src", "label": "app" }
    ],
    "docSources": [
      { "path": "docs", "label": "docs" }
    ]
  }
}
```

---
