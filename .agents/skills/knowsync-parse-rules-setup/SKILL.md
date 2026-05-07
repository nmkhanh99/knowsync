---
name: knowsync-parse-rules-setup
description: >-
  Thiết lập, mở rộng, hoặc sửa parse rules cho một project KnowSync theo
  projectCode bằng MCP-only flow: chọn file mẫu, preview/refine rules theo
  từng vòng, apply vào RuleSet, rebuild graph, và validate coverage/flow.
  Use when setting up parse rules for a new project, extending parser coverage
  for a language/framework, or fixing broken extraction caused by parse rules.
---

# KnowSync Parse Rules Setup

## Goal
Thiết lập hoặc mở rộng parse rules theo vòng lặp an toàn:

- project config -> sample files
- preview/refine rules
- apply vào RuleSet
- rebuild graph
- validate symbol/doc/link/flow

Không đọc SQLite trực tiếp. Không suy luận theo `rootPath`. Chỉ dùng MCP và các `Code Sources` / `Doc Sources` đã cấu hình.

## Use this skill when

- User yêu cầu `/setup-parse-rules`
- Project mới chưa có parse rules
- Parser built-in bỏ sót symbol/edge/doc-link quan trọng
- Cần mở rộng coverage cho framework-specific patterns như Odoo, Django, React conventions
- Cần sửa false positives do parse rules cũ

## Required MCP-first sequence

1. `knowsync_set_active_project`
2. `knowsync_get_project_info`
3. `knowsync_get_graph_stats`
4. `knowsync_rule_sets`
5. `knowsync_preview_parse_rules`
6. `knowsync_preview_apply_parse_rules`
7. `knowsync_provide_parse_rules`
8. `knowsync_build_graph`
9. `knowsync_get_module_overview`
10. `knowsync_get_symbol`
11. `knowsync_get_doc_flow_trace`

## Canonical setup order

### 1. Resolve project and sources

Xác định:

- `projectCode`
- `Code Sources`
- `Doc Sources`
- `focusLanguage`

Nếu `Code Sources` chưa có hoặc sai, sửa config trước khi nói về rules.

### 2. Measure baseline

Ghi lại:

- `symbolCount`
- `edgeCount`
- `docSectionCount`
- `parseRuleCount`
- file/module coverage trên 3-5 file mẫu

Không dùng baseline toàn project mơ hồ. Luôn có baseline theo file mẫu.

### 3. Choose one round hypothesis

Mỗi vòng chỉ nên theo một hypothesis rõ ràng, ví dụ:

- thiếu field declarations
- thiếu metadata assignments
- thiếu doc comments / embedded docs
- thiếu edges giữa symbols

Không trộn nhiều hypothesis lớn trong cùng một vòng đầu.

### 4. Preview before apply

Preview trên file thật và kiểm tra:

- `queryErrors`
- `matchDetails`
- false positives rõ ràng
- capture `name`, `source`, `target`, `doc`, `symbol`

Nếu preview bẩn, không apply.

### 5. Persist to a RuleSet

Khi preview ổn:

- tạo hoặc chọn `RuleSet`
- apply đúng rules/artifacts của vòng hiện tại

Giữ rules theo nhóm framework/pattern để còn review về sau.

### 6. Rebuild and validate

Sau apply:

- rebuild graph
- đo lại stats
- spot-check lại file mẫu
- nếu flow docs quan trọng, trace lại `doc -> code -> code`

## Rule design guidance

- Bắt đầu bằng `node` rules trước khi thêm `edge` rules.
- Chỉ thêm `doc_link` rules khi syntax comments/docs của project đã rõ.
- Với framework-specific models, ưu tiên symbols ổn định như:
  - field declarations
  - metadata keys
  - decorator-bound methods
- Không cố “bắt mọi assignment” nếu chỉ cần 1 pattern hẹp.

## Output shape

Mỗi vòng setup nên chốt theo 6 khối:

1. `Project + Sources`
2. `Baseline`
3. `Round Hypothesis`
4. `Candidate Rules`
5. `Post-apply Validation`
6. `Next Round`

## Failure patterns to catch

- Project active đúng nhưng source config sai
- Preview pass trên 1 file nhưng fail trên file mẫu còn lại
- Rule làm tăng symbol count nhưng không tăng coverage có ích
- Rule bắt quá rộng, sinh nhiều `Variable` rác
- Rebuild xong graph dày hơn nhưng `doc -> code` vẫn đứt vì chưa có doc/comment linking

## Done criteria

- Project được chọn theo `projectCode`
- Mọi write đi qua MCP
- Có baseline trước và sau apply
- Có ít nhất một improvement đo được trên file mẫu
- Có kết luận rõ vòng tiếp theo nên làm gì
