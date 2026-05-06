# Workflow điển hình

### Setup lần đầu

```bash
npm run build
knowsync register /path/to/myproject --docs-source docs --docs-source README.md
knowsync viz
```

Hoặc hoàn toàn qua UI:
1. `knowsync viz`
2. Nhấn **+** → chọn folder → Add (lặp cho từng project)
3. Nhấn **⚙** → Code Sources → thêm `src` → Save
4. Nhấn **⚙** → Doc Sources → thêm `docs`, `README.md` → Save
5. Nhấn **All** trong index bar → đợi index xong
6. Mở tab **Graph** để khám phá

Nếu muốn dùng CLI để index ngay sau bước đăng ký, cần cấu hình `Code Sources` trước qua UI hoặc MCP. Khi chưa có `Code Sources`, backend sẽ từ chối index code.

### Hàng ngày

1. `knowsync viz` (nếu chưa chạy)
2. Nhấn **⟳ Index** (tick **Delta**) sau khi commit code
3. Dùng Search / Impact / Flow để navigate

### Trước khi refactor

1. Tab **Impact** → nhập tên symbol → Analyze
2. Tab **Flow** → trace call chain từ entry point
3. Nếu thay đổi bắt đầu từ tài liệu: dùng mode **Doc -> Code** trong tab **Flow**
4. Nếu nghi parser/rules làm flow bị đứt: chạy workflow `analyze-parse-rules`
3. Tab **MCP** → copy config → hỏi Claude để phân tích sâu hơn

### Kiểm tra docs coverage

Tab **Docs** → sub-tab **Coverage** → xem danh sách symbols thiếu documentation.

### Xây dựng doc-code links với AI

1. Tab **MCP** → copy config → cài vào Claude Desktop / Cursor
2. Yêu cầu AI: "Dùng `knowsync_suggest_doc_links` tìm symbols chưa được link trong docs/architecture/full.md"
3. AI review suggestions, ưu tiên các suggestion `alreadyLinked = false`
4. AI gọi `knowsync_create_doc_link` cho từng cặp `DocSection ↔ Symbol` cần link
5. AI gọi `knowsync_validate_links` để kiểm tra stale links và coverage sau khi link xong
6. Tab **Visual Docs** → xem graph doc-code sau khi tạo links

Khi agent sửa docs, nên yêu cầu rõ trace syntax:

- doc -> code: `@symbol`, `[[Symbol]]`
- doc -> doc: `@doc:path#slug`, `[[doc:path#slug]]`
- code -> doc: `@doc:path#slug` trong comment/docstring

Workflow ngắn cho agent:

```
1. knowsync_suggest_doc_links
   → lấy danh sách candidate links từ doc hoặc symbol
2. knowsync_create_doc_link
   → tạo REFERENCES edge thủ công, tồn tại qua re-index
3. knowsync_validate_links
   → kiểm tra stale links và tổng coverage
```

Nguyên tắc:
- dùng `suggest` để tìm cặp tiềm năng, không link mù
- dùng `create` khi đã quyết định cặp chính xác
- dùng `validate` để dọn stale links sau mỗi vòng re-index

### Workflow mới cho agent

- `/setup-parse-rules`
  - workflow duy nhất để setup hoặc mở rộng parse rules cho một project; truyền `projectCode=...` để chạy đủ chuỗi baseline -> round goal -> preview/refine -> RuleSet/apply -> rebuild/validate
  - nếu muốn ép từng vòng nhỏ, thêm `roundGoal=fields|metadata|decorators|doc-links|calls`
- `/trace-doc-to-code-flow`
  - dùng khi user bắt đầu từ tài liệu và muốn biết flow đó map xuống code thế nào
- `/analyze-parse-rules`
  - dùng khi nghi parse rules/query packs/artifacts đang làm sai hoặc thiếu symbol/docs/links

### Bootstrap parse rules cho project mới

Với project như `mrp` đang chưa có parse rules riêng, nên đi theo thứ tự:

1. cấu hình `Code Sources` và `Doc Sources`
2. index baseline để xem parser built-in đã bắt được gì
   - dùng `knowsync_get_graph_stats` để lấy `symbols`, `doc sections`, `edges`, `parse rules`, `parse artifacts`
3. chọn 3-5 file mẫu đại diện
4. chạy workflow `/setup-parse-rules projectCode=<project-code>`
   - ví dụ vòng đầu: `/setup-parse-rules projectCode=mrp focusLanguage=python roundGoal=fields`
5. chỉ apply rules sau khi preview sạch trên file mẫu
6. rebuild graph toàn project
7. nếu flow tài liệu -> code vẫn đứt, chạy tiếp `/analyze-parse-rules` hoặc `/trace-doc-to-code-flow`

Lưu ý:
- baseline và validation của workflow này nên đi qua MCP tools như `knowsync_get_graph_stats`, `knowsync_get_module_overview`, `knowsync_preview_parse_rules`
- không đọc SQLite trực tiếp
- heuristics chi tiết cho workflow này nằm trong skill `knowsync-parse-rules-setup`

---
