# 18. Living Architecture System 2.0 Roadmap

Tài liệu này chốt roadmap sản phẩm cho Living Architecture System 2.0 của KnowSync. Phần này kế thừa [[doc:./07-7-viz-server-20-endpoints.md#7-viz-server-43-routes]], [[doc:./09-9-web-ui-8-tabs.md#9-web-ui-8-tabs]], và [[doc:./11-11-delta-indexing.md#11-delta-indexing]] để nối requirement IDs với code hiện có như `@getDocVisualization`, `@getProcessFlow`, `@runIndex`, `@crawlRepo`, `@GraphDB`, `@startVizServer`, `@runViz`, `@suggestDocLinks`, `@createDocLink`, `@resolveDocLinkMark`.

## Epic structure

- Epic 1: Living Architecture Surfaces
- Epic 2: Continuous Freshness

Ưu tiên delivery được siết theo thứ tự Must -> Must để tránh roadmap rộng hơn dữ liệu và UX hiện có.

## Epic 1: Living Architecture Surfaces

Mục tiêu của epic này là để stakeholder mở KnowSync lên và thấy ngay bức tranh kiến trúc sống, không cần đi qua dev để hỏi lại context hệ thống.

### Product intent

- C4 Model auto-generate trong Visual Docs theo các tầng Context -> Container -> Component -> Code
- One-click Mermaid / PlantUML export cho bề mặt kiến trúc
- Knowledge Health Dashboard hiển thị coverage, Drift Score, Provenance Confidence, Orphaned Marks, Trace Completeness

### Requirement mapping

#### PRD-ARCH-001

PRD-ARCH-001 định nghĩa bề mặt C4 và luồng export diagram cho stakeholder. Điểm neo kỹ thuật hiện có là `@getDocVisualization`, `@getProcessFlow`, `@getDocSubgraph`, và UI Visual Docs đang được host bởi `@startVizServer`.

#### PRD-OPS-002

PRD-OPS-002 định nghĩa Knowledge Health Dashboard. Bề mặt này nên gom các tín hiệu đang rải ở Docs, Visual Docs, validate links, provenance và freshness thành một dashboard duy nhất cho vận hành tri thức.

#### FRD-FUNC-010

FRD-FUNC-010 bao phủ pipeline sinh diagram/export và surface kiến trúc sống trong Web UI. Ở lớp implementation, FRD này currently maps strongest tới `@getDocVisualization`, `@getProcessFlow`, `@getDocSubgraph`, `@startVizServer`, và `@runViz`.

### Code/module anchors

| Requirement | Current anchors | Ghi chú |
|---|---|---|
| `PRD-ARCH-001` | `@getDocVisualization`, `@getDocSubgraph`, `@getProcessFlow`, `@startVizServer` | Đã có graph/doc flow primitives, còn thiếu bề mặt C4 first-class và export action rõ ràng |
| `PRD-OPS-002` | `@startVizServer`, `@validateLinks`, `@checkDocSync`, `@getLinkedDocs`, `@GraphDB` | Đã có nhiều metric fragments nhưng chưa hợp nhất thành health dashboard |
| `FRD-FUNC-010` | `@runViz`, `@startVizServer`, `@getDocVisualization`, `@getProcessFlow` | Phần UI/runtime nên là nơi hiện thực hóa diagram generation và export |

### Delivery intent

Epic này không nên chỉ là “thêm tab mới”. Nó là lớp trình bày tổng hợp dữ liệu đã có trong graph để tạo trust surface cho PM, BA, Tech Lead và Exec.

## Epic 2: Continuous Freshness

Epic này giữ graph luôn “thở”, để các bề mặt kiến trúc và health không bị mất niềm tin ngay sau khi code đổi.

### Product intent

- Delta indexing tối ưu hơn bằng file hash và cache invalidation
- Freshness metrics như last indexed, freshness age, stale marks, drift score

### Requirement mapping

#### PRD-CORE-004

PRD-CORE-004 định nghĩa khả năng continuous freshness và delta indexing. Điểm vào hiện có đã rõ ở `@runIndex`, còn discovery/input boundary nằm ở `@crawlRepo` và persistence nằm ở `@GraphDB`.

### Code/module anchors

| Requirement | Current anchors | Ghi chú |
|---|---|---|
| `PRD-CORE-004` | `@runIndex`, `@crawlRepo`, `@validateIndexSources`, `@GraphDB` | Đã có delta path cơ bản, còn thiếu invalidation rõ hơn và freshness telemetry |

### FRD surface đề xuất

- `FRD-FRESH-001`: delta indexing dùng hash + file cache invalidation, bám vào `@runIndex`, `@crawlRepo`, `@validateIndexSources`
- `FRD-FRESH-003`: freshness metrics và stale-state reporting, bám vào `@GraphDB` và các surface đọc từ Viz/MCP

## Gap summary

- C4/diagram export hiện mới có graph primitives, chưa có requirement surface first-class cho stakeholder
- Health metrics đã tồn tại phân mảnh, chưa được hợp nhất thành một dashboard vận hành
- Delta indexing đã có nền nhưng chưa đủ để gọi là continuous freshness
- Requirement IDs mới cần tiếp tục được gắn vào code comments và API/docs mới khi implementation bắt đầu

## Next trace points

Khi bắt đầu implement, các section/code mới nên reference ngược lại tài liệu này bằng `@doc:../../docs/architecture/18-18-living-architecture-and-freshness-roadmap.md#18-living-architecture-system-20-roadmap`, đồng thời giữ nguyên exact IDs `PRD-ARCH-001`, `PRD-OPS-002`, `PRD-CORE-004`, `FRD-FUNC-010`.
