# Hướng dẫn sử dụng KnowSync

Guide này mô tả cách dùng KnowSync theo boundary mới:

- code chỉ index từ `Code Sources`
- docs chỉ index từ `Doc Sources`
- `Visual Docs` hiển thị cả doc -> code và doc -> doc

Khi viết docs hoặc prompt cho agent, ưu tiên:

- `@runIndex`, `[[GraphDB]]` cho doc -> code
- `@doc:../architecture/02-2-pipeline-tong-the.md#source-boundaries` cho doc -> doc
- `@doc:../../docs/guide/03-3-index-xay-dung-knowledge-graph.md#index` trong code comments cho code -> doc

## Muc luc

- [1. Yêu cầu hệ thống và cài đặt](./01-1-yeu-cau-he-thong-va-cai-at.md)
- [2. Khởi tạo project](./02-2-khoi-tao-project.md)
- [3. Index (xây dựng knowledge graph)](./03-3-index-xay-dung-knowledge-graph.md)
- [4. Web UI](./04-4-web-ui.md)
- [4.1 Tab Graph](./05-4-1-tab-graph.md)
- [4.2 Tab Search](./06-4-2-tab-search.md)
- [4.3 Tab Impact](./07-4-3-tab-impact.md)
- [4.4 Tab Flow](./08-4-4-tab-flow.md)
- [4.5 Tab Module](./09-4-5-tab-module.md)
- [4.6 Tab Docs](./10-4-6-tab-docs.md)
- [4.7 Tab Visual Docs](./11-4-7-tab-visual-docs.md)
- [4.8 Tab MCP](./12-4-8-tab-mcp.md)
- [5. Cấu hình Sources](./13-5-cau-hinh-doc-sources.md)
- [6. Cấu hình MCP (Claude Code CLI, Claude Desktop, Cursor, Windsurf)](./14-6-cau-hinh-mcp-claude-code-cli-claude-desktop-cursor-windsurf.md)
- [7. MCP Tools — bảng đầy đủ](./15-7-17-mcp-tools-bang-ay-u.md)
- [8. AI Parse Rules](./16-8-ai-parse-rules.md)
- [CLI commands — tham khảo đầy đủ](./17-cli-commands-tham-khao-ay-u.md)
- [Workflow điển hình](./18-workflow-ien-hinh.md)
- [9. Hướng dẫn ra lệnh cho AI Agent qua MCP](./19-9-huong-dan-ra-lenh-cho-ai-agent-qua-mcp.md)
- [Troubleshooting](./20-troubleshooting.md)
- [Ví dụ sử dụng](./examples.md)
