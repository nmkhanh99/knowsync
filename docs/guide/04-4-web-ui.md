# 4. Web UI

```bash
knowsync viz [path]

# Chọn port khác
knowsync viz --port 3000
```

Trình duyệt tự mở tại `http://localhost:4242`. Nếu không, mở thủ công.

### Layout sidebar

```
┌───────────────────────────────┐
│ ◈ KnowSync          0.1       │
├───────────────────────────────┤
│ PROJECT  [dropdown ▼] [+] [⚙] │
│  ↳ add-project form / config  │
├───────────────────────────────┤
│ [⟳ Index] [All]   □ Delta     │
├───────────────────────────────┤
│ ◉ Graph                       │
│ ⌕ Search                      │
│ ⚑ Impact                      │
│ ⟶ Flow                        │
│ ▤ Module                      │
│ ✓ Docs                        │
│   Visual Docs                  │
│ ⬡ MCP                         │
├───────────────────────────────┤
│ Symbols  —                    │
│ Edges    —                    │
│ Clusters —                    │
└───────────────────────────────┘
```

### Quản lý project trong UI

**Thêm project:** Nhấn **`+`** bên cạnh dropdown → form xuất hiện. Nhập đường dẫn thủ công hoặc nhấn **📁** để mở folder picker (macOS native) → nhấn **Add**. Project được đăng ký vào `~/.knowsync/registry.json`, tự động xuất hiện trong dropdown.

**Cấu hình project:** Nhấn **`⚙`** → panel mở ra với các trường Name, Root Path, **Code Sources** và **Doc Sources** editor (thêm/xóa entries). Nhấn **Save** để lưu. Nhấn **Remove from registry** để bỏ đăng ký.

**Chọn project:** Dropdown hiển thị tất cả projects đã đăng ký kèm số symbols. Chọn project khác → toàn bộ 8 tab tự reload.

### Index bar

| Nút | Hành động |
|-----|-----------|
| **⟳ Index** | Quét code + docs của project đang chọn |
| **All** | Quét tất cả projects đã đăng ký |
| **Delta** checkbox | Chỉ index lại file đã thay đổi |

Rule hiện tại:

- code chỉ được index từ `Code Sources`
- docs chỉ được index từ `Doc Sources`
- nếu thiếu source tương ứng, UI sẽ cảnh báo sớm và backend sẽ trả lỗi thay vì fallback quét toàn repo

---
