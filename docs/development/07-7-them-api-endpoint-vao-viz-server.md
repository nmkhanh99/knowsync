# 7. Thêm API endpoint vào viz server

Mọi endpoint mới thêm vào `src/viz/server.ts` trong hàm `startVizServer()`:

### Read endpoint (GET)

```typescript
app.get('/api/my-endpoint', (req, res) => {
  // ← Dùng resolveDb, KHÔNG phải resolve (resolve là path.resolve, đã import cùng scope)
  const db = resolveDb(req);
  if (!db) { err404(res); return; }

  const param = req.query.param as string;
  if (!param) {
    res.status(400).json({ error: 'param is required' });
    return;
  }

  try {
    const result = db.myMethod(param);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
```

### Write endpoint (POST)

```typescript
app.post('/api/my-write-endpoint', (req, res) => {
  const db = resolveDb(req);
  if (!db) { err404(res); return; }

  const { field1, field2 } = req.body as { field1: string; field2: string };
  if (!field1 || !field2) {
    res.status(400).json({ error: 'field1 and field2 are required' });
    return;
  }

  try {
    db.myWriteMethod(field1, field2);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
```

### Lưu ý về resolveDb

```typescript
// resolveDb đọc ?project=<id> từ query string (GET) hoặc req.body.projectId (POST)
// và trả GraphDB instance tương ứng từ Map<id, GraphDB>
// Trả undefined nếu project không tồn tại hoặc không có ?project param
function resolveDb(req: Request): GraphDB | undefined {
  const id = (req.query.project ?? req.body?.projectId) as string | undefined;
  if (!id) return undefined;
  return dbMap.get(id);
}
```

---
