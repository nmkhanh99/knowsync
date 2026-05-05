# 6. Cấu hình MCP (Claude Code CLI, Claude Desktop, Cursor, Windsurf)

Sau khi `knowsync mcp` chạy, server lắng nghe trên stdio. Cấu hình tương ứng:

### Claude Code CLI

**Cách 1 — Tạo file `.mcp.json` trong project** (khuyến nghị, commit được vào repo):

```json
{
  "mcpServers": {
    "knowsync": {
      "command": "node",
      "args": [
        "/absolute/path/to/knowsync/dist/cli/index.js",
        "mcp",
        "/path/to/your-project"
      ]
    }
  }
}
```

Đặt file tại root của project đang làm việc. Claude Code tự đọc khi khởi động trong thư mục đó.

**Cách 2 — Dùng lệnh `claude mcp add`** (project scope):

```bash
claude mcp add knowsync node /absolute/path/to/knowsync/dist/cli/index.js mcp /path/to/your-project
```

**Global scope** (áp dụng mọi project):

```bash
claude mcp add --scope global knowsync node /absolute/path/to/knowsync/dist/cli/index.js mcp /path/to/your-project
```

Sau khi thêm, restart session Claude Code rồi gõ `/mcp` để xác nhận `knowsync` xuất hiện trong danh sách.

---

### Claude Desktop

Mở `~/Library/Application Support/Claude/claude_desktop_config.json`, thêm:

```json
{
  "mcpServers": {
    "knowsync": {
      "command": "node",
      "args": ["/absolute/path/to/dist/cli/index.js", "mcp", "/path/to/project"]
    }
  }
}
```

### Cursor

Tạo hoặc chỉnh `.cursor/mcp.json` trong project:

```json
{
  "mcpServers": {
    "knowsync": {
      "command": "node",
      "args": ["/absolute/path/to/dist/cli/index.js", "mcp", "/path/to/project"]
    }
  }
}
```

### Windsurf

Chỉnh `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "knowsync": {
      "command": "node",
      "args": ["/absolute/path/to/dist/cli/index.js", "mcp", "/path/to/project"]
    }
  }
}
```

> Nếu đã `npm link`, có thể dùng `"command": "knowsync"` và `"args": ["mcp", "/path/to/project"]`.

Tab **MCP** trong Web UI tự động tạo config JSON sẵn sàng copy-paste cho từng tool.

---
