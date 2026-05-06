# setup-parse-rules

## Description
Thiết lập hoặc mở rộng parse rules cho một project động theo `projectCode` bằng một workflow duy nhất. Workflow này điều phối các vòng setup qua MCP: chọn file mẫu đại diện, preview/refine rules tối thiểu, tạo hoặc chọn `RuleSet`, apply rules, rebuild graph, rồi validate lại kết quả trên graph và flow.

## Inputs
- `projectCode`: mã project duy nhất trong registry/UI, ví dụ `mrp`
- `focusLanguage` (optional): ví dụ `python`, `javascript`, `typescript`
- `sampleFiles` (optional): danh sách file mẫu user muốn ưu tiên
- `applyMode` (optional): `preview-only` hoặc `preview-then-apply`
- `roundGoal` (optional): ví dụ `fields`, `metadata`, `decorators`, `doc-links`, `calls`

## Skill to use
- `knowsync-parse-rules-setup`
  - dùng skill này để quyết định baseline, hypothesis của từng vòng, và validation sau rebuild

## Steps
1. Resolve project động:
   - gọi `knowsync_set_active_project(projectCode=...)`
   - xác định `Code Sources`, `Doc Sources`, `focusLanguage`
   - nếu không resolve được project, dừng và yêu cầu user chỉ rõ hơn
2. Xác định baseline của project:
   - kiểm tra `Code Sources`, `Doc Sources`, ngôn ngữ chính, và các file đại diện
   - nếu project chưa index được, cấu hình sources trước
   - nếu user không truyền `sampleFiles`, tự chọn 3-5 file mẫu có giá trị nhất:
     - file entry/service/model chính
     - file có comment/docstring đặc trưng
     - file có pattern mà parser hiện đang bỏ sót
3. Chụp trạng thái hiện tại trước khi thêm rules:
   - dùng `knowsync_get_graph_stats`, `knowsync_search_graph`, `knowsync_get_module_overview`, `knowsync_get_doc_visualization`
   - nếu flow tài liệu -> code đang đứt, ghi nhận symbol/doc nào đang thiếu
   - nếu cần, chạy tiếp `/analyze-parse-rules` để hiểu parser đang hụt ở đâu
4. Chốt mục tiêu của vòng hiện tại:
   - mỗi vòng chỉ nên theo một `roundGoal` hoặc một hypothesis chính
   - ví dụ:
     - `fields`
     - `metadata`
     - `decorators`
     - `doc-links`
     - `calls`
5. Chọn strategy parse rules tối thiểu:
   - ưu tiên thêm ít rule nhưng đúng:
     - `node` để bắt symbol chưa lên graph
     - `edge` nếu thiếu `CALLS`/liên kết quan trọng
     - `doc_link` nếu comment/docstring cần sinh embedded docs hoặc doc->code links
   - không apply rule diện rộng trước khi preview sạch trên file mẫu
6. Preview rules trên file thật:
   - dùng `knowsync_preview_parse_rules`
   - review:
     - `matchDetails`
     - `queryErrors`
     - captures `name`, `source`, `target`, `doc`, `symbol`
   - nếu có artifacts/injections/included ranges, preview luôn cùng rules
7. Refine nhiều vòng nếu cần:
   - sửa query cho đến khi:
     - match đúng symbol mong muốn
     - không có false positive rõ ràng
     - embedded docs và doc links sinh đúng section/range
   - nếu cần state nhiều vòng, dùng `knowsync_preview_apply_parse_rules` với `stateToken`
8. Quyết định nơi lưu rules:
   - nếu project mới và cần quản lý lâu dài, tạo hoặc chọn `RuleSet`
   - nếu chỉ đang chứng minh hướng parse, có thể preview trước rồi mới import
   - khi đã ổn, dùng `knowsync_provide_parse_rules` hoặc `knowsync_preview_apply_parse_rules(mode="apply")`
9. Pause for user approval trước khi apply rules vào DB hoặc rebuild graph toàn project.
10. Apply và rebuild:
   - apply rules/query packs/artifacts
   - chạy `knowsync_build_graph`
   - ưu tiên `delta=false` cho lần setup đầu tiên để có baseline sạch
11. Validate sau apply:
   - dùng `knowsync_get_symbol`, `knowsync_get_doc_visualization`, `knowsync_validate_links`
   - nếu project có tài liệu nhiều tầng, kiểm tra thêm `knowsync_get_doc_flow_trace`
   - xác nhận 4 điểm:
     - symbol mới đã lên graph
     - doc links/comment docs sinh đúng
     - `REFERENCES_DOC` / doc->code không bị lệch
     - flow trong tài liệu xuống code dày hơn trước
12. Chốt kết quả:
   - liệt kê rules/artifacts đã thêm
   - liệt kê file mẫu đã dùng để chứng minh
   - ghi rõ vòng hiện tại đã xử lý `roundGoal` nào
   - nêu vòng tiếp theo nên nhắm vào pattern nào
   - nêu residual risks:
     - language coverage chưa đủ
     - false positives còn lại
     - cần rule riêng cho pattern khác

## Workflow phases
1. `Baseline`
   - resolve project
   - chọn file mẫu
   - đo graph hiện tại
2. `Round Goal`
   - chốt hypothesis cho vòng hiện tại
3. `Preview / Refine`
   - preview rules trên file thật
   - lặp refine cho đến khi query sạch
4. `RuleSet / Apply`
   - tạo hoặc chọn `RuleSet`
   - apply rules vào DB
5. `Rebuild / Validate`
   - rebuild graph
   - đo lại coverage và flow

Workflow này vẫn là một slash workflow duy nhất. Không tách thành workflow preview/apply riêng.

## Example invocation
- `/setup-parse-rules projectCode=mrp`
- `/setup-parse-rules projectCode=mrp focusLanguage=python`
- `/setup-parse-rules projectCode=mrp focusLanguage=python roundGoal=fields`
- `/setup-parse-rules projectCode=myrepo sampleFiles=src/core/a.py,src/core/b.py applyMode=preview-only`

## Example: `mrp`
- project code: `mrp`
- focus language: `python`
- sample files tốt cho vòng đầu:
  - `scx_mrp_mps/models/mrp_material_plan.py`
  - `scx_mrp_mps/models/scx_do_plan.py`
  - `scx_mrp_mps/models/strategy_rule_config.py`
- hypothesis ban đầu:
  - built-in parser bắt class/method khá ổn
  - parse rules nên setup trước cho Odoo field declarations kiểu `name = fields.Char(...)`

## Recommended MCP sequence
1. `knowsync_set_active_project`
2. `knowsync_get_project_info`
3. `knowsync_get_graph_stats`
4. `knowsync_search_graph`
5. `knowsync_get_module_overview`
6. `knowsync_preview_parse_rules`
7. `knowsync_preview_apply_parse_rules`
8. `knowsync_rule_sets`
9. `knowsync_provide_parse_rules`
10. `knowsync_build_graph`
11. `knowsync_get_symbol`
12. `knowsync_get_doc_flow_trace`

## Output shape
1. Baseline gaps
2. Round goal
3. Candidate rules
4. Preview findings
5. Applied rules/artifacts
6. Post-index validation

## Constraints
- Mọi read/write cấu hình, RuleSet, parse rules, rebuild đều đi qua MCP.
- Không đọc hoặc ghi SQLite trực tiếp.
- Không suy luận phạm vi quét từ `rootPath`.
- Chỉ dựa vào `Code Sources` / `Doc Sources` của active project.

**Note**: Luôn tuân thủ Rule protect-base-meta-skills và protect-meta-engineer-agent.
