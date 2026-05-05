# 4.1 Tab Graph

Trực quan hóa knowledge graph bằng Sigma.js (WebGL).

- Node nhóm theo **cluster** (Louvain algorithm — tự động phát hiện modules chức năng)
- Kích thước node tỉ lệ với số edges
- Màu: `Function` (xanh) · `Class` (xanh lá) · `Method` (vàng) · `Module` (tím) · `DocSection` (hồng)
- **Filter box** góc trên trái: gõ để highlight nodes khớp tên
- **Kéo / scroll** để pan và zoom

**Click node** → panel bên phải:

| Thông tin | Mô tả |
|-----------|-------|
| Type, file, dòng, cluster, signature, docstring | Metadata symbol |
| Callers | Symbols gọi đến node này |
| Callees | Symbols node này gọi đến |
| Linked Docs | DocSections liên kết với node này |
| **⚑ Impact** | Chuyển sang tab Impact, pre-fill tên |
| **⟶ Flow** | Chuyển sang tab Flow, pre-fill tên |

Thanh công cụ Index nằm ngay trên graph để index mà không cần rời tab.

---
