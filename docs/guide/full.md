# Hướng dẫn sử dụng KnowSync

## 1. Yêu cầu hệ thống và cài đặt

### Yêu cầu

- Node.js >= 20.0.0
- npm >= 9

### Cài đặt

```bash
git clone <repo-url>
cd knowsync
npm install --legacy-peer-deps
npm run build
npm link
```

> `npm run build` biên dịch TypeScript, copy UI assets và vendor JS (sigma, graphology, marked) vào `dist/`.
> `npm link` tạo symlink global để dùng lệnh `knowsync` từ bất kỳ đâu.

Không muốn link global:

```bash
node dist/cli/index.js <command>
```

> `--legacy-peer-deps` cần vì `tree-sitter-javascript@0.23.x` và `tree-sitter-python@0.23.x` có peer dep lệch nhau với `tree-sitter`.

---

## 2. Khởi tạo project

### Bước 1 — Tạo config file (tùy chọn)

```bash
knowsync init [path]
```

Tạo `knowsync.config.json` tại thư mục chỉ định (mặc định là thư mục hiện tại). File này cấu hình per-project:

```json
{
  "include": ["src/**/*.ts", "src/**/*.js"],
  "exclude": ["node_modules", "dist", ".git"],
  "languages": ["typescript", "javascript", "python"],
  "docsGlob": "docs/**/*.md"
}
```

`knowsync.config.json` là **tùy chọn** — nếu không có, KnowSync dùng giá trị mặc định.

### Bước 2 — Đăng ký project vào registry

```bash
knowsync register [path]
```

Đăng ký project vào registry toàn cục `~/.knowsync/registry.json`. Mặc định không bao gồm `Code Sources` hay `Doc Sources`.

CLI hiện chỉ hỗ trợ chỉ định `Doc Sources` trực tiếp bằng flag `--docs-source` (có thể dùng nhiều lần):

```bash
# Chỉ đăng ký project
knowsync register /path/to/myproject

# Đăng ký với một docs source
knowsync register /path/to/myproject --docs-source docs

# Đăng ký với nhiều doc sources
knowsync register /path/to/myproject \
  --docs-source docs \
  --docs-source wiki \
  --docs-source README.md
```

Mỗi `--docs-source` nên là absolute path tới file hoặc thư mục nguồn.

`Code Sources` hiện được cấu hình qua Web UI hoặc MCP config. Sau khi áp dụng rule source-boundary mới:

- không có `Code Sources` thì backend từ chối index code
- chạy `--docs` mà không có `Doc Sources` thì backend từ chối index docs
- không còn fallback quét toàn repo cho code hoặc docs

### Xem danh sách projects đã đăng ký

```bash
knowsync list
```

### Bỏ đăng ký project

```bash
knowsync unregister <id>
```

---

## 3. Index (xây dựng knowledge graph)

### Index một project

```bash
# Index code (không có docs)
knowsync index [path]

# Index code + docs Markdown
knowsync index [path] --docs

# Chỉ index các file đã thay đổi (nhanh hơn 10–100x)
knowsync index [path] --delta

# Kết hợp delta + docs
knowsync index [path] --docs --delta
```

### Index tất cả projects

```bash
knowsync index --all
knowsync index --all --docs
knowsync index --all --docs --delta
```

### Sau khi index

KnowSync tính SHA-256 hash từng file và lưu vào bảng `file_cache`. Lần index tiếp theo với `--delta` chỉ xử lý lại những file có hash thay đổi.

---

## 4. Web UI

```bash
knowsync viz [path]

# Chọn port khác
knowsync viz --port 3000
```

Trình duyệt tự mở tại `http://localhost:4242`. Nếu không, mở thủ công.

### Layout sidebar

```
┌───────────────────────────────┐
│ ◈ KnowSync          0.1       │
├───────────────────────────────┤
│ PROJECT  [dropdown ▼] [+] [⚙] │
│  ↳ add-project form / config  │
├───────────────────────────────┤
│ [⟳ Index] [All]   □ Delta     │
├───────────────────────────────┤
│ ◉ Graph                       │
│ ⌕ Search                      │
│ ⚑ Impact                      │
│ ⟶ Flow                        │
│ ▤ Module                      │
│ ✓ Docs                        │
│   Visual Docs                  │
│ ⬡ MCP                         │
├───────────────────────────────┤
│ Symbols  —                    │
│ Edges    —                    │
│ Clusters —                    │
└───────────────────────────────┘
```

### Quản lý project trong UI

**Thêm project:** Nhấn **`+`** bên cạnh dropdown → form xuất hiện. Nhập đường dẫn thủ công hoặc nhấn **📁** để mở folder picker (macOS native) → nhấn **Add**. Project được đăng ký vào `~/.knowsync/registry.json`, tự động xuất hiện trong dropdown.

**Cấu hình project:** Nhấn **`⚙`** → panel mở ra với các trường Name, Root Path, **Code Sources** và **Doc Sources** editor (thêm/xóa entries). Nhấn **Save** để lưu. Nhấn **Remove from registry** để bỏ đăng ký.

**Chọn project:** Dropdown hiển thị tất cả projects đã đăng ký kèm số symbols. Chọn project khác → toàn bộ 8 tab tự reload.

### Index bar

| Nút | Hành động |
|-----|-----------|
| **⟳ Index** | Quét code + docs của project đang chọn |
| **All** | Quét tất cả projects đã đăng ký |
| **Delta** checkbox | Chỉ index lại file đã thay đổi |

Rule hiện tại:

- code chỉ được index từ `Code Sources`
- docs chỉ được index từ `Doc Sources`
- nếu thiếu source tương ứng, UI sẽ cảnh báo sớm và backend sẽ trả lỗi thay vì index rỗng hoặc fallback quét toàn repo

---

## 4.1 Tab Graph

Trực quan hóa knowledge graph bằng Sigma.js (WebGL).

- Node nhóm theo **cluster** (Louvain algorithm — tự động phát hiện modules chức năng)
- Kích thước node tỉ lệ với số edges
- Màu: `Function` (xanh) · `Class` (xanh lá) · `Method` (vàng) · `Module` (tím) · `DocSection` (hồng)
- **Filter box** góc trên trái: gõ để highlight nodes khớp tên
- **Kéo / scroll** để pan và zoom

**Click node** → panel bên phải:

| Thông tin | Mô tả |
|-----------|-------|
| Type, file, dòng, cluster, signature, docstring | Metadata symbol |
| Callers | Symbols gọi đến node này |
| Callees | Symbols node này gọi đến |
| Linked Docs | DocSections liên kết với node này |
| **⚑ Impact** | Chuyển sang tab Impact, pre-fill tên |
| **⟶ Flow** | Chuyển sang tab Flow, pre-fill tên |

Thanh công cụ Index nằm ngay trên graph để index mà không cần rời tab.

---

## 4.2 Tab Search

Gõ tên symbol hoặc keyword → Enter hoặc nhấn **Search**.

- Tìm kiếm dùng **FTS5/BM25** — kết quả sắp xếp theo relevance, không phải alphabet
- Kết quả chia thành **Symbols** (type badge, file:dòng, signature) và **Documentation**
- **Type filter pills** (xuất hiện khi kết quả có nhiều loại): nhấn vào pill `Function`, `Class`, `Method`, ... để lọc
- **Symbol cards**: nhấn **▶ Detail** để expand, xem Callers, Callees, Linked Docs

---

## 4.3 Tab Impact

Phân tích ảnh hưởng trước khi refactor.

```
Symbol: [upsertNode]   Depth: [3]   [Analyze]
```

| Nhóm | Ý nghĩa |
|------|---------|
| **X direct** | Symbols gọi trực tiếp đến symbol này |
| **Y transitive** | Callers của callers (theo depth đã chọn) |
| **Z docs** | Documentation liên kết với symbol này |

---

## 4.4 Tab Flow

Phân tích flow theo hai hướng:

- `Code Entry`: trace luồng gọi hàm từ entry point
- `Doc -> Code`: đi từ một `DocSection` qua các tầng tài liệu `Before` / `After`, rồi nối xuống các symbol và `CALLS` flow trong code

```
Mode: [Code Entry|Doc -> Code]
Entry: [runIndex hoặc doc heading]   Doc Depth: [3]   Code Depth: [5]   [Trace]
```

Ở mode `Doc -> Code`, kết quả gồm 4 lớp:

1. `Focus Doc`
2. `Before Docs` và `After Docs` theo `@doc:` / `[[doc:...]]`
3. `Linked Symbols` lấy từ `@symbol`, `[[Symbol]]`, hoặc exact heading match
4. `Code Flow` dùng `CALLS` edges để trace từ các symbol đó

Luồng này phục vụ đúng case: từ flow trong tài liệu -> flow trong code.

---

## 4.5 Tab Module

Tổng quan tất cả symbols trong một module hoặc folder.

```
Pattern: [indexer]   [Overview]
```

Kết quả: số symbols / files, top-called symbols, danh sách nhóm theo file.

---

## 4.6 Tab Docs

Tab này gồm 4 sub-sections:

### Coverage

Liệt kê `Function`, `Class`, `Method` không có docstring và không có DocSection liên kết — nhóm theo file, kèm số dòng.

Nhấn **Refresh** để quét lại. Nhấn **Suggest Links** bên cạnh từng symbol → danh sách gợi ý DocSections có thể liên kết → nhấn **Link** để tạo REFERENCES edge.

> CLI tương đương: `knowsync validate /path/to/project`

Coverage hữu ích nhất khi tài liệu đã dùng đúng trace annotation:

- doc -> code: `@runIndex`, `@GraphDB`, `[[parseDocFile]]`
- doc -> doc: `@doc:../architecture/02-2-pipeline-tong-the.md#source-boundaries`, `[[doc:#indexing-pipeline]]`
- code -> doc: `@doc:../../docs/architecture/02-2-pipeline-tong-the.md#source-boundaries` trong comment/docstring

### Linked Docs

Nhập tên symbol → tìm tất cả DocSections đã liên kết với symbol đó (qua edge `DOCUMENTED_BY` hoặc `REFERENCES`).

Nếu một section chỉ liên kết sang tài liệu khác bằng `@doc:` hoặc `[[doc:...]]`, nó không xuất hiện ở đây; dùng `Visual Docs -> Links` để xem chain doc -> doc.

Trong `Linked Docs`, mỗi card cũng có:

- `Copy @symbol`
- `Copy [[Symbol]]`

để lấy annotation doc -> code cho đúng symbol đang tra.

Phần `Linked Docs` trong `Doc Sync` cũng có cùng hai nút copy này.

### Doc Layers

Trong `Links`, khối `Doc Layers` cho phép nhập `DocSection heading` hoặc `doc:... id` để xem hai chiều của `REFERENCES_DOC`:

- `Before`: các tài liệu mà section hiện tại đang tham chiếu tới bằng `@doc:` hoặc `[[doc:...]]`
- `After`: các tài liệu khác đang trỏ ngược về section hiện tại để chi tiết hóa hoặc kế thừa nó

Bạn cũng có thể bấm nút `Layers` ngay trên từng dòng trong bảng links để mở nhanh đúng `DocSection`.

Trong mỗi item của `Doc Layers` còn có:

- `Trace Flow`: mở tab `Flow` ở mode `Doc -> Code` với doc đó làm điểm bắt đầu
- `Copy @doc`: copy annotation như `@doc:../prd/checkout.md#checkout-flow`
- `Copy [[doc]]`: copy annotation như `[[doc:../prd/checkout.md#checkout-flow]]`

Nếu target nằm trong cùng file, UI sẽ tự copy dạng ngắn `@doc:#slug` hoặc `[[doc:#slug]]`.

Thanh filter phía trên `Links` hỗ trợ:

- `All`: hiện cả bảng doc -> code và khối doc layers
- `Doc->Code`: chỉ tập trung vào manual linking và bảng links
- `Before`: chỉ tập trung vào upstream docs
- `After`: chỉ tập trung vào downstream docs

### Mark doc -> doc

Khi cần cập nhật `PRD` để link lên `BRD` mà chưa sửa markdown ngay:

1. vào `BRD`, copy source bằng `Copy @doc` hoặc `Copy [[doc]]`
2. sang `Docs -> Links`
3. nhập `PRD doc section heading or ID`
4. dán copied source như `doc:../brd/PLA-01.md#tong-quan-nghiep-vu`, `@doc:...`, hoặc `[[doc:...]]`
5. bấm `Validate`
6. nếu resolve đúng target `BRD`, bấm `Mark`

`Mark` sẽ làm hai việc:

- tạo manual edge `REFERENCES_DOC` để graph thấy quan hệ ngay
- tạo pending mark để AI agent hoặc user cập nhật markdown gốc sau đó

Agent có thể đọc marks qua `knowsync_get_doc_link_marks`. Với `markType = doc_doc`, payload sẽ chứa:

- source doc (`docSectionId`, `docHeading`, `docFilePath`)
- target doc (`targetDocSectionId`, `targetDocHeading`, `targetDocFilePath`, `targetDocSlug`)
- annotation chuẩn để thêm vào source doc (`annotationText`, `wikiAnnotationText`)

### Doc Sync

Kiểm tra một symbol cụ thể: có docstring trong code không? Có DocSection liên kết không? Cho biết trạng thái "in sync" hay "out of sync".

`Doc Sync` kiểm tra map giữa symbol và tài liệu. Nó không thay thế việc kiểm tra tầng tài liệu trước/sau; phần đó nằm ở `REFERENCES_DOC`.

Nếu symbol đã có linked docs, các card trong `Doc Sync` cũng có `Copy @symbol` và `Copy [[Symbol]]`.

### Validate Links

Tìm các REFERENCES edges đến symbols không còn tồn tại (stale links do symbol đổi tên hoặc bị xóa). Nhấn **Check** để quét toàn bộ. Kết quả liệt kê các stale edges kèm thông tin DocSection và Symbol liên quan.

Khi chuẩn hóa repo, nên ưu tiên:

- giữ `@symbol` / `[[Symbol]]` cho doc -> code
- giữ `@doc:` / `[[doc:...]]` cho doc -> doc và code -> doc
- không dùng câu chữ mơ hồ nếu không có annotation cụ thể

---

## 4.7 Tab Visual Docs

Hiển thị subgraph kết nối DocSections với Symbols dưới dạng graph tương tác (Sigma.js riêng biệt). Các region Markdown được inject sẽ xuất hiện thành `EmbeddedDocRegion` root node trước, rồi mới drill xuống các `DocSection` con theo `path`.

Tab này là nơi nhìn rõ nhất 3 lớp map:

- doc -> code qua `REFERENCES` hoặc `DOCUMENTED_BY`
- doc -> doc qua `REFERENCES_DOC`
- region -> section qua `CONTAINS`

### Filter bar

```
Module/File pattern: [indexer    ]   [Load]

Type: [All] [Docs only] [Code only]
```

- **Pattern**: nhập prefix hoặc glob cho file path (ví dụ `indexer`, `src/graph`) → chỉ lấy DocSections thuộc các file khớp pattern. Để trống → load toàn bộ doc graph
- **Type pills**: lọc nodes trên graph — `All` / `Docs only` / `Code only`. `Docs only` gồm cả `EmbeddedDocRegion`

### Graph

| Node màu | Ý nghĩa |
|----------|---------|
| Hồng | DocSection |
| Tím | EmbeddedDocRegion |
| Xanh / Vàng / Tím | Symbol (Function / Method / Class / ...) |

Cạnh nối biểu thị edge type `REFERENCES`, `DOCUMENTED_BY`, `REFERENCES_DOC`, hoặc `CONTAINS` giữa region root và sections con. Kéo / scroll để pan và zoom.

### Click panel

- **Nếu là EmbeddedDocRegion**: region gốc của injected Markdown, kèm `sourceArtifact`, range gốc và các section con nested theo `path`
- **Nếu là DocSection**: heading, file path, nội dung Markdown đầy đủ (render bằng marked.js, hiển thị slug anchor), danh sách Linked Symbols, khối `Doc Layers` tách `Before` / `After`, `sourceArtifact` nếu section sinh từ injected region
- **Nếu là Symbol**: type, file:dòng, signature, danh sách Linked Docs

Với node `Document File` hoặc `EmbeddedDocRegion`, preview sẽ gộp nội dung của toàn bộ `DocSection` con bên dưới. Điều này giúp các node kiểu `03-3-filecrawler.md` xem được toàn bộ content của file.

Với node group như `Doc Source` hoặc `Folder Group`, panel không render toàn bộ content gộp vì quá dài. Thay vào đó nó hiện summary scope, còn bạn đi xuống file hoặc section bên dưới để đọc nội dung.

Preview cũng hiện thêm `Content Scope: Aggregated from N sections` cho các node đang hiển thị nội dung gộp.

Nếu chọn một `DocSection` cha như `1. Tổng quan nghiệp vụ`, preview cũng sẽ gồm chính section đó và toàn bộ sub-sections nested bên dưới.

### Links view

Trong `Visual Docs -> Links`, node đang chọn sẽ lấy cả subtree con của nó. Điều này hữu ích khi một section cha đóng vai trò "tài liệu tầng trên", còn các child sections chi tiết hóa dần xuống flow hoặc symbol cụ thể.

Nếu bấm `Open in Links` từ một node cha/file, `Links` sẽ lấy toàn bộ `DocSection` trong subtree đó và kéo thêm các doc `Before` / `After` ở bên ngoài subtree để hiện toàn cảnh liên kết.

`Doc Layers` trong panel và `Links` graph đều dựa trên `@doc:` / `[[doc:...]]`:

- `Before`: các tài liệu mà section hiện tại đang tham chiếu tới
- `After`: các tài liệu đang trỏ ngược về section hiện tại

Trong graph `Links`, các doc node quanh node trung tâm cũng được gắn nhãn `Before` hoặc `After` ngay trên label để dễ đọc mà không cần suy từ hướng cạnh.

Click vào một doc node trong `Links` sẽ quay lại `Outline`, chọn đúng `DocSection` đó và cuộn cây tới vị trí tương ứng. Click symbol thì vẫn mở overlay chi tiết như trước.

Trong preview panel của `DocSection`, mỗi item trong `Doc Layers` cũng có:

- `Open` để chọn doc đó trong `Outline` và cuộn cây tới đúng vị trí nếu đang nằm ngoài vùng nhìn thấy hoặc ancestor đang bị fold
- `Trace Flow` để mở tab `Flow` ở mode `Doc -> Code`
- `Copy @doc`
- `Copy [[doc]]`

để lấy annotation chuẩn ngay từ `Visual Docs`, không cần quay lại tab `Docs`.

Ở preview panel của node đang chọn cũng có nút `Trace Flow`. Với node cha/file, UI sẽ dùng `DocSection` đầu tiên trong subtree làm focus cho flow trace.

Trong `Linked Symbols`, mỗi symbol cũng có:

- `Copy @symbol`
- `Copy [[Symbol]]`

để lấy annotation doc -> code trực tiếp từ preview panel.

Nếu không thấy cạnh doc -> doc, cần kiểm tra lại `path#slug` và chắc rằng file đó nằm trong `Doc Sources`.

---

## 4.8 Tab MCP

Hiển thị config JSON để kết nối AI tools với project hiện tại qua MCP protocol.

| Tool | File config |
|------|-------------|
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Cursor** | `.cursor/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |

Nhấn **Copy** → dán vào file config tương ứng → khởi động lại AI tool.

> CLI tương đương: `knowsync mcp`

Sau khi kết nối, nên hướng dẫn agent dùng đúng trace annotation khi sửa docs/code:

- doc -> code: `@symbol`, `[[Symbol]]`
- doc -> doc: `@doc:path#slug`, `[[doc:path#slug]]`
- code -> doc: `@doc:path#slug` trong comment/docstring

Các tool MCP hữu ích cho workflow này:

- `knowsync_get_doc_section_content`: đọc nội dung một DocSection, metadata trace, và doc layers (`beforeDocs` / `afterDocs`)
- `knowsync_get_doc_flow_trace`: đi từ một DocSection xuống `beforeDocs` / `afterDocs`, linked symbols và `CALLS` flow
- `knowsync_get_doc_visualization`: xem graph doc-centric, gồm cả `REFERENCES_DOC`
- `knowsync_suggest_doc_links`: tìm gợi ý doc -> code còn thiếu
- `knowsync_validate_links`: rà stale links sau khi đổi tên symbol hoặc di chuyển docs

Nếu đang dùng workflow agent:

- `/trace-doc-to-code-flow` dùng `knowsync_get_doc_flow_trace` làm entry chính
- `/analyze-parse-rules` dùng `knowsync_preview_parse_rules` và `knowsync_preview_apply_parse_rules`

---

## 5. Cấu hình Sources

`codeSources` và `docSources` là hai phạm vi index riêng cho từng project. Chúng được lưu trong registry (`~/.knowsync/registry.json`) hoặc DB config của project, không dùng fallback full-repo nữa.

- `codeSources`: phạm vi duy nhất để index code
- `docSources`: phạm vi duy nhất để parse tài liệu và tạo doc links

Mỗi entry có dạng:

```json
{ "path": "/abs/path/to/project/docs", "label": "guides" }
```

`label` là tùy chọn. `path` nên là absolute path tới file hoặc thư mục nguồn.

### 3 cách cấu hình docSources

**1. Khi đăng ký qua CLI:**

```bash
knowsync register /path/to/myproject \
  --docs-source docs \
  --docs-source wiki \
  --docs-source README.md
```

**2. Qua Web UI (config panel):**

Nhấn **⚙** → tìm phần **Doc Sources** → Add entry (nhập path và label tùy chọn) → **Save**.

**3. Qua MCP tool:**

```json
{
  "tool": "knowsync_build_graph",
  "args": {
    "includeDocs": true,
    "docSources": [
      { "path": "/abs/path/to/myproject/docs" },
      { "path": "/abs/path/to/myproject/README.md" }
    ]
  }
}
```

### Cấu hình codeSources

CLI hiện chưa có flag riêng cho `codeSources`. Có 2 cách chính:

**1. Qua Web UI (config panel):**

Nhấn **⚙** → tìm phần **Code Sources** → Add entry → **Save**.

**2. Qua MCP tool:**

```json
{
  "tool": "knowsync_set_visual_docs_config",
  "args": {
    "codeSources": [
      { "path": "/abs/path/to/myproject/src", "label": "app" }
    ],
    "docSources": [
      { "path": "/abs/path/to/myproject/docs", "label": "docs" }
    ]
  }
}
```

### Hành vi khi sources rỗng

- nếu `codeSources` rỗng: backend từ chối index code
- nếu chạy index docs mà `docSources` rỗng: backend từ chối index docs
- UI có thể hiện cảnh báo sớm, nhưng backend mới là nơi chốt rule

---

## 6. Cấu hình MCP (Claude Code CLI, Claude Desktop, Cursor, Windsurf)

Sau khi `knowsync mcp` chạy, server lắng nghe trên stdio. Cấu hình tương ứng:

### Claude Code CLI

**Cách 1 — Tạo file `.mcp.json` trong project** (khuyến nghị, commit được vào repo):

```json
{
  "mcpServers": {
    "knowsync": {
      "command": "node",
      "args": [
        "/absolute/path/to/knowsync/dist/cli/index.js",
        "mcp",
        "/path/to/your-project"
      ]
    }
  }
}
```

Đặt file tại root của project đang làm việc. Claude Code tự đọc khi khởi động trong thư mục đó.

**Cách 2 — Dùng lệnh `claude mcp add`** (project scope):

```bash
claude mcp add knowsync node /absolute/path/to/knowsync/dist/cli/index.js mcp /path/to/your-project
```

**Global scope** (áp dụng mọi project):

```bash
claude mcp add --scope global knowsync node /absolute/path/to/knowsync/dist/cli/index.js mcp /path/to/your-project
```

Sau khi thêm, restart session Claude Code rồi gõ `/mcp` để xác nhận `knowsync` xuất hiện trong danh sách.

---

### Claude Desktop

Mở `~/Library/Application Support/Claude/claude_desktop_config.json`, thêm:

```json
{
  "mcpServers": {
    "knowsync": {
      "command": "node",
      "args": ["/absolute/path/to/dist/cli/index.js", "mcp", "/path/to/project"]
    }
  }
}
```

### Cursor

Tạo hoặc chỉnh `.cursor/mcp.json` trong project:

```json
{
  "mcpServers": {
    "knowsync": {
      "command": "node",
      "args": ["/absolute/path/to/dist/cli/index.js", "mcp", "/path/to/project"]
    }
  }
}
```

### Windsurf

Chỉnh `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "knowsync": {
      "command": "node",
      "args": ["/absolute/path/to/dist/cli/index.js", "mcp", "/path/to/project"]
    }
  }
}
```

> Nếu đã `npm link`, có thể dùng `"command": "knowsync"` và `"args": ["mcp", "/path/to/project"]`.

Tab **MCP** trong Web UI tự động tạo config JSON sẵn sàng copy-paste cho từng tool.

---

## 7. MCP Tools — bảng đầy đủ

MCP server hiện cung cấp 30 tools. Bản rút gọn mới nhất nằm ở `docs/guide/15-7-17-mcp-tools-bang-ay-u.md`. Khi agent cần hiểu phần này theo source, bám trực tiếp `@startMcpServer`, `@provideParseRules`, `@previewParseRules`, `@previewApplyParseRules`, `@suggestDocLinks`, `@createDocLink`, `@validateLinks`.

### Nhóm 1 — Graph query và context

| Tool | Params chính | Mô tả |
|------|-------------|-------|
| `knowsync_get_symbol` | `symbolName`, `filePath?` | Thông tin chi tiết symbol: type, file, dòng, signature, docstring, cluster |
| `knowsync_get_callers` | `functionName` | Danh sách symbols gọi đến function này |
| `knowsync_get_linked_docs` | `symbolName` | DocSections liên kết với symbol |
| `knowsync_get_impact` | `symbolName`, `depth` (1–5) | Phân tích impact: direct callers, transitive callers, linked docs |
| `knowsync_get_process_flow` | `entryPoint`, `maxDepth` (1–10) | Trace call chain từ entry point |
| `knowsync_get_doc_flow_trace` | `query`, `maxDocDepth`, `maxCodeDepth` | Trace từ flow tài liệu xuống doc layers, linked symbols, rồi CALLS flow trong code |
| `knowsync_get_graph_stats` | none | Lấy baseline counts của graph, docs, parse rules, parse artifacts và source config của active project |
| `knowsync_search_graph` | `query`, `nodeTypes?`, `limit?` | Tìm kiếm FTS5/BM25 trên symbols và docs |
| `knowsync_check_doc_sync` | `symbolName` | Kiểm tra symbol có docstring và có DocSection liên kết không |
| `knowsync_get_module_overview` | `moduleName` | Tổng quan: symbols, files, top-called trong module |
| `knowsync_get_doc_section_content` | `docSectionId` | Nội dung Markdown đầy đủ của DocSection + slug anchor + sourceArtifact provenance + trace metadata + `relatedDocs` + `beforeDocs` + `afterDocs` |
| `knowsync_get_full_context` | `symbolName` | Context giàu: callers + callees + docs + module siblings |
| `knowsync_get_doc_visualization` | `pattern?` | Subgraph doc-centric (DocSections + embeddedDocRegions + linked Symbols + doc-to-doc edges) |
| `knowsync_get_requirement_trace` | `requirementId?`, `symbolName?` | Truy vết requirement ↔ code ↔ docs |

### Nhóm 2 — Docs linking và regeneration

| Tool | Params chính | Mô tả |
|------|-------------|-------|
| `knowsync_suggest_doc_links` | `docSectionId?`, `symbolName?` | Gợi ý DocSection↔Symbol links chưa được tạo |
| `knowsync_create_doc_link` | `docSectionId`, `symbolName` | Tạo REFERENCES edge thủ công (`is_manual=1`, tồn tại qua re-index) |
| `knowsync_validate_links` | (none) | Tìm stale links + báo cáo coverage stats |
| `knowsync_get_doc_link_marks` | `resolved?` | Lấy pending marks cần phản ánh vào source docs, gồm cả `doc -> symbol` và `doc -> doc` |
| `knowsync_resolve_doc_link_mark` | `markId` | Đánh dấu mark đã được sửa trong markdown gốc |
| `knowsync_regenerate_doc` | `symbolName`, `heading`, `content` | Tạo/cập nhật DocSection với AI content |

### Nhóm 3 — Parse rules runtime

| Tool | Params chính | Mô tả |
|------|-------------|-------|
| `knowsync_provide_parse_rules` | `language`, `rules[]`, `queryPacks[]`, `artifacts[]`, `ruleSetId?` | Ghi parse rules vào DB |
| `knowsync_preview_parse_rules` | `language`, `filePaths?`, `limit?` | Preview rules trên file thật, không ghi DB; nếu không truyền `filePaths` thì chỉ auto-pick từ `Code Sources` |
| `knowsync_preview_apply_parse_rules` | `mode`, `stateToken?`, `applyIndex?` | Preview nhiều vòng rồi apply/index |
| `knowsync_build_graph` | `delta?`, `includeDocs?`, `docSources?`, `codeSources?` | Trigger index + áp dụng parse rules; chỉ scan `Code Sources` và `Doc Sources` |

### Nhóm 4 — Doc source và Visual Docs config

| Tool | Params chính | Mô tả |
|------|-------------|-------|
| `knowsync_scan_doc_sources` | `maxDepth?` | Quét candidate Markdown sources trong active project |
| `knowsync_set_visual_docs_config` | `docSources?`, `codeSources?`, `visualDocs?` | Lưu config phục vụ Visual Docs; `path` trong sources nên là absolute path |

### Nhóm 5 — RuleSet orchestration

| Tool | Params chính | Mô tả |
|------|-------------|-------|
| `knowsync_rule_sets` | `action`, `ruleSetId?`, `language?`, ... | CRUD RuleSet, fork, resolved chain |
| `knowsync_rule_links` | `action`, `sourceId?`, `targetId?`, `linkType?` | Quản lý dependency links giữa RuleSets |

---

## 8. AI Parse Rules

KnowSync cho phép AI agent cung cấp Tree-sitter S-expression rules để mở rộng khả năng nhận diện symbols mà parser mặc định bỏ sót. Runtime hiện hỗ trợ thêm `queryPacks`, `artifacts`, preview nhiều vòng bằng `stateToken`, và RuleSet inheritance.

### Cơ chế

1. AI gọi `knowsync_preview_parse_rules` hoặc `knowsync_preview_apply_parse_rules` để test query trên file thật
2. Khi query sạch, AI gọi `knowsync_provide_parse_rules` để đẩy rules/query packs/artifacts vào SQLite
3. AI gọi `knowsync_build_graph` để trigger index và áp dụng rules từ DB

Rules được lưu persistent trong DB — không cần cung cấp lại sau mỗi lần index.

### Cấu trúc rule

```json
{
  "language": "typescript",
  "rules": [
    {
      "name": "arrow_function",
      "ruleType": "node",
      "nodeType": "Function",
      "query": "(variable_declarator name: (identifier) @name value: (arrow_function))",
      "nameCapture": "name"
    }
  ]
}
```

| Field | Mô tả |
|-------|-------|
| `language` | Ngôn ngữ áp dụng (`typescript`, `javascript`, `python`, ...) |
| `name` | Tên rule (unique per language) |
| `ruleType` | `"node"` (trích xuất symbol) hoặc `"edge"` (trích xuất relationship) |
| `nodeType` | Loại node tạo ra: `Function`, `Class`, `Method`, `Variable`, ... |
| `query` | Tree-sitter S-expression query (chuẩn `tree-sitter query`) |
| `nameCapture` | Tên capture group chứa tên symbol (`@name`) |
| `sourceCapture` | (edge only) Capture group cho source node |
| `targetCapture` | (edge only) Capture group cho target node |
| `edgeType` | (edge only) `CALLS`, `IMPORTS`, ... |
| `priority` | Số nguyên — rule có priority cao hơn chạy trước |

### Ví dụ: nhận diện React components

```json
{
  "language": "typescript",
  "rules": [
    {
      "name": "react_component",
      "ruleType": "node",
      "nodeType": "Function",
      "query": "(variable_declarator name: (identifier) @name value: [(arrow_function) (function_expression)])",
      "nameCapture": "name"
    },
    {
      "name": "react_hook",
      "ruleType": "node",
      "nodeType": "Function",
      "query": "(function_declaration name: (identifier) @name (#match? @name \"^use[A-Z]\"))",
      "nameCapture": "name"
    }
  ]
}
```

### Workflow AI Parse Rules

```
1. AI gọi knowsync_preview_parse_rules(language="typescript", filePaths=["/abs/path/to/project/src/a.ts"], queryPacks=[...])
   → Xem trước `matchDetails`, `queryErrors`, `embeddedDocRegions`
   → Sửa query/rule nếu preview chưa sạch

2. AI gọi knowsync_preview_apply_parse_rules(...)
   → Nếu sạch thì apply rules/query packs vào DB
   → Nếu `applyIndex: true` thì trigger build_graph ngay

3. AI gọi knowsync_provide_parse_rules(language="typescript", rules=[...])
   → Rules lưu vào DB với priority

4. AI gọi knowsync_build_graph(delta=false)
   → RulesEngine load rules từ DB
   → Parse với cả built-in patterns lẫn AI rules
   → Graph được rebuild

5. AI gọi knowsync_get_symbol(symbolName="MyComponent")
   → Kiểm tra symbol đã được nhận diện chưa
```

### Workflow end-to-end cho agent

Đây là luồng nên dùng khi AI cần quét một project từ đầu và tối ưu dần parsing/linking:

```
1. AI đọc cấu trúc project
   → knowsync_get_module_overview
   → knowsync_search_graph
   → knowsync_get_doc_visualization

2. AI suy convention của code/docs
   → Tìm pattern comment/docstring
   → Tìm symbol naming style
   → Tìm doc sources, embedded Markdown regions, requirement IDs

3. AI sinh parse rules/query packs/artifacts
   → knowsync_preview_parse_rules
   → xem matchDetails, queryErrors, embeddedDocRegions
   → chỉnh S-expression, capture names, doc-link rules

4. AI lặp refine một vài vòng
   → knowsync_preview_parse_rules lại cho đến khi query sạch
   → nếu cần apply thử: knowsync_preview_apply_parse_rules
   → nếu muốn lưu: applyIndex=true

5. AI ghi rules ổn định vào DB
   → knowsync_provide_parse_rules
   → knowsync_build_graph để rebuild graph với rules mới

6. AI dựng cây tài liệu và embedded regions
   → knowsync_get_doc_visualization
   → đọc embeddedDocRegions, sourceArtifact, path, parentHeading
   → kiểm tra Visual Docs để xác nhận hierarchy

7. AI link tài liệu với code
   → knowsync_suggest_doc_links
   → knowsync_create_doc_link
   → knowsync_validate_links

8. AI chuẩn hóa comment/doc format để tăng linkability
   → thêm @symbol, [[WikiLink]], BRD/PRD/FRD IDs
   → tách doc comments theo convention ổn định
   → nếu cần cập nhật content docs: knowsync_regenerate_doc

9. AI re-index và kiểm tra lại
   → knowsync_build_graph(delta=true, includeDocs=true)
   → knowsync_check_doc_sync
   → knowsync_get_full_context / knowsync_get_requirement_trace
```

### Lưu rules ổn định rồi rebuild graph

Khi query pack/rules đã ổn, agent chuyển sang lưu DB và rebuild graph:

```json
{
  "language": "typescript",
  "queryPacks": [
    {
      "name": "ts-comment-doc-linking",
      "packType": "comment_doc_linking",
      "rules": [
        {
          "name": "comment-before-function",
          "ruleType": "doc_link",
          "query": "((comment) @doc . (function_declaration name: (identifier) @symbol))",
          "docCapture": "doc",
          "symbolCapture": "symbol"
        }
      ]
    }
  ],
  "artifacts": [
    {
      "name": "ts-markdown-injections",
      "artifactType": "injection_query",
      "content": "((comment) @injection.content (#set! injection.language \"markdown\"))",
      "targetLanguage": "markdown"
    }
  ],
  "replace": false
}
```

1. Gọi `knowsync_provide_parse_rules(...)`
   - lưu rules/query packs/artifacts vào DB
   - nếu `replace: true`, xóa rules cũ của ngôn ngữ đó trước khi lưu

2. Gọi `knowsync_build_graph(...)`
   - `runIndex` đọc lại rules/artifacts từ DB
   - parse code + docs bằng rules mới
   - rebuild graph, edges, docs, requirement trace

3. Kiểm tra kết quả
   - `knowsync_get_symbol`
   - `knowsync_get_doc_visualization`
   - `knowsync_get_requirement_trace`
   - `knowsync_validate_links`

Nguyên tắc:
- `provide_parse_rules` là bước ghi ổn định vào DB.
- `build_graph` là bước áp dụng lại toàn bộ graph từ DB.
- Nếu chỉ muốn test, dùng `preview_parse_rules` trước, không lưu gì.

Nguyên tắc thực thi:
- Preview trước, apply sau.
- Query lỗi thì sửa query, không đẩy thẳng vào DB.
- Khi linking docs, ưu tiên convention ổn định hơn là viết rule quá rộng.
- Nếu muốn agent chỉnh code để tăng linkability, hãy sửa comment/docstring và anchor text theo convention của repo, sau đó re-index.

### Convention baseline cho agent

Đây là quy ước ngắn để agent đọc và áp dụng khi quét project:

```
Comment/docstring:
  - giữ ngắn, rõ, đúng vai trò
  - dùng block marker để chia khối logic
  - ưu tiên comment ngay trước symbol cần mô tả

Naming:
  - function / variable: camelCase
  - type / interface / class: PascalCase
  - constant / regex / set: SCREAMING_SNAKE_CASE
  - file/module: kebab-case
  - MCP tool: knowsync_*

Traceability:
  - dùng BRD-REQ-001, PRD-UI-045, FRD-FUNC-112 trong comment/docs
  - thêm @symbolName hoặc [[WikiLink]] trong Markdown để tạo REFERENCES edge

Embedded Markdown:
  - coi injected Markdown là region riêng có provenance
  - đọc sourceArtifact trước, rồi drill xuống DocSection con
  - dùng path / parentHeading để trace hierarchy
```

---

## CLI commands — tham khảo đầy đủ

| Lệnh | Flags | Mô tả |
|------|-------|-------|
| `knowsync init [path]` | — | Tạo `knowsync.config.json` |
| `knowsync register [path]` | `--docs-source <path>` (repeatable) | Đăng ký project vào registry; `codeSources` cấu hình qua UI/MCP |
| `knowsync unregister <id>` | — | Bỏ đăng ký project khỏi registry |
| `knowsync list` | — | Liệt kê tất cả projects đã đăng ký |
| `knowsync index [path]` | `--docs`, `--delta`, `--all` | Index code từ `Code Sources`, và docs từ `Doc Sources` khi có `--docs` |
| `knowsync validate [path]` | — | Tìm symbols thiếu docs |
| `knowsync viz [path]` | `-p, --port <number>` | Mở Web UI (mặc định port 4242) |
| `knowsync mcp` | — | Khởi động MCP server (stdio) |

---

## Workflow điển hình

### Setup lần đầu

```bash
npm run build
knowsync register /path/to/myproject --docs-source docs --docs-source README.md
knowsync viz
```

Hoặc hoàn toàn qua UI:
1. `knowsync viz`
2. Nhấn **+** → chọn folder → Add (lặp cho từng project)
3. Nhấn **⚙** → Code Sources → thêm `src` → Save
4. Nhấn **⚙** → Doc Sources → thêm `docs`, `README.md` → Save
5. Nhấn **All** trong index bar → đợi index xong
6. Mở tab **Graph** để khám phá

Nếu muốn dùng CLI để index ngay sau bước đăng ký, cần cấu hình `Code Sources` trước qua UI hoặc MCP. Khi chưa có `Code Sources`, backend sẽ từ chối index code.

### Hàng ngày

1. `knowsync viz` (nếu chưa chạy)
2. Nhấn **⟳ Index** (tick **Delta**) sau khi commit code
3. Dùng Search / Impact / Flow để navigate

### Trước khi refactor

1. Tab **Impact** → nhập tên symbol → Analyze
2. Tab **Flow** → trace call chain từ entry point
3. Nếu thay đổi bắt đầu từ tài liệu: dùng mode **Doc -> Code** trong tab **Flow**
4. Nếu nghi parser/rules làm flow bị đứt: chạy workflow `analyze-parse-rules`
5. Tab **MCP** → copy config → hỏi Claude để phân tích sâu hơn

### Kiểm tra docs coverage

Tab **Docs** → sub-tab **Coverage** → xem danh sách symbols thiếu documentation.

### Xây dựng doc-code links với AI

1. Tab **MCP** → copy config → cài vào Claude Desktop / Cursor
2. Yêu cầu AI: "Dùng `knowsync_suggest_doc_links` tìm symbols chưa được link trong docs/architecture/full.md"
3. AI review suggestions, ưu tiên các suggestion `alreadyLinked = false`
4. AI gọi `knowsync_create_doc_link` cho từng cặp `DocSection ↔ Symbol` cần link
5. AI gọi `knowsync_validate_links` để kiểm tra stale links và coverage sau khi link xong
6. Tab **Visual Docs** → xem graph doc-code sau khi tạo links

Workflow ngắn cho agent:

```
1. knowsync_suggest_doc_links
   → lấy danh sách candidate links từ doc hoặc symbol
2. knowsync_create_doc_link
   → tạo REFERENCES edge thủ công, tồn tại qua re-index
3. knowsync_validate_links
   → kiểm tra stale links và tổng coverage
```

### Workflow mới cho agent

- `/setup-parse-rules`
  - workflow duy nhất để setup hoặc mở rộng parse rules cho một project; truyền `projectCode=...` để chạy đủ chuỗi baseline -> round goal -> preview/refine -> RuleSet/apply -> rebuild/validate
  - nếu muốn ép từng vòng nhỏ, thêm `roundGoal=fields|metadata|decorators|doc-links|calls`
- `/trace-doc-to-code-flow`
  - dùng khi user bắt đầu từ tài liệu và muốn biết flow đó map xuống code thế nào
- `/analyze-parse-rules`
  - dùng khi nghi parse rules/query packs/artifacts đang làm sai hoặc thiếu symbol/docs/links

### Bootstrap parse rules cho project mới

Với project như `mrp` đang chưa có parse rules riêng, nên đi theo thứ tự:

1. cấu hình `Code Sources` và `Doc Sources`
2. index baseline để xem parser built-in đã bắt được gì
   - dùng `knowsync_get_graph_stats` để lấy `symbols`, `doc sections`, `edges`, `parse rules`, `parse artifacts`
3. chọn 3-5 file mẫu đại diện
4. chạy workflow `/setup-parse-rules projectCode=<project-code>`
   - ví dụ vòng đầu: `/setup-parse-rules projectCode=mrp focusLanguage=python roundGoal=fields`
5. chỉ apply rules sau khi preview sạch trên file mẫu
6. rebuild graph toàn project
7. nếu flow tài liệu -> code vẫn đứt, chạy tiếp `/analyze-parse-rules` hoặc `/trace-doc-to-code-flow`

Lưu ý:
- baseline và validation của workflow này nên đi qua MCP tools như `knowsync_get_graph_stats`, `knowsync_get_module_overview`, `knowsync_preview_parse_rules`
- không đọc SQLite trực tiếp
- heuristics chi tiết cho workflow này nằm trong skill `knowsync-parse-rules-setup`

Nguyên tắc:
- dùng `suggest` để tìm cặp tiềm năng, không link mù
- dùng `create` khi đã quyết định cặp chính xác
- dùng `validate` để dọn stale links sau mỗi vòng re-index

---

## 9. Hướng dẫn ra lệnh cho AI Agent qua MCP

Sau khi kết nối MCP, có thể ra lệnh trực tiếp cho AI agent bằng ngôn ngữ tự nhiên. Dưới đây là các prompt mẫu theo từng mục tiêu.

### Khám phá Graph

```
1. AI gọi knowsync_preview_parse_rules
   → Kiểm tra query packs/rules trước khi ghi vào DB
2. AI gọi knowsync_preview_apply_parse_rules
   → Apply khi preview sạch, tùy chọn `applyIndex: true`
3. AI gọi knowsync_build_graph
   → Rebuild graph sau khi rules đã ổn
```

```
Dùng knowsync_get_module_overview để xem tổng quan module "indexer"
```
```
Dùng knowsync_search_graph tìm tất cả symbols liên quan đến "parse"
```
```
Dùng knowsync_get_full_context cho function "runIndex" — tôi muốn hiểu toàn bộ flow của nó
```
```
Dùng knowsync_get_process_flow từ entry point "runIndex" depth 5

Dùng knowsync_get_doc_flow_trace với query "Checkout Flow", maxDocDepth 3, maxCodeDepth 5
```

### Đọc Documentation

```
Dùng knowsync_get_linked_docs để xem tài liệu nào đang mô tả function "GraphDB"
```
```
Dùng knowsync_get_doc_section_content với id "doc:abc123" để đọc nội dung đầy đủ
```
```
Dùng knowsync_check_doc_sync cho "upsertNode" — doc có bị outdated không?
```

### Cập nhật / Liên kết Tài liệu

```
Dùng knowsync_validate_links để tìm tất cả doc links bị stale
```
```
Dùng knowsync_suggest_doc_links cho symbol "GraphDB" — gợi ý section nào nên link vào
```
```
Dùng knowsync_create_doc_link để link doc section "doc:abc" với symbol "GraphDB"
```
```
Dùng knowsync_regenerate_doc cho symbol "runIndex" với nội dung Markdown mới tôi cung cấp
```

### Chuẩn annotation khi AI viết docs/code

Khi muốn AI viết tài liệu hoặc comment code sao cho KnowSync map được nhiều tầng tài liệu và code, yêu cầu AI dùng đúng syntax:

```md
@runIndex
[[GraphDB]]
@doc:../architecture/02-2-pipeline-tong-the.md#quy-uoc-source-boundaries
[[doc:../prd/checkout.md#checkout-flow]]
@doc:#chi-tiet-api
FRD-CHECKOUT-001
```

Quy ước chính thức:

- `@symbolName` hoặc `[[SymbolName]]`: doc -> code
- `@doc:path/to/file.md#slug` hoặc `[[doc:path/to/file.md#slug]]`: doc -> doc khác file
- `@doc:#slug` hoặc `[[doc:#slug]]`: doc -> doc trong cùng file
- `@doc:path/to/file.md#slug` trong comment/docstring: code -> doc

Quy ước về hướng layer:

- tài liệu hiện tại trỏ tới tài liệu nền/tầng trước bằng `@doc:` hoặc `[[doc:...]]`
- vì vậy trong UI, `Before` là các docs mà section hiện tại đang tham chiếu tới
- `After` là các docs khác đang trỏ ngược về section hiện tại để chi tiết hóa hoặc kế thừa nó

Ví dụ prompt:

```
Hãy cập nhật tài liệu này theo chuẩn KnowSync trace commenting:
- doc -> code bằng @symbol hoặc [[Symbol]]
- doc -> doc bằng @doc:path#slug hoặc [[doc:path#slug]]
- nếu sửa code comment thì thêm @doc:... tới PRD/FRD liên quan
```

### Re-index sau khi code thay đổi

```
Dùng knowsync_build_graph với delta=true, includeDocs=true.
Phạm vi quét chỉ lấy từ Code Sources và Doc Sources đã cấu hình.
```

### Workflow hoàn chỉnh — AI tự phân tích và cập nhật doc

```
Hãy thực hiện theo thứ tự:
1. knowsync_get_module_overview cho module "graph"
2. Với mỗi symbol quan trọng, gọi knowsync_check_doc_sync
3. Với symbols thiếu doc, gọi knowsync_suggest_doc_links để tìm sections liên quan
4. Tạo links phù hợp bằng knowsync_create_doc_link
5. Cuối cùng gọi knowsync_validate_links để báo cáo coverage
```

Nếu muốn agent kiểm tra doc layers trước/sau của một section:

```
1. Dùng knowsync_get_doc_section_content để đọc DocSection
2. Đọc trực tiếp `beforeDocs` và `afterDocs`
3. Nếu cần compatibility với dữ liệu cũ, có thể fallback sang `relatedDocs`
4. Nếu cần sửa docs, giữ nguyên chuẩn @doc:path#slug hoặc [[doc:path#slug]]
```

---

## Troubleshooting

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `command not found: knowsync` | Chưa link global | `npm link` trong thư mục knowsync |
| `ENOENT: dist/viz/public/index.html` | Chưa build | `npm run build` |
| `Sigma is not defined` | Vendor files chưa được copy | `npm run build` |
| `marked is not defined` | Vendor files chưa được copy | `npm run build` |
| Graph trống trong UI | Chưa index | Nhấn **⟳ Index** trong UI |
| `Cannot find module` | Chưa build hoặc build cũ | `npm run build` |
| `--legacy-peer-deps` lỗi | npm version cũ | Nâng npm >= 9 |
| Doc graph không hiển thị links | Chưa index docs | `--docs` flag khi index |
| MCP tools không thấy project | Project chưa đăng ký | `knowsync register [path]` |
