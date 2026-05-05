# 4.8 Tab MCP

Hiển thị config JSON để kết nối AI tools với project hiện tại qua MCP protocol.

| Tool | File config |
|------|-------------|
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Cursor** | `.cursor/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |

Nhấn **Copy** → dán vào file config tương ứng → khởi động lại AI tool.

> CLI tương đương: `knowsync mcp /path/to/project`

Sau khi kết nối, nên hướng dẫn agent dùng đúng trace annotation khi sửa docs/code:

- doc -> code: `@symbol`, `[[Symbol]]`
- doc -> doc: `@doc:path#slug`, `[[doc:path#slug]]`
- code -> doc: `@doc:path#slug` trong comment/docstring

Ví dụ prompt ngắn cho agent:

```text
Update docs/architecture/02-2-pipeline-tong-the.md and src/indexer/index.ts.
Keep KnowSync trace annotations consistent:
- use @runIndex for doc -> code
- use @doc:../guide/03-3-index-xay-dung-knowledge-graph.md#index for doc -> doc
- use @doc:../../docs/architecture/02-2-pipeline-tong-the.md#index in code comments
```

Các tool MCP hữu ích cho workflow này:

- `knowsync_get_doc_section_content`: đọc nội dung một DocSection, metadata trace, và doc layers (`beforeDocs` / `afterDocs`)
- `knowsync_get_doc_flow_trace`: đi từ một DocSection xuống `beforeDocs` / `afterDocs`, linked symbols và `CALLS` flow
- `knowsync_get_doc_visualization`: xem graph doc-centric, gồm cả `REFERENCES_DOC`
- `knowsync_suggest_doc_links`: tìm gợi ý doc -> code còn thiếu
- `knowsync_validate_links`: rà stale links sau khi đổi tên symbol hoặc di chuyển docs

Nếu đang dùng workflow agent:

- `/trace-doc-to-code-flow` dùng `knowsync_get_doc_flow_trace` làm entry chính
- `/analyze-parse-rules` dùng `knowsync_preview_parse_rules` và `knowsync_preview_apply_parse_rules`

---
