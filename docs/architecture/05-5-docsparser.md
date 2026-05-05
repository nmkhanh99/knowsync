# 5. DocsParser

**File:** `src/indexer/docs-parser.ts`

**Nhiệm vụ:** Parse Markdown, phân đoạn theo heading, trích xuất symbol references.

Tài liệu này chi tiết hóa [[doc:./02-2-pipeline-tong-the.md#2-pipeline-tong-the]] ở nhánh docs, và map trực tiếp tới `@parseDocFile`, `@parseMarkdownSectionsFromText`, `@extractSymbolRefs`, `@extractDocRefs`.

### Luồng xử lý

```
parseDocFile(filePath, contentHash, lastModified)
  1. readFile → source string
  2. unified().use(remarkParse).parse(source) → Markdown AST (remark 15)
  3. visit(tree, ...) — single-pass với SKIP để tránh double-count
  4. Mỗi heading node → DocSection mới:
     - heading: text content của heading
     - slug: slugify(heading) — dùng để tạo anchor
     - headingLevel: 1–6 (h1–h6)
     - content: accumulated text đến heading tiếp theo
     - start_line / end_line: vị trí trong file
  5. Trích xuất symbol references từ content:
     - @symbolName  → RE_AT_REF = /@([A-Za-z$_][\w$]*)/g
     - [[WikiLink]] → RE_WIKI_LINK = /\[\[([^\]]+)\]\]/g
     - @doc:path#slug / [[doc:path#slug]] → doc-to-doc links nhiều tầng
  6. Trả về ParsedDoc { sections }
```

### DocSection schema

```typescript
interface DocSection {
  id: string;           // "doc:" + SHA1(filePath:heading:startLine)[0:16]
  file_path: string;
  heading: string;
  slug: string;         // lowercase, hyphens (dùng cho anchor links)
  heading_level: number; // 1–6
  content: string;      // full Markdown text của section
  metadata?: Record<string, unknown>; // provenance, sourceArtifact, traceability extras
  start_line: number;
  end_line: number;
}
```

`slug` được lưu trong DB và exposed qua MCP tool `knowsync_get_doc_section_content` — AI có thể dùng slug để tạo deep links đến docs.
`metadata.sourceArtifact` được gắn khi DocSection sinh từ `injection_query` hoặc `included_ranges`; Visual Docs và preview trả trực tiếp provenance này để drill vào injected Markdown region root trước khi đi xuống sections con.

Khi agent chỉnh docs/code format để tăng linkability, ưu tiên:
- viết `@runIndex`, `@parseCodeFile`, `@GraphDB` trong Markdown thay vì chỉ nói "hàm này" / "lớp này"
- viết `@doc:../architecture/02-2-pipeline-tong-the.md#2-pipeline-tong-the` hoặc `[[doc:...]]` khi tài liệu này nối tiếp một tài liệu trước đó
- thêm `[[Visual Docs]]`, `[[Module overview]]`, `[[Requirements Trace]]` cho các section liên quan
- gắn requirement IDs BRD/PRD/FRD vào heading hoặc đoạn mô tả để tạo traceability bền

---
