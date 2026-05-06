---
description: Khi viết hoặc sửa tài liệu/code trong KnowSync, phải thêm annotation theo chuẩn để doc-to-doc, doc-to-code, code-to-doc và flow doc->code map đúng trong graph.
alwaysApply: true
---

# KnowSync Trace Commenting

## Rule

Khi chỉnh sửa hoặc tạo mới:

- Markdown trong `Doc Sources`
- comment/docstring trong `Code Sources`
- tài liệu yêu cầu `BRD-*`, `PRD-*`, `FRD-*`

thì phải dùng chuẩn trace annotation của skill `knowsync-trace-commenting`.

## Required syntax

- Doc -> code: `@symbolName` hoặc `[[SymbolName]]`
- Doc -> doc: `@doc:path/to/file.md#slug` hoặc `[[doc:path/to/file.md#slug]]`
- Same-file doc -> doc: `@doc:#slug`
- Code -> doc: `@doc:path/to/file.md#slug` trong comment/docstring
- Requirement trace: giữ nguyên exact ID `BRD-*`, `PRD-*`, `FRD-*`

## Expectations

- Section tài liệu mới phải có primary target rõ ràng nếu đang mô tả code cụ thể
- Tài liệu tầng sau phải reference tài liệu tầng trước bằng `@doc:` hoặc `[[doc:...]]`
- Code mới hoặc code sửa theo yêu cầu nghiệp vụ phải reference tài liệu chi phối hành vi bằng `@doc:...`
- Nếu section đang mô tả một flow, phải chỉ ra symbol entry hoặc symbol chính điều phối flow đó
- Nếu task liên quan parse rules/query packs/artifacts, phải phân tích chúng có ảnh hưởng thế nào tới doc linking và flow trace
- Không dùng mô tả mơ hồ như “xem doc checkout”, “xem phần trên”
- Không dùng alias cho symbol nếu codebase đã có exact symbol name

## Reference

- `@.agents/skills/knowsync-trace-commenting/SKILL.md`
- `@.agents/skills/knowsync-flow-analysis/SKILL.md`
- `@.agents/skills/knowsync-trace-commenting/references/ANNOTATION_PATTERNS.md`
