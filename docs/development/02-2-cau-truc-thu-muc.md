# 2. Cấu trúc thư mục

```
knowsync/
├── src/
│   ├── types/
│   │   └── index.ts              — Tất cả interfaces: GraphNode, GraphEdge, DocSection,
│   │                               ParsedFile, ParsedDoc, CrawledFile, IndexSummary, ...
│   ├── indexer/
│   │   ├── file-crawler.ts       — Glob + .gitignore (thư viện ignore) + SHA-256 hash
│   │   │                           docSources logic (đọc từ registry)
│   │   ├── code-parser.ts        — Tree-sitter parser, scope stack, pending calls
│   │   ├── rules-engine.ts       — RulesEngine: load AI rules từ parse_rules DB,
│   │   │                           áp dụng S-expression queries
│   │   ├── docs-parser.ts        — remark 15 + unist-util-visit, slug generation,
│   │   │                           @ref + [[wiki]] extraction
│   │   └── index.ts              — runIndex: orchestrator, two-pass, clustering
│   ├── graph/
│   │   ├── db.ts                 — GraphDB: auto-mkdir, WAL mode, FTS5, migrations,
│   │   │                           is_manual edges, getDocSubgraph, suggestLinks,
│   │   │                           validateLinks
│   │   ├── builder.ts            — makeNodeId, makeDocId, persistParsedFile,
│   │   │                           persistParsedDoc, buildInMemoryGraph
│   │   ├── clustering.ts         — Louvain + cluster naming (highest-degree node)
│   │   └── index.ts              — Re-exports
│   ├── mcp/
│   │   ├── server.ts             — @startMcpServer: đăng ký 26 MCP tools + wrap()/asyncWrap()
│   │   ├── index.ts              — Re-exports
│   │   └── tools/
│   │       ├── get-symbol.ts
│   │       ├── get-callers.ts
│   │       ├── get-linked-docs.ts
│   │       ├── get-impact.ts
│   │       ├── get-process-flow.ts
│   │       ├── search-graph.ts
│   │       ├── check-doc-sync.ts
│   │       ├── get-module-overview.ts
│   │       ├── get-doc-section.ts          — Nội dung Markdown đầy đủ + slug
│   │       ├── get-full-context.ts          — Rich context: callers+callees+docs+siblings
│   │       ├── get-doc-visualization.ts     — Doc subgraph
│   │       ├── get-requirement-trace.ts     — Trace requirement ↔ code ↔ docs
│   │       ├── suggest-doc-links.ts         — AI-assisted: gợi ý DocSection↔Symbol links
│   │       ├── create-doc-link.ts           — Tạo REFERENCES edge thủ công (is_manual=1)
│   │       ├── validate-links.ts            — Tìm stale edges + coverage stats
│   │       ├── provide-parse-rules.ts       — AI đẩy Tree-sitter S-expression rules
│   │       ├── preview-parse-rules.ts       — Preview queryPacks / artifacts không ghi DB
│   │       ├── preview-apply-parse-rules.ts — Preview nhiều vòng rồi apply/index
│   │       ├── build-graph.ts               — Trigger index + áp dụng AI rules
│   │       ├── regenerate-doc.ts            — Tạo/cập nhật DocSection với AI content
│   │       ├── scan-doc-sources.ts          — Quét Markdown sources khả dụng
│   │       ├── set-visual-docs-config.ts    — Lưu codeSources/docSources/visualDocs config
│   │       ├── get-doc-link-marks.ts        — Lấy pending marks để sửa source docs
│   │       ├── resolve-doc-link-mark.ts     — Đánh dấu mark đã được sửa ngoài source
│   │       ├── rule-sets.ts                 — RuleSet inheritance / fork / resolved view
│   │       └── rule-links.ts                — Liên kết phụ thuộc giữa các RuleSet
│   ├── cli/
│   │   ├── index.ts              — Commander 12 entry point (8 commands)
│   │   ├── config.ts             — Load/init knowsync.config.json
│   │   ├── registry.ts           — Registry CRUD: load, save, register, update,
│   │   │                           unregister, makeProjectId
│   │   └── commands/
│   │       ├── init.ts           — knowsync init
│   │       ├── register.ts       — knowsync register / unregister / list
│   │       │                       (--docs-source flag, repeatable)
│   │       ├── index-cmd.ts      — knowsync index (--all, --delta, --docs flags)
│   │       ├── validate.ts       — knowsync validate
│   │       ├── viz.ts            — knowsync viz (auto-load registry, --port flag)
│   │       └── mcp-cmd.ts        — knowsync mcp
│   └── viz/
│       ├── server.ts             — @startVizServer: 43 routes, runtime index, project CRUD,
│       │                           resolveDb() helper, multi-project Map<id, GraphDB>
│       └── public/
│           ├── index.html        — HTML shell + vendor script tags + modal markup
│           ├── app.js            — Runtime UI core: project manager, popup, bootstrap
│           ├── app-search.js     — Runtime Search: search results, symbol detail, type filters
│           ├── app-analysis.js   — Runtime Analysis: impact, flow, module
│           ├── app-docs.js       — Runtime Docs: coverage, links manager, doc sync, forward refs
│           ├── app-mcp.js        — Runtime MCP client config + shared rule-filter state
│           ├── app-parse-rules.js— Runtime parse-rules: import, validate, export, samples
│           ├── app-rulesets.js   — Runtime RuleSets: tree, detail, inheritance, links
│           ├── app-vdocs.js      — Runtime Visual Docs core: shared state + dispatcher
│           ├── app-vdocs-config.js — Runtime Visual Docs config panel
│           ├── app-vdocs-outline.js — Runtime Visual Docs outline + preview + grouping helpers
│           ├── app-vdocs-graph.js — Runtime Visual Docs links graph + overlay
│           └── vendor/           — KHÔNG commit (copy lúc build)
│               ├── sigma.min.js
│               ├── graphology.umd.min.js
│               ├── marked.umd.js
│               └── mermaid.min.js
├── dist/                         — Output build (không commit)
├── docs/
│   ├── architecture/
│   │   ├── README.md
│   │   ├── full.md
│   │   └── 01-... 15-...
│   ├── development/
│   │   ├── README.md
│   │   ├── full.md               ← (file này)
│   │   └── 01-... 11-...
│   └── guide/
│       ├── README.md
│       ├── full.md
│       ├── examples.md
│       └── 01-... 20-...
├── package.json                  — scripts: build, dev, typecheck
└── tsconfig.json                 — NodeNext module, strict mode
```

### Build script

```bash
tsc && \
  cp -r src/viz/public dist/viz/ && \
  mkdir -p dist/viz/public/vendor && \
  cp node_modules/sigma/build/sigma.min.js dist/viz/public/vendor/ && \
  cp node_modules/graphology/dist/graphology.umd.min.js dist/viz/public/vendor/ && \
  cp node_modules/marked/lib/marked.umd.js dist/viz/public/vendor/
```

Các điểm vào nên nhớ:

- `@runIndex` trong `src/indexer/index.ts` là orchestration chính cho parse + persist + clustering.
- `@parseCodeFile` và `@parseMarkdownSectionsFromText` là hai điểm parse gốc để nối code ↔ docs.
- `@GraphDB`, `@startMcpServer`, `@startVizServer` là 3 biên hệ thống quan trọng nhất cho lưu trữ và giao tiếp.

Registry trung tâm: `~/.knowsync/registry.json` — nằm ngoài repo, dùng chung cho mọi project trên máy.

---
