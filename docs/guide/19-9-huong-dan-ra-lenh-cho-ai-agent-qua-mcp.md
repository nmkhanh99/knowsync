# 9. Hướng dẫn ra lệnh cho AI Agent qua MCP

Sau khi kết nối MCP, có thể ra lệnh trực tiếp cho AI agent bằng ngôn ngữ tự nhiên. Dưới đây là các prompt mẫu theo từng mục tiêu.

### Khám phá Graph

```
1. AI gọi knowsync_preview_parse_rules
   → Kiểm tra query packs/rules trước khi ghi vào DB
2. AI gọi knowsync_preview_apply_parse_rules
   → Apply khi preview sạch, tùy chọn `applyIndex: true`
3. AI gọi knowsync_build_graph
   → Rebuild graph sau khi rules đã ổn
```

```
Dùng knowsync_get_module_overview để xem tổng quan module "indexer"
```
```
Dùng knowsync_search_graph tìm tất cả symbols liên quan đến "parse"
```
```
Dùng knowsync_get_full_context cho function "runIndex" — tôi muốn hiểu toàn bộ flow của nó
```
```
Dùng knowsync_get_process_flow từ entry point "runIndex" depth 5

Dùng knowsync_get_doc_flow_trace với query "Checkout Flow", maxDocDepth 3, maxCodeDepth 5
```

### Đọc Documentation

```
Dùng knowsync_get_linked_docs để xem tài liệu nào đang mô tả function "GraphDB"
```
```
Dùng knowsync_get_doc_section_content với id "doc:abc123" để đọc nội dung đầy đủ
```
```
Dùng knowsync_check_doc_sync cho "upsertNode" — doc có bị outdated không?
```

### Cập nhật / Liên kết Tài liệu

```
Dùng knowsync_validate_links để tìm tất cả doc links bị stale
```
```
Dùng knowsync_suggest_doc_links cho symbol "GraphDB" — gợi ý section nào nên link vào
```
```
Dùng knowsync_create_doc_link để link doc section "doc:abc" với symbol "GraphDB"
```
```
Dùng knowsync_regenerate_doc cho symbol "runIndex" với nội dung Markdown mới tôi cung cấp
```

### Chuẩn annotation khi AI viết docs/code

Khi muốn AI viết tài liệu hoặc comment code sao cho KnowSync map được nhiều tầng tài liệu và code, yêu cầu AI dùng đúng syntax:

```md
@runIndex
[[GraphDB]]
@doc:../architecture/02-2-pipeline-tong-the.md#quy-uoc-source-boundaries
[[doc:../prd/checkout.md#checkout-flow]]
@doc:#chi-tiet-api
FRD-CHECKOUT-001
```

Quy ước chính thức:

- `@symbolName` hoặc `[[SymbolName]]`: doc -> code
- `@doc:path/to/file.md#slug` hoặc `[[doc:path/to/file.md#slug]]`: doc -> doc khác file
- `@doc:#slug` hoặc `[[doc:#slug]]`: doc -> doc trong cùng file
- `@doc:path/to/file.md#slug` trong comment/docstring: code -> doc

Quy ước về hướng layer:

- tài liệu hiện tại trỏ tới tài liệu nền/tầng trước bằng `@doc:` hoặc `[[doc:...]]`
- vì vậy trong UI, `Before` là các docs mà section hiện tại đang tham chiếu tới
- `After` là các docs khác đang trỏ ngược về section hiện tại để chi tiết hóa hoặc kế thừa nó

Ví dụ chính thức:

```md
## Checkout FRD

Kế thừa [[doc:../prd/checkout.md#checkout-flow]].
Phần triển khai chính nằm ở @runIndex.
Xem thêm [[doc:#error-handling]].
```

```ts
/**
 * Đồng bộ flow checkout với tài liệu nghiệp vụ.
 * @doc:../../docs/prd/checkout.md#checkout-flow
 * @doc:../../docs/frd/checkout.md#checkout-frd
 */
```

Ví dụ prompt:

```
Hãy cập nhật tài liệu này theo chuẩn KnowSync trace commenting:
- doc -> code bằng @symbol hoặc [[Symbol]]
- doc -> doc bằng @doc:path#slug hoặc [[doc:path#slug]]
- nếu sửa code comment thì thêm @doc:... tới PRD/FRD liên quan
```

### Re-index sau khi code thay đổi

```
Dùng knowsync_build_graph với delta=true, includeDocs=true
```

### Workflow hoàn chỉnh — AI tự phân tích và cập nhật doc

```
Hãy thực hiện theo thứ tự:
1. knowsync_get_module_overview cho module "graph"
2. Với mỗi symbol quan trọng, gọi knowsync_check_doc_sync
3. Với symbols thiếu doc, gọi knowsync_suggest_doc_links để tìm sections liên quan
4. Tạo links phù hợp bằng knowsync_create_doc_link
5. Cuối cùng gọi knowsync_validate_links để báo cáo coverage
```

Nếu muốn agent kiểm tra doc layers trước/sau của một section:

```
1. Dùng knowsync_get_doc_section_content để đọc DocSection
2. Đọc trực tiếp `beforeDocs` và `afterDocs`
3. Nếu cần compatibility với dữ liệu cũ, có thể fallback sang `relatedDocs`
4. Nếu cần sửa docs, giữ nguyên chuẩn @doc:path#slug hoặc [[doc:path#slug]]
```

Nếu muốn agent đi trọn flow từ tài liệu xuống code:

```
1. Dùng knowsync_get_doc_flow_trace với query là heading hoặc doc:<id>
2. Kiểm tra beforeDocs / afterDocs / linkedSymbols / codeFlows
3. Nếu flow thiếu, xác định là do docs, code comments, hay parse rules
4. Chỉ sau đó mới sửa docs/code hoặc apply parse rules
```

Nếu nghi parse rules là nguyên nhân:

```
1. Dùng knowsync_preview_parse_rules hoặc knowsync_preview_apply_parse_rules
2. Kiểm tra captures name/source/target/doc/symbol
3. Đối chiếu lại với knowsync_get_doc_flow_trace
```

---
