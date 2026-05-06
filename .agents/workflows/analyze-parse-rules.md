# analyze-parse-rules

## Description
Phân tích parse rules, query packs, artifacts và tác động của chúng tới symbol extraction, embedded docs, doc links và flow trace trong KnowSync.

## Steps
1. Xác định language, file mẫu, và vấn đề cần giải thích:
   - thiếu symbol
   - thiếu embedded docs
   - doc links sai
   - flow doc -> code bị đứt
2. Dùng `knowsync_preview_parse_rules` hoặc `knowsync_preview_apply_parse_rules` để xem captures thực tế trên file.
3. Kiểm tra từng rule/query pack/artifact:
   - rule type là `node`, `edge`, `doc_link`, `linking`, hay `resolve`
   - capture `name`, `source`, `target`, `doc`, `symbol`
   - included ranges hoặc injection query có đúng vùng cần parse không
4. Đối chiếu kết quả preview với graph/runtime:
   - `linkedSymbols`
   - `linkedDocTargets`
   - `REFERENCES`, `DOCUMENTED_BY`, `REFERENCES_DOC`, `CALLS`
5. Nếu parse rules ảnh hưởng flow tài liệu -> code, chạy tiếp `knowsync_get_doc_flow_trace` để xem flow sau khi rules được áp có đủ dày hay bị lệch.
6. Kết luận theo 3 lớp:
   - parser/rule đang capture đúng hay sai
   - docs/comment hiện tại có đủ annotation chưa
   - flow doc -> code -> code có được cải thiện sau thay đổi rules không
7. Pause for user approval trước khi apply rules vào DB hoặc re-index diện rộng.

**Note**: Luôn tuân thủ Rule protect-base-meta-skills và protect-meta-engineer-agent.
