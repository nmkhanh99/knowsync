---
description: Khi user yêu cầu phân tích tài liệu, code, flow, trace hoặc parse rules trong KnowSync, phải đi theo chuỗi doc->doc, doc->code, code->code và kiểm tra cả tác động của parse rules.
alwaysApply: true
---

# KnowSync Flow Analysis

## Rule

Khi task chứa một trong các ý sau:

- phân tích flow
- đi từ tài liệu xuống code
- rà liên kết nhiều tầng tài liệu
- giải thích vì sao doc không map được vào code
- phân tích parse rules, query packs, artifacts

thì phải áp dụng skill `knowsync-flow-analysis`.

## Required analysis order

1. Xác định `focus doc` nếu có tài liệu làm điểm bắt đầu
2. Lấy `before docs` và `after docs`
3. Xác định `linked symbols`
4. Trace `CALLS` flow
5. Nếu kết quả thiếu hoặc sai, kiểm tra parse rules/artifacts

## Required evidence

- Không kết luận “doc không link” nếu chưa kiểm tra `REFERENCES_DOC`
- Không kết luận “code không có flow” nếu chưa kiểm tra `CALLS`
- Không kết luận “parser lỗi” nếu chưa preview parse rules hoặc review captures/ranges

## Preferred tools

- `knowsync_get_doc_flow_trace`
- `knowsync_get_doc_section_content`
- `knowsync_get_process_flow`
- `knowsync_get_full_context`
- `knowsync_preview_parse_rules`
- `knowsync_preview_apply_parse_rules`

## Reference

- `@.agents/skills/knowsync-flow-analysis/SKILL.md`
- `@.agents/skills/knowsync-trace-commenting/SKILL.md`
