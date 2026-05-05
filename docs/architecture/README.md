# Kiến trúc KnowSync

Khi đọc kiến trúc, nên lần theo cả hai loại trace:

- docs -> code qua `@runIndex`, `@parseCodeFile`, `@GraphDB`, `@startVizServer`, `@startMcpServer`
- docs -> docs qua `@doc:path#slug` hoặc `[[doc:path#slug]]`

Mô hình hiện tại có 3 lớp map chính:

- code -> graph từ `Code Sources`
- docs -> graph từ `Doc Sources`
- doc -> doc qua edge `REFERENCES_DOC`

## Muc luc

- [1. Tổng quan](./01-1-tong-quan.md)
- [2. Pipeline tổng thể](./02-2-pipeline-tong-the.md)
- [3. FileCrawler](./03-3-filecrawler.md)
- [4. CodeParser + RulesEngine](./04-4-codeparser-rulesengine.md)
- [5. DocsParser](./05-5-docsparser.md)
- [6. GraphDB — Schema đầy đủ](./06-6-graphdb-schema-ay-u.md)
- [7. Viz Server — 43 routes](./07-7-viz-server-20-endpoints.md)
- [8. MCP Server — 26 tools](./08-8-mcp-server-17-tools-3-groups.md)
- [9. Web UI — 8 tabs](./09-9-web-ui-8-tabs.md)
- [10. CLI — 8 commands](./10-10-cli-8-commands.md)
- [11. Delta Indexing](./11-11-delta-indexing.md)
- [12. Two-Pass Call Resolution](./12-12-two-pass-call-resolution.md)
- [13. Node ID và Edge ID](./13-13-node-id-va-edge-id.md)
- [14. Clustering](./14-14-clustering.md)
- [15. Dependency stack](./15-15-dependency-stack.md)
- [16. Bản đồ liên kết code và tài liệu](./16-16-code-doc-link-map.md)
- [17. Audit parse/link cho UI public](./17-17-index-html-parse-audit.md)
