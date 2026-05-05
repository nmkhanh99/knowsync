# 2. Pipeline tổng thể

Tài liệu này mô tả đường đi chính của `@runIndex`. Chi tiết crawler nằm ở [[doc:./03-3-filecrawler.md#3-filecrawler]], parser code ở [[doc:./04-4-codeparser-rulesengine.md#4-codeparser-rulesengine]], parser docs ở [[doc:./05-5-docsparser.md#5-docsparser]], và delta behavior ở [[doc:./11-11-delta-indexing.md#11-delta-indexing]].

```
┌─────────────────────────────────────────────────────────────────┐
│                         Repo Files                               │
│          (*.ts, *.js, *.py, docs/**/*.md, wiki/*.md, ...)       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ FileCrawler  │  glob + .gitignore
                    │              │  codeSources + docSources
                    │              │  SHA-256 content hash
                    └──────┬──────┘
                           │
             ┌─────────────┴─────────────┐
             │                           │
      ┌──────▼──────┐             ┌──────▼──────┐
      │  CodeParser  │             │  DocsParser  │
      │ (Tree-sitter)│             │   (remark)   │
      │              │             │              │
      │ Built-in     │             │ Markdown AST │
      │ patterns +   │             │ → DocSection │
      │ RulesEngine  │             │   nodes      │
      │ (AI rules)   │             │              │
      │ embedded docs│             │ @ref/[[link]]│
      │ only persist │             │ only from    │
      │ in DocSources│             │ Doc Sources  │
      │ PendingCalls │             │   → REFERENCES│
      │ (cross-file) │             │              │
      └──────┬──────┘             └──────┬──────┘
             │                           │
             └─────────────┬─────────────┘
                           │ Pass 2: resolvePendingCalls
                           │ (cross-file CALLS edges)
                    ┌──────▼──────┐
                    │   GraphDB    │  better-sqlite3 11
                    │              │  WAL mode
                    │  symbols     │
                    │  doc_sections│
                    │  edges       │
                    │  parse_rules │
                    │  file_cache  │
                    │  FTS5 index  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Clustering  │  Louvain algorithm
                    │              │  graphology 0.25
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐     │     ┌──────▼──────┐
       │  MCP Server  │     │     │  Viz Server  │
       │  stdio       │     │     │  Express     │
       │  26 tools    │     │     │  43 routes   │
       └──────┬──────┘     │     └──────┬──────┘
              │             │            │
   ┌──────────┴───┐         │     ┌──────▼──────┐
   │  Claude AI   │         │     │   Web UI     │
   │  Cursor      │         │     │   8 tabs     │
   │  Windsurf    │         │     │   Sigma.js   │
   └──────────────┘         │     │   marked.js  │
                            │     └─────────────┘
                    ┌───────▼──────┐
                    │  CLI (8 cmds) │
                    │  Commander 12 │
                    └──────────────┘
```

### Quy ước source boundaries

- `codeSources`: giới hạn phạm vi quét code để sinh `symbols` và các quan hệ code như `CALLS`, `IMPORTS`, `EXPORTS`, `INHERITS`, `IMPLEMENTS`
- `docSources`: giới hạn phạm vi tài liệu để sinh `DocSection` và các doc links như `REFERENCES`, `DOCUMENTED_BY`, `EXPLAINS_FLOW`
- Embedded Markdown/comment-docs trích ra từ file code chỉ được persist nếu file đó đồng thời nằm trong `docSources`
- Nếu tài liệu tầng sau hoặc code comment cần map tới phần này, dùng `@doc:./02-2-pipeline-tong-the.md#quy-uoc-source-boundaries`

---
