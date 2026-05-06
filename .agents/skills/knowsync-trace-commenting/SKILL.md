---
name: knowsync-trace-commenting
description: Chuẩn annotation/comment để viết tài liệu và code trong KnowSync sao cho doc-to-doc, doc-to-code, và code-to-doc map chính xác. Use when creating or updating Markdown docs, code comments, docstrings, requirements, or implementation notes that must stay traceable in the KnowSync graph.
---

# KnowSync Trace Commenting

## Goal
Viết tài liệu và comment code theo một chuẩn duy nhất để KnowSync index ra đúng:

- doc -> code
- doc -> doc
- code -> doc
- requirement -> doc/code
- flow trong tài liệu -> flow trong code

## Use this skill when

- Viết mới hoặc sửa Markdown trong `Doc Sources`
- Viết comment/docstring trong `Code Sources`
- Muốn tài liệu tầng sau map với tài liệu tầng trước
- Muốn code map với một hoặc nhiều tài liệu gốc

## Canonical syntax

### 1. Doc -> code

Dùng exact symbol name:

- `@runIndex`
- `[[GraphDB]]`
- `` `parseCodeFile` `` trong heading cũng được parser ưu tiên

Ưu tiên đặt ở heading hoặc câu mở đầu của section.

### 2. Doc -> doc

Dùng explicit doc refs:

- `@doc:../architecture/01-1-tong-quan.md#tong-quan`
- `[[doc:../prd/checkout.md#checkout-flow]]`
- `@doc:#chi-tiet-api` cho section khác trong cùng file

Luôn dùng path tương đối từ file hiện tại nếu khác file.

### 3. Code -> doc

Trong comment/docstring của code, thêm:

- `@doc:../../docs/frd/checkout.md#checkout-flow`
- `@doc:../../docs/brd/payment.md#business-rules`

Nếu comment nói đến symbol khác, thêm cả `@symbolName`.

### 4. Requirement trace

Giữ nguyên exact requirement IDs:

- `BRD-...`
- `PRD-...`
- `FRD-...`

Không đổi format, không viết lại bằng prose.

## Writing rules

1. Mỗi section tài liệu nên có 1 primary target rõ nhất.
2. Tài liệu tầng sau phải reference tài liệu tầng trước bằng `@doc:` hoặc `[[doc:...]]`.
3. Code triển khai phải reference tài liệu chi phối hành vi bằng `@doc:...`.
4. Dùng exact symbol names đã có trong codebase, không dùng tên diễn giải.
5. Nếu một section nói về nhiều symbol, vẫn chọn 1 symbol chính ở heading/câu đầu, các symbol phụ để trong body.
6. Không dùng doc refs mơ hồ như “xem tài liệu checkout”; phải có path hoặc slug cụ thể.
7. Nếu section mô tả một flow, phải reference entry symbol hoặc symbol chính điều phối flow đó.
8. Nếu code là bước trong flow lớn hơn, comment nên reference cả doc nghiệp vụ tầng trên và doc kỹ thuật tầng dưới nếu có.

## Flow mapping guidance

Khi muốn tài liệu map tới flow code đúng:

- doc tầng trên reference doc tầng dưới bằng `@doc:...`
- doc triển khai reference symbol entry như `@runIndex`
- code ở entry point reference ngược về doc điều phối bằng `@doc:...`
- code các bước con chỉ reference doc riêng nếu hành vi của chúng được mô tả rõ ở doc đó

Không link mọi function nhỏ vào cùng một doc nếu doc chỉ mô tả flow cấp cao.

## Parse rules note

Khi viết parse-rule docs hoặc comment cho parse-rule code:

- docs phải link tới `@previewParseRules`, `@previewApplyParseRules`, `@provideParseRules`, `@applyDocLinkRulesDetailed`, `@applyParseArtifacts` nếu đang nói về pipeline parse/runtime
- code comment nên reference doc kiến trúc hoặc guide parse rules bằng `@doc:...`
- nếu rule sinh doc links hoặc embedded docs, docs phải nói rõ nó ảnh hưởng `doc -> code` hay `doc -> doc`

## Preferred patterns

### Markdown section documenting code

```md
## @runIndex
Điểm vào chính của pipeline index.
Kế thừa [[doc:../architecture/02-2-pipeline-tong-the.md#pipeline-tong-the]].
```

### Markdown section extending another doc

```md
## Checkout Validation Rules
Section này chi tiết hóa @doc:../prd/checkout.md#checkout-flow
và liên hệ code với @validateCheckout.
```

### Code comment/docstring

```ts
/**
 * Triển khai validation cho checkout.
 * @doc:../../docs/prd/checkout.md#checkout-flow
 * @doc:../../docs/frd/checkout.md#checkout-validation-rules
 */
```

## Checklist before finishing

- Có ít nhất một `@symbol` hoặc `[[Symbol]]` khi section/code comment nói về code cụ thể
- Có `@doc:` hoặc `[[doc:...]]` khi tài liệu/code phụ thuộc tài liệu khác
- Requirement IDs giữ đúng format chuẩn
- Không có symbol alias mơ hồ
- Path doc ref có thể resolve được từ file hiện tại

## Read next

- Nếu cần ví dụ đầy đủ: đọc `references/ANNOTATION_PATTERNS.md`
