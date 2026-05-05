# 4.6 Tab Docs

Tab này gồm 4 sub-sections:

### Coverage

Liệt kê `Function`, `Class`, `Method` không có docstring và không có DocSection liên kết — nhóm theo file, kèm số dòng.

Nhấn **Refresh** để quét lại. Nhấn **Suggest Links** bên cạnh từng symbol → danh sách gợi ý DocSections có thể liên kết → nhấn **Link** để tạo REFERENCES edge.

> CLI tương đương: `knowsync validate /path/to/project`

Coverage hữu ích nhất khi tài liệu đã dùng đúng trace annotation:

- doc -> code: `@runIndex`, `@GraphDB`, `[[parseDocFile]]`
- doc -> doc: `@doc:../architecture/02-2-pipeline-tong-the.md#source-boundaries`, `[[doc:#indexing-pipeline]]`
- code -> doc: `@doc:../../docs/architecture/02-2-pipeline-tong-the.md#source-boundaries` trong comment/docstring

Ví dụ:

```md
## Indexing Pipeline

Phần này mô tả @runIndex và tham chiếu tiếp sang
[[doc:../architecture/02-2-pipeline-tong-the.md#source-boundaries]].
```

### Linked Docs

Nhập tên symbol → tìm tất cả DocSections đã liên kết với symbol đó (qua edge `DOCUMENTED_BY` hoặc `REFERENCES`).

Nếu một tài liệu chỉ liên kết sang tài liệu khác bằng `@doc:` hoặc `[[doc:...]]`, nó không xuất hiện ở đây; dùng `Visual Docs -> Links` để xem chuỗi doc -> doc.

Trong `Linked Docs`, mỗi card cũng có:

- `Copy @symbol`
- `Copy [[Symbol]]`

để lấy annotation doc -> code cho đúng symbol đang tra.

Phần `Linked Docs` trong `Doc Sync` cũng có cùng hai nút copy này.

### Doc Layers

Trong `Links`, khối `Doc Layers` cho phép nhập `DocSection heading` hoặc `doc:... id` để xem hai chiều của `REFERENCES_DOC`:

- `Before`: các tài liệu mà section hiện tại đang tham chiếu tới bằng `@doc:` hoặc `[[doc:...]]`
- `After`: các tài liệu khác đang trỏ ngược về section hiện tại để chi tiết hóa hoặc kế thừa nó

Bạn cũng có thể bấm nút `Layers` ngay trên từng dòng trong bảng links để mở nhanh đúng `DocSection`.

Trong mỗi item của `Doc Layers` còn có:

- `Trace Flow`: mở tab `Flow` ở mode `Doc -> Code` với doc đó làm điểm bắt đầu
- `Copy @doc`: copy annotation như `@doc:../prd/checkout.md#checkout-flow`
- `Copy [[doc]]`: copy annotation như `[[doc:../prd/checkout.md#checkout-flow]]`

Nếu target nằm trong cùng file, UI sẽ tự copy dạng ngắn `@doc:#slug` hoặc `[[doc:#slug]]`.

Thanh filter phía trên `Links` hỗ trợ:

- `All`: hiện cả bảng doc -> code và khối doc layers
- `Doc->Code`: chỉ tập trung vào manual linking và bảng links
- `Before`: chỉ tập trung vào upstream docs
- `After`: chỉ tập trung vào downstream docs

### Mark doc -> doc

Khi cần cập nhật `PRD` để link lên `BRD` mà chưa sửa markdown ngay:

1. vào `BRD`, copy source bằng `Copy @doc` hoặc `Copy [[doc]]`
2. sang `Docs -> Links`
3. nhập `PRD doc section heading or ID`
4. dán copied source như `doc:../brd/PLA-01.md#tong-quan-nghiep-vu`, `@doc:...`, hoặc `[[doc:...]]`
5. bấm `Validate`
6. nếu resolve đúng target `BRD`, bấm `Mark`

`Mark` sẽ làm hai việc:

- tạo manual edge `REFERENCES_DOC` để graph thấy quan hệ ngay
- tạo pending mark để AI agent hoặc user cập nhật markdown gốc sau đó

Agent có thể đọc marks qua `knowsync_get_doc_link_marks`. Với `markType = doc_doc`, payload sẽ chứa:

- source doc (`docSectionId`, `docHeading`, `docFilePath`)
- target doc (`targetDocSectionId`, `targetDocHeading`, `targetDocFilePath`, `targetDocSlug`)
- annotation chuẩn để thêm vào source doc (`annotationText`, `wikiAnnotationText`)

### Doc Sync

Kiểm tra một symbol cụ thể: có docstring trong code không? Có DocSection liên kết không? Cho biết trạng thái "in sync" hay "out of sync".

`Doc Sync` kiểm tra map giữa symbol và tài liệu. Nó không thay thế việc kiểm tra tầng tài liệu trước/sau; phần đó nằm ở `REFERENCES_DOC`.

Nếu symbol đã có linked docs, các card trong `Doc Sync` cũng có `Copy @symbol` và `Copy [[Symbol]]`.

### Validate Links

Tìm các REFERENCES edges đến symbols không còn tồn tại (stale links do symbol đổi tên hoặc bị xóa). Nhấn **Check** để quét toàn bộ. Kết quả liệt kê các stale edges kèm thông tin DocSection và Symbol liên quan.

Khi chuẩn hóa repo, nên ưu tiên:

- giữ `@symbol` / `[[Symbol]]` cho doc -> code
- giữ `@doc:` / `[[doc:...]]` cho doc -> doc và code -> doc
- không dùng câu chữ mơ hồ như "xem phần parser" nếu không có annotation cụ thể

---
