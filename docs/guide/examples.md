# KnowSync Usage Examples

## 1. Index a TypeScript project

```bash
cd my-project
npx knowsync init
npx knowsync register . \
  --code src \
  --doc docs
npx knowsync index . --docs
```

Output:
```
Scanning: /Users/me/my-project
Found 142 code files, 12 doc files
  Parsed 142 code files
  Parsed 12 doc files
  Clustering...
Done. 1847 nodes, 3204 edges, 1847 cluster assignments
Index complete in 2.3s
```

`Code Sources` quyết định phần code được index. `Doc Sources` quyết định phần tài liệu được parse và link. Nếu thiếu một trong hai, backend sẽ từ chối phần index tương ứng thay vì fallback quét toàn repo.

## 2. Ask AI (Claude) about impact of a change

After running `npx knowsync mcp`, Claude can call:

```
knowsync_get_impact({ symbolName: "parseCodeFile", depth: 3 })
```

Returns:
```json
{
  "directlyAffected": [
    { "name": "runIndex", "filePath": "src/indexer/index.ts", "startLine": 14 }
  ],
  "transitivelyAffected": [
    { "name": "runIndexCommand", "filePath": "src/cli/commands/index-cmd.ts", "startLine": 12 }
  ],
  "linkedDocs": [
    { "heading": "Pipeline", "filePath": "docs/architecture/reference.md" }
  ]
}
```

## 3. Find all callers of a function

```
knowsync_get_callers({ functionName: "upsertNode" })
```

## 4. Check if docs are in sync with code

```
knowsync_check_doc_sync({ symbolName: "GraphDB" })
```

Returns:
```json
{
  "symbol": { "name": "GraphDB", "type": "Class", ... },
  "linkedDocs": [],
  "isSynced": false,
  "issues": ["No documentation found for symbol \"GraphDB\""]
}
```

## 5. Doc reference syntax

In Markdown files, reference symbols with `@symbolName` or `[[SymbolName]]`:

```markdown
## Indexing Pipeline

The @runIndex function orchestrates the full pipeline.
It calls @parseCodeFile for each code file and @parseDocFile for docs.

See also: [[GraphDB]]
```

KnowSync will automatically create `REFERENCES` edges between the DocSection and those symbols.

## 6. Doc-to-doc reference syntax

Use `@doc:path#slug` or `[[doc:path#slug]]` for layered docs:

```markdown
## Checkout FRD

This section refines [[doc:../prd/checkout.md#checkout-flow]].
Implementation details are covered by @runIndex.
```

Use `@doc:#slug` or `[[doc:#slug]]` to reference another section in the same file:

```markdown
## Overview

See also [[doc:#source-boundaries]].

## Source Boundaries
```

KnowSync will create `REFERENCES_DOC` edges between those DocSections.

Direction semantics:

- `Before`: docs the current section points to
- `After`: docs that point back to the current section

## 7. Code comment to doc syntax

Put doc references in comments or docstrings:

```ts
/**
 * Orchestrates indexing for configured sources.
 * @doc:../../docs/architecture/02-2-pipeline-tong-the.md#source-boundaries
 * @doc:../../docs/guide/03-3-index-xay-dung-knowledge-graph.md#index
 */
export async function runIndex(...) {
  // ...
}
```

This lets Visual Docs and MCP show code -> doc trace alongside doc -> code links.

## 8. Visual Docs with embedded Markdown regions

```
knowsync_get_doc_visualization({ pattern: "docs/" })
```

Kết quả giờ có thêm `embeddedDocRegions`:

```json
{
  "embeddedDocRegions": [
    {
      "id": "region:123",
      "heading": "API Notes",
      "sourceArtifact": {
        "name": "ts-markdown-injections",
        "artifactType": "injection_query",
        "regionId": "src/foo.ts:artifact:10:24"
      },
      "roots": [
        {
          "heading": "Auth",
          "parentHeading": null,
          "path": ["Auth", "JWT"],
          "children": []
        }
      ]
    }
  ]
}
```

The visualization also includes doc -> doc edges created from `@doc:` and `[[doc:...]]`.

## 9. Requirement traceability example

```markdown
## BRD-REQ-001: Index docs and code

The @runIndex pipeline builds the graph from code and Markdown.
See [[doc:../guide/11-4-7-tab-visual-docs.md#links-view]] for the doc-centric view.

### PRD-UI-002: Show injected Markdown regions

The @getDocVisualization output must include embeddedDocRegions.

### FRD-TRACE-003: Preserve manual doc links

Use @createDocLink for stable REFERENCES edges.
```

## 10. MCP config for Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "knowsync": {
      "command": "npx",
      "args": ["knowsync", "mcp", "/path/to/your/repo"]
    }
  }
}
```

## 11. CI integration (GitHub Actions)

```yaml
- name: Validate docs sync
  run: |
    npm install -g knowsync
    knowsync register . --code src --doc docs
    knowsync index . --docs
    knowsync validate .
```

## 12. End-to-end agent flow

```text
1) knowsync_get_module_overview
2) knowsync_search_graph
3) knowsync_get_doc_visualization
4) knowsync_preview_parse_rules
5) knowsync_preview_apply_parse_rules
6) knowsync_provide_parse_rules
7) knowsync_build_graph
8) knowsync_suggest_doc_links
9) knowsync_create_doc_link
10) knowsync_validate_links
11) knowsync_regenerate_doc
12) knowsync_check_doc_sync
```

Use this when the agent needs to:
- infer parsing conventions
- derive query packs / rules
- build the tree
- link docs to code
- normalize comment/doc format for future linking
