# 4.4 Tab Flow

Phân tích flow theo hai hướng:

- `Code Entry`: trace luồng gọi hàm từ entry point
- `Doc -> Code`: đi từ một `DocSection` qua các tầng tài liệu `Before` / `After`, rồi nối xuống các symbol và `CALLS` flow trong code

```
Mode: [Code Entry|Doc -> Code]
Entry: [runIndex hoặc doc heading]   Doc Depth: [3]   Code Depth: [5]   [Trace]
```

Ở mode `Doc -> Code`, kết quả gồm 4 lớp:

1. `Focus Doc`
2. `Before Docs` và `After Docs` theo `@doc:` / `[[doc:...]]`
3. `Linked Symbols` lấy từ `@symbol`, `[[Symbol]]`, hoặc exact heading match
4. `Code Flow` dùng `CALLS` edges để trace từ các symbol đó

Luồng này phục vụ đúng case: từ flow trong tài liệu -> flow trong code.

Từ `Docs` hoặc `Visual Docs`, các card/doc-layer items giờ có nút `Trace Flow` để mở thẳng tab này với `doc:<id>` đã điền sẵn.

---
