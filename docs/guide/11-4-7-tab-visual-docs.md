# 4.7 Tab Visual Docs

Hiển thị subgraph kết nối DocSections với Symbols dưới dạng graph tương tác (Sigma.js riêng biệt). Các region Markdown được inject sẽ xuất hiện thành `EmbeddedDocRegion` root node trước, rồi mới drill xuống các `DocSection` con theo `path`.

Tab này là nơi nhìn rõ nhất 3 lớp map:

- doc -> code qua `REFERENCES` hoặc `DOCUMENTED_BY`
- doc -> doc qua `REFERENCES_DOC`
- region -> section qua `CONTAINS`

### Filter bar

```
Module/File pattern: [indexer    ]   [Load]

Type: [All] [Docs only] [Code only]
```

- **Pattern**: nhập prefix hoặc glob cho file path (ví dụ `indexer`, `src/graph`) → chỉ lấy DocSections thuộc các file khớp pattern. Để trống → load toàn bộ doc graph
- **Type pills**: lọc nodes trên graph — `All` / `Docs only` / `Code only`. `Docs only` gồm cả `EmbeddedDocRegion`

### Graph

| Node màu | Ý nghĩa |
|----------|---------|
| Hồng | DocSection |
| Tím | EmbeddedDocRegion |
| Xanh / Vàng / Tím | Symbol (Function / Method / Class / ...) |

Cạnh nối biểu thị edge type `REFERENCES`, `DOCUMENTED_BY`, `REFERENCES_DOC`, hoặc `CONTAINS` giữa region root và sections con. Kéo / scroll để pan và zoom.

Khi một tài liệu chi tiết hóa tài liệu trước, hãy dùng:

```md
## Checkout FRD

Chi tiết hóa [[doc:../prd/checkout.md#checkout-flow]].
Phần triển khai nằm ở @runIndex.
```

Khi đó graph sẽ có cả cạnh sang DocSection trước đó và cạnh sang symbol liên quan.

### Click panel

- **Nếu là EmbeddedDocRegion**: region gốc của injected Markdown, kèm `sourceArtifact`, range gốc và các section con nested theo `path`
- **Nếu là DocSection**: heading, file path, nội dung Markdown đầy đủ (render bằng marked.js, hiển thị slug anchor), danh sách Linked Symbols, khối `Doc Layers` tách `Before` / `After`, `sourceArtifact` nếu section sinh từ injected region
- **Nếu là Symbol**: type, file:dòng, signature, danh sách Linked Docs

Với node `Document File` hoặc `EmbeddedDocRegion`, preview sẽ gộp nội dung của toàn bộ `DocSection` con bên dưới. Điều này giúp các node kiểu `03-3-filecrawler.md` xem được toàn bộ content của file.

Với node group như `Doc Source` hoặc `Folder Group`, panel không render toàn bộ content gộp vì quá dài. Thay vào đó nó hiện summary scope, còn bạn đi xuống file hoặc section bên dưới để đọc nội dung.

Preview cũng hiện thêm `Content Scope: Aggregated from N sections` cho các node đang hiển thị nội dung gộp.

Nếu chọn một `DocSection` cha như `1. Tổng quan nghiệp vụ`, preview cũng sẽ gồm chính section đó và toàn bộ sub-sections nested bên dưới.

### Links view

Trong `Visual Docs -> Links`, node đang chọn sẽ lấy cả subtree con của nó. Điều này hữu ích khi một section cha đóng vai trò "tài liệu tầng trên", còn các child sections chi tiết hóa dần xuống các flow hoặc symbol cụ thể.

Nếu bấm `Open in Links` từ một node cha/file, `Links` sẽ lấy toàn bộ `DocSection` trong subtree đó và kéo thêm các doc `Before` / `After` ở bên ngoài subtree để hiện toàn cảnh liên kết.

`Doc Layers` trong panel và `Links` graph đều dựa trên `@doc:` / `[[doc:...]]`:

- `Before`: các tài liệu mà section hiện tại đang tham chiếu tới
- `After`: các tài liệu đang trỏ ngược về section hiện tại

Trong graph `Links`, các doc node quanh node trung tâm cũng được gắn nhãn `Before` hoặc `After` ngay trên label để dễ đọc mà không cần suy từ hướng cạnh.

Click vào một doc node trong `Links` sẽ quay lại `Outline`, chọn đúng `DocSection` đó và cuộn cây tới vị trí tương ứng. Click symbol thì vẫn mở overlay chi tiết như trước.

Trong preview panel của `DocSection`, mỗi item trong `Doc Layers` cũng có:

- `Open` để chọn doc đó trong `Outline` và cuộn cây tới đúng vị trí nếu đang nằm ngoài vùng nhìn thấy hoặc ancestor đang bị fold
- `Trace Flow` để mở tab `Flow` ở mode `Doc -> Code`
- `Copy @doc`
- `Copy [[doc]]`

để lấy annotation chuẩn ngay từ `Visual Docs`, không cần quay lại tab `Docs`.

Ở preview panel của node đang chọn cũng có nút `Trace Flow`. Với node cha/file, UI sẽ dùng `DocSection` đầu tiên trong subtree làm focus cho flow trace.

Trong `Linked Symbols`, mỗi symbol cũng có:

- `Copy @symbol`
- `Copy [[Symbol]]`

để lấy annotation doc -> code trực tiếp từ preview panel.

Nếu không thấy cạnh doc -> doc, cần kiểm tra lại `path#slug` và chắc rằng file đó nằm trong `Doc Sources`.

---
