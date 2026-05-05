# 12. Two-Pass Call Resolution

**Tại sao cần 2 pass?**

Khi parse `A.ts`, hàm `foo()` gọi `bar()`. Nếu `bar` định nghĩa trong `B.ts` (chưa parse), không thể tạo edge ngay.

**Pass 1** (per file): Nếu callee không tìm thấy trong file hiện tại:

```typescript
pendingCalls.push({ callerId: foo.id, calleeName: 'bar' })
```

**Pass 2** (sau khi tất cả files parse xong):

```typescript
resolvePendingCalls(db, allPendingCalls):
  for calleeName in unique(pendingCalls):
    callees = db.getSymbolByName(calleeName)  // tìm trong tất cả files
    for caller in callerIds:
      for callee in callees:
        db.upsertEdge(caller →CALLS→ callee)
```

---
