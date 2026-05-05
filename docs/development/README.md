# Hướng dẫn phát triển KnowSync

Khi sửa code hoặc docs trong repo, nên giữ trace annotation nhất quán:

- doc -> code: `@symbol`, `[[Symbol]]`
- doc -> doc: `@doc:path#slug`, `[[doc:path#slug]]`
- code -> doc: `@doc:path#slug` trong comment/docstring

Ngoài ra, đừng giả định fallback full-repo:

- code cần `Code Sources`
- docs cần `Doc Sources`
- backend sẽ từ chối index nếu thiếu source phù hợp

## Muc luc

- [1. Setup môi trường](./01-1-setup-moi-truong.md)
- [2. Cấu trúc thư mục](./02-2-cau-truc-thu-muc.md)
- [3. Module resolution](./03-3-module-resolution.md)
- [4. Thêm ngôn ngữ mới](./04-4-them-ngon-ngu-moi.md)
- [5. Thêm MCP tool mới (read-only)](./05-5-them-mcp-tool-moi-read-only.md)
- [6. Thêm MCP write tool (tạo/sửa dữ liệu)](./06-6-them-mcp-write-tool-tao-sua-du-lieu.md)
- [7. Thêm API endpoint vào viz server](./07-7-them-api-endpoint-vao-viz-server.md)
- [8. Thêm AI Parse Rule mới](./08-8-them-ai-parse-rule-moi.md)
- [9. Build + Typecheck](./09-9-build-typecheck.md)
- [10. Debug tips](./10-10-debug-tips.md)
- [11. Một số lưu ý khi phát triển](./11-11-mot-so-luu-y-khi-phat-trien.md)
- [Liên kết code và tài liệu](../architecture/16-16-code-doc-link-map.md)
