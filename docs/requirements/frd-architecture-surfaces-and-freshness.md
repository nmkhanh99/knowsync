# FRD — Architecture Surfaces và Freshness Delivery

Tài liệu này chi tiết hóa [[doc:./prd-living-architecture-and-freshness.md#prd-living-architecture-surfaces-va-continuous-freshness]] và nối product requirements với các symbol hiện có trong codebase.

## FRD-FUNC-010: Diagram generation và architecture surface delivery

FRD-FUNC-010 bao phủ lớp chức năng sinh architecture views từ graph và đưa chúng lên stakeholder-facing UI.

Expected behavior:

- lấy dữ liệu từ `@getDocVisualization`, `@getDocSubgraph`, `@getProcessFlow`
- render qua surface được host bởi `@startVizServer` và mở bởi `@runViz`
- hỗ trợ export artifact từ cùng nguồn dữ liệu để tránh divergence giữa UI và file export

Maps to:

- `PRD-ARCH-001`
- `PRD-OPS-002` ở phần health-adjacent architecture surface

## FRD-FRESH-001: Delta indexing

FRD-FRESH-001 chi tiết hóa phần delta indexing dùng hash và file cache invalidation.

Expected behavior:

- `@runIndex` chỉ re-index những file thực sự đổi hoặc bị invalidated bởi context liên quan
- `@crawlRepo` và `@validateIndexSources` bảo vệ input boundary đúng scope project
- state freshness phải được lưu hoặc suy ra được từ dữ liệu quanh `@GraphDB`

Maps to:

- `PRD-CORE-004`

## FRD-FRESH-003: Freshness metrics và stale-state reporting

FRD-FRESH-003 chi tiết hóa lớp metrics cho freshness và stale-state visibility.

Expected behavior:

- surface đọc được last indexed, freshness age, stale marks, drift-adjacent indicators
- metric source phải map được về `@GraphDB` và các query surfaces đang có
- kết quả đủ rõ để feed vào `PRD-OPS-002`

Maps to:

- `PRD-CORE-004`
- `PRD-OPS-002`

## Trace matrix

| FRD | PRD | Primary code anchors |
|---|---|---|
| `FRD-FUNC-010` | `PRD-ARCH-001`, `PRD-OPS-002` | `@getDocVisualization`, `@getDocSubgraph`, `@getProcessFlow`, `@startVizServer`, `@runViz` |
| `FRD-FRESH-001` | `PRD-CORE-004` | `@runIndex`, `@crawlRepo`, `@validateIndexSources`, `@GraphDB` |
| `FRD-FRESH-003` | `PRD-CORE-004`, `PRD-OPS-002` | `@GraphDB`, `@startVizServer` |
