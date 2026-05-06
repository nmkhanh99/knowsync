---
name: knowsync-flow-analysis
description: Phân tích luồng từ tài liệu nhiều tầng xuống code và CALLS flow, đồng thời đánh giá parse rules/query packs/artifacts ảnh hưởng thế nào tới symbol extraction, doc linking và flow trace. Use when reviewing docs, code, doc links, MCP traces, Visual Docs, or parse rules in KnowSync.
---

# KnowSync Flow Analysis

## Goal
Phân tích đúng chuỗi:

- doc -> doc
- doc -> code
- code -> code
- parse rules -> extracted docs/symbols/edges

để đi tới kết luận cuối cùng: flow trong tài liệu map xuống flow trong code như thế nào, và parse rules có làm lệch flow đó hay không.

## Use this skill when

- User yêu cầu phân tích luồng nghiệp vụ hoặc implementation flow
- Cần đi từ một `DocSection` xuống các symbol và `CALLS` flow
- Cần review tài liệu nhiều tầng bằng `@doc:` / `[[doc:...]]`
- Cần phân tích tác động của parse rules, query packs, artifacts lên graph
- Cần giải thích vì sao một flow không map được từ doc xuống code

## Canonical analysis order

### 1. Tài liệu gốc

Xác định:

- `focus doc`
- `before docs` bằng `REFERENCES_DOC` outgoing
- `after docs` bằng `REFERENCES_DOC` incoming

Không nhảy vào code trước khi chốt được layer tài liệu.

### 2. Liên kết doc -> code

Từ `focus doc` và các doc downstream:

- đọc `linkedSymbols`
- đọc `primarySymbolName`
- kiểm tra `REFERENCES`, `DOCUMENTED_BY`, `EXPLAINS_FLOW`

Ưu tiên symbol được nhắc trong heading/câu đầu hoặc có edge exact-match.

### 3. Liên kết code -> code

Từ từng symbol chính:

- lấy `direct callers`
- lấy `direct callees`
- trace `CALLS` flow theo depth phù hợp

Nếu doc mô tả workflow, không dừng ở một symbol đơn lẻ; phải nhìn cả chain `CALLS`.

### 4. Parse rules analysis

Khi flow không map đúng, luôn kiểm tra:

- parse rules built-in có đủ cho language đó chưa
- AI `rules[]`, `queryPacks[]`, `artifacts[]` có đang tạo embedded docs / doc links / symbols đúng không
- `preview_parse_rules` hoặc `preview_apply_parse_rules` có show captures đúng file, đúng range, đúng symbol không

## Required tools and views

### Preferred MCP/API sequence for doc -> code flow

1. `knowsync_get_doc_flow_trace`
2. `knowsync_get_doc_section_content`
3. `knowsync_get_process_flow`
4. `knowsync_get_full_context`

### Preferred MCP/API sequence for parse rules analysis

1. `knowsync_preview_parse_rules`
2. `knowsync_preview_apply_parse_rules`
3. `knowsync_get_doc_visualization`
4. `knowsync_get_doc_flow_trace`

## Parse rules checklist

Khi phân tích parse rules, phải trả lời rõ:

1. Rule nào đang tạo node/edge/doc-link?
2. Capture nào map vào `name`, `source`, `target`, `doc`, `symbol`?
3. Embedded docs/comment docs có sinh đúng `linkedSymbols` và `linkedDocTargets` không?
4. Sau khi apply rules, flow `doc -> code -> code` có dày hơn hay lệch đi?
5. Có false positive nào làm `linkedSymbols` hoặc `REFERENCES_DOC` sai không?

## Expected output shape

Mỗi phân tích nên chốt theo 4 khối:

1. `Doc Layers`
2. `Linked Symbols`
3. `Code Flow`
4. `Parse Rule Findings`

## Failure patterns to catch

- Doc tầng dưới không reference doc tầng trước
- Doc có mention symbol nhưng không tạo edge exact-match
- Code có implementation nhưng comment không map về doc
- `CALLS` flow đúng nhưng doc lại link sai symbol entry point
- Parse rules tạo đúng doc section nhưng capture sai symbol
- Artifact inject markdown đúng vùng nhưng slug/path không resolve được sang `REFERENCES_DOC`

## Done criteria

- Có chỉ ra `focus doc`
- Có before/after docs nhiều cấp nếu tồn tại
- Có symbol chính và call flow chính
- Nếu flow sai hoặc thiếu, có kết luận do docs, code comments, hay parse rules
