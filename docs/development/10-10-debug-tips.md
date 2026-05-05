# 10. Debug tips

### Xem graph dump

```bash
node -e "
import('./dist/graph/db.js').then(({ GraphDB }) => {
  const db = new GraphDB('.knowsync/graph.db');
  db.init().then(() => {
    console.log(JSON.stringify(db.getAllNodes().slice(0, 10), null, 2));
    db.close();
  });
});
"
```

### Xem file cache

```bash
sqlite3 .knowsync/graph.db \
  "SELECT file_path, substr(content_hash,1,8) as hash, datetime(indexed_at/1000,'unixepoch') as time FROM file_cache LIMIT 20;"
```

### Xem edges của một symbol

```bash
sqlite3 .knowsync/graph.db "
SELECT e.type, s1.name AS src, s2.name AS tgt, e.is_manual
FROM edges e
JOIN symbols s1 ON s1.id = e.source_id
JOIN symbols s2 ON s2.id = e.target_id
WHERE s1.name = 'runIndex' OR s2.name = 'runIndex'
LIMIT 20;
"
```

### Xem parse_rules trong DB

```bash
sqlite3 .knowsync/graph.db \
  "SELECT language, rule_type, name, node_type, priority FROM parse_rules ORDER BY language, priority DESC;"
```

### Xem doc_sections

```bash
sqlite3 .knowsync/graph.db \
  "SELECT heading, slug, heading_level, file_path FROM doc_sections LIMIT 20;"
```

### Test MCP tools qua stdio

```bash
# Liệt kê tất cả tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  node dist/cli/index.js mcp /path/to/project

# Gọi một tool cụ thể
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"knowsync_search_graph","arguments":{"query":"runIndex"}}}' | \
  node dist/cli/index.js mcp /path/to/project
```

### Test endpoint viz server

```bash
# Sau khi knowsync viz đang chạy tại port 4242:

# Lấy danh sách projects
curl http://localhost:4242/api/projects

# Tìm kiếm
curl "http://localhost:4242/api/search?q=runIndex&project=<id>"

# Doc graph cho Visual Docs tab
curl "http://localhost:4242/api/doc-graph?project=<id>"
curl "http://localhost:4242/api/doc-graph?pattern=indexer&project=<id>"

# Suggest links cho một symbol
curl "http://localhost:4242/api/suggest-links?name=runIndex&project=<id>"

# Validate links
curl "http://localhost:4242/api/validate-links?project=<id>"
```

---
