# 13. Node ID và Edge ID

```
nodeId = SHA1("filePath:name:startLine").hex[0:16]
  e.g. "src/graph/db.ts:upsertNode:69" → "a3f4b2c1d5e60718"

docId = "doc:" + SHA1("filePath:heading:startLine").hex[0:16]
  e.g. "doc:a1b2c3d4e5f6a7b8"

edgeId = "${sourceId}->${TYPE}->${targetId}"
  e.g. "a3f4b2c1d5e60718->CALLS->b2c3d4e5f6a7b8c9"
  → Unique per (source, type, target)
  → INSERT OR IGNORE tránh duplicate
```

---
