# 14. Clustering

**File:** `src/graph/clustering.ts`

```typescript
clusterGraph(graph: InMemoryGraph): ClusterResult[]
  → Louvain community detection (graphology-communities-louvain)
  → { nodeId, clusterId: string }[]

persistClusters(db, clusters)
  → db.setClusterId(nodeId, clusterId) cho từng node
```

Louvain tự động phát hiện modules chức năng dựa trên cấu trúc CALLS + IMPORTS edges.

**Cluster naming:** Sau khi Louvain gán cluster number, tìm node có degree cao nhất trong mỗi cluster → tên node đó trở thành `clusterId` (readable label thay vì số nguyên).

---
