# Docs

KnowSync hiện dùng 2 boundary rõ ràng khi index:

- `Code Sources`: phạm vi duy nhất để index code
- `Doc Sources`: phạm vi duy nhất để parse tài liệu và tạo doc links

Chuẩn trace annotation dùng xuyên suốt tài liệu:

- doc -> code: `@symbol`, `[[Symbol]]`
- doc -> doc: `@doc:path#slug`, `[[doc:path#slug]]`
- code -> doc: `@doc:path#slug` trong comment/docstring

- [Architecture](./architecture/README.md)
- [Implementation Plan — Living Architecture System 2.0](./architecture/19-19-implementation-plan-living-architecture-system-2-0.md)
- [Development](./development/README.md)
- [Guide](./guide/README.md)
- [Requirements](./requirements/README.md)
- [Code ↔ Docs Map](./architecture/16-16-code-doc-link-map.md)
- [UI Public Parse Audit](./architecture/17-17-index-html-parse-audit.md)
