# trace-doc-to-code-flow

## Description
Phân tích nhiều tầng tài liệu, nối xuống code và `CALLS` flow để xác định rõ flow trong tài liệu map xuống flow trong code như thế nào.

## Steps
1. Xác định `focus doc` từ heading, `doc:<id>`, hoặc section user đang nhắc tới.
2. Dùng `knowsync_get_doc_flow_trace` để lấy chuỗi `before docs` -> `focus doc` -> `after docs` -> `linked symbols` -> `code flows`.
3. Nếu flow doc chưa đủ dày, đọc thêm `knowsync_get_doc_section_content` để kiểm tra `beforeDocs`, `afterDocs`, `linkedSymbols`, `linkedDocTargets`.
4. Với symbol chính, dùng `knowsync_get_process_flow` hoặc `knowsync_get_full_context` để kiểm tra entry point, direct callees, transitive callers.
5. Nếu flow bị đứt, phân loại nguyên nhân:
   - doc thiếu `@doc:` / `[[doc:...]]`
   - doc thiếu `@symbol` / `[[Symbol]]`
   - code thiếu `@doc:...` trong comment/docstring
   - `CALLS` edges chưa được parse đúng
   - parse rules/artifacts đang capture sai
6. Nếu cần vá source:
   - thêm annotation doc -> doc
   - thêm annotation doc -> code
   - thêm comment code -> doc
   - cập nhật docs hướng dẫn liên quan
7. Pause for user approval nếu cần sửa diện rộng nhiều docs/code files cùng lúc.

**Note**: Luôn tuân thủ Rule protect-base-meta-skills và protect-meta-engineer-agent.
