  // ── MCP tab ───────────────────────────────────────────────────────────────
  let mcpData = null;
  // ── MCP active tool ───────────────────────────────────────────────────────
  let mcpActiveTool = 'claude';
  let mcpRuleLanguage = 'all';
  let mcpRuleKind = 'all';
  let mcpRuleSearch = '';

  /**
   * Auto-documented structural element.
   */
  function resetMcpState() {
    mcpData = null;
    mcpActiveTool = 'claude';
    mcpRuleLanguage = 'all';
    mcpRuleKind = 'all';
    mcpRuleSearch = '';
    const el = document.getElementById('mcp-results');
    if (el) el.innerHTML = '';
  }

  /**
   * Auto-documented structural element.
   */
  async function loadMcpConfig() {
    if (!currentProject) return;
    const el = document.getElementById('mcp-results');
    el.innerHTML = loading();
    const data = await api('/api/mcp-config');
    if (!data) { el.innerHTML = errHTML('Failed to load MCP config'); return; }
    mcpData = data;
    renderMcpConfig();
  }

  /**
   * Auto-documented structural element.
   */
  function renderMcpConfig() {
    if (!mcpData) return;
    const el = document.getElementById('mcp-results');
    const configs = {
      claude: { label: 'Claude Desktop', key: 'claudeDesktop', file: '~/Library/Application Support/Claude/claude_desktop_config.json' },
      cursor: { label: 'Cursor', key: 'cursor', file: '.cursor/mcp.json' },
      windsurf: { label: 'Windsurf', key: 'windsurf', file: '~/.codeium/windsurf/mcp_config.json' },
    };
    const active = configs[mcpActiveTool];
    const json = JSON.stringify(mcpData[active.key], null, 2);
    const allRules = mcpData.parseRules || [];
    const allArtifacts = mcpData.parseArtifacts || [];
    const languages = Array.from(new Set(
      allRules.map(rule => rule.language).concat(allArtifacts.map(artifact => artifact.language))
    )).sort((a, b) => a.localeCompare(b));
    const kinds = Array.from(new Set(
      allRules.map(rule => rule.ruleType).concat(allArtifacts.map(artifact => artifact.artifactType))
    )).sort((a, b) => a.localeCompare(b));
    const search = mcpRuleSearch.trim().toLowerCase();
    const filteredRules = allRules.filter(rule =>
      (mcpRuleLanguage === 'all' || rule.language === mcpRuleLanguage) &&
      (mcpRuleKind === 'all' || rule.ruleType === mcpRuleKind) &&
      (!search || (rule.name || '').toLowerCase().includes(search))
    );
    const filteredArtifacts = allArtifacts.filter(artifact =>
      (mcpRuleLanguage === 'all' || artifact.language === mcpRuleLanguage) &&
      (mcpRuleKind === 'all' || artifact.artifactType === mcpRuleKind) &&
      (!search || (artifact.name || '').toLowerCase().includes(search))
    );
    el.innerHTML =
      '<div class="mcp-section-title">Client Config</div>' +
      '<div class="mcp-path-row"><span class="mcp-path-label">CLI</span><span class="mcp-path-val" title="' + esc(mcpData.cliPath) + '">' + esc(mcpData.cliPath) + '</span></div>' +
      '<div class="mcp-path-row"><span class="mcp-path-label">Project</span><span class="mcp-path-val" title="' + esc(mcpData.projectPath) + '">' + esc(mcpData.projectPath) + '</span></div>' +
      '<div class="mcp-tool-tabs">' +
        Object.entries(configs).map(([k, v]) =>
          '<button class="mcp-tool-btn' + (k === mcpActiveTool ? ' active' : '') + '" onclick="switchMcpTool(\'' + k + '\')">' + v.label + '</button>'
        ).join('') +
      '</div>' +
      '<div style="font-size:11px;color:var(--text2);margin-bottom:8px">File: <code>' + esc(active.file) + '</code></div>' +
      '<div class="mcp-code-block"><button class="mcp-copy-btn" onclick="copyText(' + "'" + json.replace(/'/g, "\\'") + "'" + ')">Copy</button>' + esc(json) + '</div>';
  }
