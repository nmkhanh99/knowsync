# 3. FileCrawler

**File:** `src/indexer/file-crawler.ts`

**Nhiệm vụ:** Quét thư mục, phân loại file code vs doc, tính SHA-256 hash cho delta indexing.

Tài liệu này chi tiết hóa [[doc:./02-2-pipeline-tong-the.md#2-pipeline-tong-the]] và map trực tiếp vào `@crawlRepo`. Quy tắc source boundaries được validate tiếp ở `@validateIndexSources`.

```
crawlRepo(languages?, docSources?, codeSources?)
  → { codeFiles: CrawledFile[], docFiles: CrawledFile[] }
```

### docSources logic

`docSources` được đọc từ registry (`~/.knowsync/registry.json`) theo từng project:

```
docSources = project.docSources  (array of { path, label? })
```

- Nếu `docSources` không rỗng: chỉ quét các paths trong danh sách đó
  - Nếu path là **thư mục**: glob `**/*.md` bên trong
  - Nếu path là **file**: đọc trực tiếp
- Nếu `docSources` rỗng: không quét doc file nào

### codeSources logic

`codeSources` cũng được đọc từ registry (`~/.knowsync/registry.json`) theo từng project:

```
codeSources = project.codeSources  (array of { path, label? })
```

- Nếu `codeSources` không rỗng: chỉ quét các paths trong danh sách đó để parse code
- Nếu `codeSources` rỗng: không quét code file nào

### Boundary rule khi index

- `FileCrawler` chỉ quyết định tập file đầu vào cho code và docs
- Khi `CodeParser` sinh embedded docs từ comment/docstring hoặc injected Markdown, các `DocSection` này chỉ được lưu nếu file gốc nằm trong `docSources`
- Nói ngắn gọn: `Code Sources` dùng để index code, `Doc Sources` dùng để index tài liệu và tạo doc links
- Khi giải thích logic này trong code comment hoặc docs khác, link tới `@filterDocSectionsBySources` và `@validateIndexSources`

### CrawledFile

```typescript
interface CrawledFile {
  filePath: string;       // absolute path
  language: string;       // "typescript" | "javascript" | "python" | "markdown"
  contentHash: string;    // SHA-256(fileContent) — hex string
  lastModified: number;   // Date.now()
}
```

### LANGUAGE_EXTENSIONS

```
.ts / .tsx  → "typescript"
.js / .jsx  → "javascript"
.py         → "python"
.md         → "markdown"
```

---
