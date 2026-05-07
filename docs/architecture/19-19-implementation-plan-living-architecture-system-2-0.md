# 19. Implementation Plan — Living Architecture System 2.0

Tài liệu này cụ thể hóa [[doc:./18-18-living-architecture-and-freshness-roadmap.md#18-living-architecture-system-20-roadmap]] thành kế hoạch thực hiện gần code. Nó nối execution plan với requirement layers ở [[doc:../requirements/prd-living-architecture-and-freshness.md#prd-living-architecture-surfaces-va-continuous-freshness]] và [[doc:../requirements/frd-architecture-surfaces-and-freshness.md#frd-architecture-surfaces-va-freshness-delivery]], đồng thời dùng các anchor hiện có như `@startVizServer`, `@runViz`, `@runIndex`, `@GraphDB`, `@getDocVisualization`, `@getProcessFlow`.

## Delivery goals

- stakeholder thấy rõ giá trị sau Epic 1, không cần đợi full roadmap
- graph đủ fresh sau Epic 2 để các bề mặt mới không mất niềm tin
- scope hiện tại dừng ở surfaces và freshness, không kéo thêm lớp hướng dẫn thông minh ngoài phạm vi này

## Sequencing

- Phase 0: Requirements alignment
- Epic 1: Living Architecture Surfaces
- Epic 2: Continuous Freshness

Tổng effort mục tiêu là 8-11 tuần với team nhỏ 3-4 người, nhưng thứ tự ưu tiên quan trọng hơn con số tuyệt đối.

## Phase 0: Requirements alignment

Mục tiêu của phase này là chốt trace trước khi code để implementation không đi trước requirement.

### Workstreams

- cập nhật BRD để phản ánh business requirement cho living architecture visibility
- cập nhật PRD với `PRD-ARCH-001`, `PRD-OPS-002`, `PRD-CORE-004`
- cập nhật FRD cho nhóm diagram/export, freshness automation/metrics
- cập nhật RTM để nối requirement IDs mới với architecture docs và module anchors

### Exit criteria

- requirement IDs canonical đã tồn tại và có trace rõ xuống docs kiến trúc
- implementation branch có thể reference exact IDs trong code comments và commit notes

## Epic 1: Living Architecture Surfaces

Epic này bám vào `PRD-ARCH-001`, `PRD-OPS-002`, và `FRD-FUNC-010`.

### Workstream 1.1: C4 auto-generate

- dùng `@getDocVisualization`, `@getDocSubgraph`, `@getProcessFlow` để dựng Context -> Container -> Component -> Code views
- mở surface qua `@startVizServer` và `@runViz`
- tránh tạo pipeline riêng cho export nếu cùng dữ liệu có thể tái dùng

Acceptance:

- user có thể chọn view kiến trúc mà không cần manual diagram authoring
- view phản ánh graph hiện tại, không phải snapshot tĩnh ngoài repo

### Workstream 1.2: Diagram export

- cung cấp export Mermaid/PlantUML một click từ cùng source data của Visual Docs
- ưu tiên text export trước, sau đó mới xét artifact render nặng hơn

Acceptance:

- export file tái hiện đúng scope người dùng đang xem
- không có divergence giữa diagram đang xem và diagram xuất ra

### Workstream 1.3: Knowledge Health Dashboard

- gom coverage, drift, provenance confidence, orphaned marks, trace completeness vào một bề mặt
- metric source phải map được về `@GraphDB` hoặc query surfaces thật đang có

Acceptance:

- stakeholder đọc được trạng thái tri thức mà không cần đi qua nhiều tab kỹ thuật
- project switching không làm metric lẫn context

## Epic 2: Continuous Freshness

Epic này bám vào `PRD-CORE-004`, `FRD-FRESH-001`, `FRD-FRESH-003`.

### Workstream 2.1: Delta indexing hardening

- tăng độ tin cậy của `@runIndex` bằng hash và invalidation theo file cache
- giữ input boundary an toàn qua `@crawlRepo` và `@validateIndexSources`
- tránh re-index thừa khi không có thay đổi ý nghĩa

Acceptance:

- delta path nhanh hơn rõ rệt so với full index trên repo thực tế
- khi rename/move/change source config, invalidation vẫn đúng

### Workstream 2.2: Freshness telemetry

- lưu hoặc suy ra được last indexed, freshness age, stale marks, drift-adjacent indicators
- feed trực tiếp vào dashboard của Epic 1

Acceptance:

- stakeholder nhìn dashboard là biết graph mới đến mức nào
- operator có thể phân biệt lỗi index với trạng thái simply stale

## Dependency map

| Phase / Epic | Depends on | Primary anchors |
|---|---|---|
| Phase 0 | roadmap đã chốt | `@startVizServer`, `@runIndex`, `@GraphDB` |
| Epic 1 | Phase 0 | `@getDocVisualization`, `@getDocSubgraph`, `@getProcessFlow`, `@startVizServer`, `@runViz` |
| Epic 2 | Phase 0 | `@runIndex`, `@crawlRepo`, `@validateIndexSources`, `@GraphDB`, `@startVizServer` |

## Suggested rollout checkpoints

- Checkpoint A: requirements docs aligned and roadmap trace clean
- Checkpoint B: C4 views + export + dashboard demoable cho stakeholder
- Checkpoint C: delta automation và freshness metrics chạy ổn trên repo thực

## Success metrics

- stakeholder lấy được architecture context mà không cần hỏi dev cho các câu hỏi lặp lại
- thời gian từ repo change tới graph freshness giảm xuống mức có thể tin để dùng hàng ngày
- unresolved marks giảm dần nhờ freshness và dashboard visibility tốt hơn

## Implementation note

Khi code hoặc doc mới phục vụ kế hoạch này, nên reference tài liệu hiện tại bằng `@doc:../../docs/architecture/19-19-implementation-plan-living-architecture-system-2-0.md#19-implementation-plan-living-architecture-system-20`, và giữ nguyên exact IDs `PRD-ARCH-001`, `PRD-OPS-002`, `PRD-CORE-004`, `FRD-FUNC-010`.
