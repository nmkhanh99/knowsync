# RTM — Living Architecture System 2.0

Tài liệu này là traceability matrix tối thiểu cho scope đang triển khai. Nó nối [[doc:./brd-living-architecture-and-freshness.md#brd-living-architecture-visibility-va-continuous-freshness]] với [[doc:./prd-living-architecture-and-freshness.md#prd-living-architecture-surfaces-va-continuous-freshness]], [[doc:./frd-architecture-surfaces-and-freshness.md#frd-architecture-surfaces-va-freshness-delivery]], các docs kiến trúc và code anchors thật.

## Matrix

| BRD | PRD | FRD | Architecture docs | Primary code anchors |
|---|---|---|---|---|
| `BRD-REQ-001` | `PRD-ARCH-001`, `PRD-OPS-002`, `PRD-CORE-004` | `FRD-FUNC-010`, `FRD-FRESH-001`, `FRD-FRESH-002`, `FRD-FRESH-003` | [[doc:../architecture/01-1-tong-quan.md#1-tong-quan]], [[doc:../architecture/07-7-viz-server-20-endpoints.md#7-viz-server-43-routes]], [[doc:../architecture/11-11-delta-indexing.md#11-delta-indexing]], [[doc:../architecture/18-18-living-architecture-and-freshness-roadmap.md#18-living-architecture-system-20-roadmap]], [[doc:../architecture/19-19-implementation-plan-living-architecture-system-2-0.md#19-implementation-plan-living-architecture-system-20]] | `@runIndex`, `@GraphDB`, `@startVizServer`, `@runViz` |
| `BRD-REQ-009` | `PRD-ARCH-001`, `PRD-OPS-002` | `FRD-FUNC-010` | [[doc:../architecture/09-9-web-ui-8-tabs.md#9-web-ui-8-tabs]], [[doc:../architecture/18-18-living-architecture-and-freshness-roadmap.md#18-living-architecture-system-20-roadmap]], [[doc:../architecture/19-19-implementation-plan-living-architecture-system-2-0.md#19-implementation-plan-living-architecture-system-20]] | `@getDocVisualization`, `@getDocSubgraph`, `@getProcessFlow`, `@startVizServer`, `@runViz` |
| `BRD-REQ-010` | `PRD-CORE-004` | `FRD-FRESH-001`, `FRD-FRESH-002`, `FRD-FRESH-003` | [[doc:../architecture/11-11-delta-indexing.md#11-delta-indexing]], [[doc:../architecture/18-18-living-architecture-and-freshness-roadmap.md#18-living-architecture-system-20-roadmap]], [[doc:../architecture/19-19-implementation-plan-living-architecture-system-2-0.md#19-implementation-plan-living-architecture-system-20]] | `@runIndex`, `@crawlRepo`, `@validateIndexSources`, `@GraphDB`, `@startVizServer` |

## Reading order

1. Đọc BRD để hiểu business intent.
2. Đọc PRD để hiểu product surface và acceptance intent.
3. Đọc FRD để hiểu behavior/function boundary.
4. Đi tiếp sang architecture docs và code anchors để implement.

## Maintenance rule

Khi thêm requirement mới cho scope này:

- cập nhật BRD nếu business intent thay đổi
- cập nhật PRD/FRD trước khi thêm anchor mới vào RTM
- chỉ thêm code anchors thật đang tồn tại, không thêm tên dự kiến
