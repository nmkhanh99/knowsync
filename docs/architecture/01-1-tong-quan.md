# 1. Tổng quan

KnowSync phân tích tĩnh repo (code + docs) và lưu kết quả vào SQLite dạng knowledge graph. Ngoài parser tĩnh (Tree-sitter + remark), AI agent có thể cung cấp Tree-sitter S-expression rules qua MCP để mở rộng khả năng nhận diện symbols. MCP server hiện expose graph qua 27 tools để AI bên ngoài truy vấn, preview rules, quản lý RuleSets và đồng bộ docs-link workflow.

Tài liệu này là entrypoint tổng quát. Chi tiết pipeline xem [[doc:./02-2-pipeline-tong-the.md#2-pipeline-tong-the]], chi tiết crawler xem [[doc:./03-3-filecrawler.md#3-filecrawler]], và delta behavior xem [[doc:./11-11-delta-indexing.md#11-delta-indexing]].

Khi đọc tài liệu này, agent nên bám trực tiếp các symbol thật như `@runIndex`, `@parseCodeFile`, `@parseDocFile`, `@GraphDB`, `@getDocVisualization` và [[Visual Docs]] để tạo edge giữa docs ↔ code. Quy ước traceability hiện dùng các ID kiểu `BRD-REQ-001`, `PRD-UI-002`, `FRD-TRACE-003`.

---
