  // ── Legacy rules config (MCP tab still uses this) ─────────────────────────
  let rulesData = null;

  /**
   * Auto-documented structural element.
   */
  function resetParseRulesState() {
    rulesData = null;
    const el = document.getElementById('rules-results');
    if (el) el.innerHTML = '';
  }

  /**
   * Auto-documented structural element.
   */
  async function loadRulesConfig() {
    if (!currentProject) return;
    const el = document.getElementById('rules-results');
    el.innerHTML = loading();
    const data = await api('/api/mcp-config');
    if (!data) { el.innerHTML = errHTML('Tải dữ liệu thất bại'); return; }
    rulesData = data;
    renderRulesConfig();
  }

  /**
   * Auto-documented structural element.
   */
  function renderRulesConfig() {
    if (!rulesData) return;
    const el = document.getElementById('rules-results');
    const allRules = rulesData.parseRules || [];
    const allArtifacts = rulesData.parseArtifacts || [];
    const languages = Array.from(new Set(
      allRules.map(r => r.language).concat(allArtifacts.map(a => a.language))
    )).sort((a, b) => a.localeCompare(b));
    const kinds = Array.from(new Set(
      allRules.map(r => r.ruleType).concat(allArtifacts.map(a => a.artifactType))
    )).sort((a, b) => a.localeCompare(b));
    const search = mcpRuleSearch.trim().toLowerCase();
    const filteredRules = allRules.filter(r =>
      (mcpRuleLanguage === 'all' || r.language === mcpRuleLanguage) &&
      (mcpRuleKind === 'all' || r.ruleType === mcpRuleKind) &&
      (!search || (r.name || '').toLowerCase().includes(search))
    );
    const filteredArtifacts = allArtifacts.filter(a =>
      (mcpRuleLanguage === 'all' || a.language === mcpRuleLanguage) &&
      (mcpRuleKind === 'all' || a.artifactType === mcpRuleKind) &&
      (!search || (a.name || '').toLowerCase().includes(search))
    );
    const filteredTotal = filteredRules.length + filteredArtifacts.length;
    const filterHtml =
      '<div class="mcp-filter-row">' +
        '<div class="mcp-filter-box"><span class="mcp-filter-label">Ngôn ngữ</span>' +
          '<select class="mcp-filter-select" onchange="setMcpRuleLanguage(this.value)">' +
            '<option value="all"' + (mcpRuleLanguage === 'all' ? ' selected' : '') + '>Tất cả ngôn ngữ</option>' +
            languages.map(l => '<option value="' + esc(l) + '"' + (mcpRuleLanguage === l ? ' selected' : '') + '>' + esc(l) + '</option>').join('') +
          '</select></div>' +
        '<div class="mcp-filter-box"><span class="mcp-filter-label">Loại</span>' +
          '<select class="mcp-filter-select" onchange="setMcpRuleKind(this.value)">' +
            '<option value="all"' + (mcpRuleKind === 'all' ? ' selected' : '') + '>Tất cả loại</option>' +
            kinds.map(k => '<option value="' + esc(k) + '"' + (mcpRuleKind === k ? ' selected' : '') + '>' + esc(k) + '</option>').join('') +
          '</select></div>' +
        '<div class="mcp-filter-box"><span class="mcp-filter-label">Tìm</span>' +
          '<input class="mcp-filter-input" type="text" placeholder="Tên rule hoặc artifact..." value="' + esc(mcpRuleSearch) + '" oninput="setMcpRuleSearch(this.value)" /></div>' +
        '<div class="mcp-filter-badge">' + filteredTotal + ' mục</div>' +
      '</div>';

    el.innerHTML =
      renderParseRulesImportSection(languages) +
      renderParseRulesSampleSection() +
      '<div class="mcp-section-title" style="margin-top:4px">Rules</div>' +
      filterHtml +
      renderParseRulesSection(filteredRules) +
      '<div class="mcp-section-title" style="margin-top:24px">Grammar artifacts</div>' +
      renderParseArtifactsSection(filteredArtifacts);
  }

  /**
   * Auto-documented structural element.
   */
  function switchMcpTool(tool) {
    mcpActiveTool = tool;
    renderMcpConfig();
  }

  /**
   * Auto-documented structural element.
   */
  function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  /**
   * Auto-documented structural element.
   */
  function setMcpRuleLanguage(language) {
    mcpRuleLanguage = language;
    renderRulesConfig();
  }

  /**
   * Auto-documented structural element.
   */
  function setMcpRuleKind(kind) {
    mcpRuleKind = kind;
    renderRulesConfig();
  }

  /**
   * Auto-documented structural element.
   */
  function setMcpRuleSearch(value) {
    mcpRuleSearch = value;
    renderRulesConfig();
  }

  // Parse rules sample templates keyed by tab name
  const PR_SAMPLES = {
    node: {
      label: 'node',
      desc: '<b>node</b>: Trích xuất function/class/interface thành symbol node trong graph. <code>nameCapture</code> là capture chứa tên symbol, <code>nodeType</code> là loại node (Function, Class, Interface…).',
      code: `{
  "language": "typescript",
  "rules": [
    {
      "name": "ts_function",
      "ruleType": "node",
      "nodeType": "Function",
      "nameCapture": "name",
      "priority": 10,
      "query": "(function_declaration name: (identifier) @name) @node"
    },
    {
      "name": "ts_arrow_function",
      "ruleType": "node",
      "nodeType": "Function",
      "nameCapture": "name",
      "priority": 8,
      "query": "(lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function))) @node"
    },
    {
      "name": "ts_class",
      "ruleType": "node",
      "nodeType": "Class",
      "nameCapture": "name",
      "priority": 10,
      "query": "(class_declaration name: (type_identifier) @name) @node"
    },
    {
      "name": "ts_interface",
      "ruleType": "node",
      "nodeType": "Interface",
      "nameCapture": "name",
      "priority": 9,
      "query": "(interface_declaration name: (type_identifier) @name) @node"
    }
  ]
}`,
    },
    edge: {
      label: 'edge',
      desc: '<b>edge</b>: Trích xuất quan hệ giữa hai symbols. <code>sourceCapture</code> = node nguồn, <code>targetCapture</code> = node đích. <code>edgeType</code>: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, USES…',
      code: `{
  "language": "typescript",
  "rules": [
    {
      "name": "ts_call",
      "ruleType": "edge",
      "edgeType": "CALLS",
      "sourceCapture": "caller",
      "targetCapture": "callee",
      "query": "(call_expression function: (identifier) @callee) @caller"
    },
    {
      "name": "ts_extends",
      "ruleType": "edge",
      "edgeType": "EXTENDS",
      "sourceCapture": "child",
      "targetCapture": "parent",
      "query": "(class_declaration name: (type_identifier) @child (class_heritage (extends_clause (identifier) @parent)))"
    },
    {
      "name": "ts_import",
      "ruleType": "edge",
      "edgeType": "IMPORTS",
      "sourceCapture": "imported",
      "targetCapture": "module",
      "query": "(import_statement source: (string (string_fragment) @module) (import_clause (named_imports (import_specifier name: (identifier) @imported))))"
    }
  ]
}`,
    },
    doc_link: {
      label: 'doc_link',
      desc: '<b>doc_link</b>: Map comment/JSDoc vào symbol ngay bên dưới. Dùng trong <code>queryPacks</code> với <code>packType: "comment_doc_linking"</code>. <code>docCapture</code> = capture của comment, <code>symbolCapture</code> = capture của symbol.',
      code: `{
  "language": "typescript",
  "queryPacks": [{
    "name": "ts_jsdoc",
    "packType": "comment_doc_linking",
    "rules": [
      {
        "name": "jsdoc_function",
        "ruleType": "doc_link",
        "docCapture": "doc",
        "symbolCapture": "symbol",
        "query": "(comment) @doc . (function_declaration name: (identifier) @symbol)"
      },
      {
        "name": "jsdoc_class",
        "ruleType": "doc_link",
        "docCapture": "doc",
        "symbolCapture": "symbol",
        "query": "(comment) @doc . (class_declaration name: (type_identifier) @symbol)"
      },
      {
        "name": "jsdoc_method",
        "ruleType": "doc_link",
        "docCapture": "doc",
        "symbolCapture": "symbol",
        "query": "(comment) @doc . (method_definition name: (property_identifier) @symbol)"
      }
    ]
  }]
}`,
    },
    resolve: {
      label: 'resolve',
      desc: '<b>resolve</b>: Giải quyết tham chiếu symbol — map một tên/alias trong code sang symbol thực. Dùng khi edge target là tên ngắn cần resolve về fully-qualified name.',
      code: `{
  "language": "typescript",
  "rules": [
    {
      "name": "ts_resolve_type_alias",
      "ruleType": "resolve",
      "nameCapture": "alias",
      "query": "(type_alias_declaration name: (type_identifier) @alias)"
    },
    {
      "name": "ts_resolve_export_alias",
      "ruleType": "resolve",
      "nameCapture": "local",
      "query": "(export_specifier name: (identifier) @local alias: (identifier) @exported)"
    }
  ]
}`,
    },
    linking: {
      label: 'linking',
      desc: '<b>linking</b>: Liên kết tường minh giữa hai symbols không qua edge thông thường — dùng khi cần tạo quan hệ ngữ nghĩa tuỳ chỉnh mà không phải call/import.',
      code: `{
  "language": "typescript",
  "rules": [
    {
      "name": "ts_decorator_link",
      "ruleType": "linking",
      "sourceCapture": "class",
      "targetCapture": "decorator",
      "query": "(class_declaration (decorator (identifier) @decorator) name: (type_identifier) @class)"
    },
    {
      "name": "ts_implements_link",
      "ruleType": "linking",
      "sourceCapture": "class",
      "targetCapture": "iface",
      "query": "(class_declaration name: (type_identifier) @class (class_heritage (implements_clause (type_identifier) @iface)))"
    }
  ]
}`,
    },
    injection: {
      label: 'injection_query (artifact)',
      desc: '<b>injection_query</b> artifact: Trích xuất embedded content (markdown trong JSDoc, SQL trong string…) bằng injection query tương tự <code>injections.scm</code>. <code>targetLanguage</code> = ngôn ngữ nhúng ("markdown", "sql"…). Capture phải là <code>@injection.content</code>.',
      code: `{
  "language": "typescript",
  "artifacts": [
    {
      "name": "ts_jsdoc_markdown",
      "artifactType": "injection_query",
      "targetLanguage": "markdown",
      "priority": 10,
      "content": "((comment) @injection.content (#match? @injection.content \\"^\\\\/\\\\*\\\\*\\""))"
    },
    {
      "name": "ts_template_sql",
      "artifactType": "injection_query",
      "targetLanguage": "sql",
      "content": "((tagged_template_expression tag: (identifier) @_tag (#eq? @_tag \\"sql\\") (template_string) @injection.content))"
    }
  ]
}`,
    },
    included_ranges: {
      label: 'included_ranges (artifact)',
      desc: '<b>included_ranges</b> artifact: Chọn vùng code cụ thể để index như doc section độc lập — ví dụ string constants, config blocks, enum values. <code>rangeCapture</code> = tên capture xác định vùng.',
      code: `{
  "language": "typescript",
  "artifacts": [
    {
      "name": "ts_string_constants",
      "artifactType": "included_ranges",
      "rangeCapture": "range",
      "query": "(variable_declarator name: (identifier) @_name (#match? @_name \\"[A-Z_]{3,}\\") value: (string) @range)"
    },
    {
      "name": "ts_enum_members",
      "artifactType": "included_ranges",
      "rangeCapture": "range",
      "query": "(enum_declaration (enum_body (enum_assignment name: (property_identifier) value: (string) @range)))"
    }
  ]
}`,
    },
    replace: {
      label: 'replace: true',
      desc: '<b>replace: true</b>: Xóa toàn bộ rules/artifacts hiện tại của ngôn ngữ đó trước khi import set mới. Dùng khi muốn ghi đè hoàn toàn thay vì merge.',
      code: `{
  "language": "python",
  "replace": true,
  "rules": [
    {
      "name": "py_function",
      "ruleType": "node",
      "nodeType": "Function",
      "nameCapture": "name",
      "query": "(function_definition name: (identifier) @name) @node"
    },
    {
      "name": "py_class",
      "ruleType": "node",
      "nodeType": "Class",
      "nameCapture": "name",
      "query": "(class_definition name: (identifier) @name) @node"
    }
  ],
  "queryPacks": [{
    "name": "py_docstring",
    "packType": "comment_doc_linking",
    "rules": [{
      "name": "py_docstring_func",
      "ruleType": "doc_link",
      "docCapture": "doc",
      "symbolCapture": "symbol",
      "query": "(function_definition name: (identifier) @symbol body: (block (expression_statement (string) @doc)))"
    }]
  }]
}`,
    },
  };

  let prSampleTab = 'node';
  let prSampleOpen = false;

  /**
   * Auto-documented structural element.
   */
  function renderParseRulesImportSection(languages) {
    return '<div class="pr-import-box">' +
      '<div class="pr-import-title">' +
        '⬆ Import rules' +
        '<input type="text" class="pr-lang-select" id="pr-import-lang" placeholder="typescript" style="width:110px" />' +
        '<label style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:400;color:var(--text2);cursor:pointer">' +
          '<input type="checkbox" id="pr-import-replace" /> Ghi đè hiện có' +
        '</label>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text2);margin-bottom:8px">Paste JSON hoặc chọn file .json có cấu trúc <code>{ language, rules?, queryPacks?, artifacts? }</code>. Xem Mẫu bên dưới.</div>' +
      '<textarea id="pr-import-textarea" class="pr-textarea" placeholder=\'{"language":"typescript","rules":[...]}\'></textarea>' +
      '<div class="pr-import-row">' +
        '<button class="btn-primary" style="padding:5px 14px;font-size:12px" onclick="doPrImport()">Import</button>' +
        '<button class="btn-secondary" style="padding:5px 14px;font-size:12px" onclick="doPrValidateImport(this)">Kiểm tra</button>' +
        '<label class="btn-secondary" style="padding:5px 14px;font-size:12px;cursor:pointer">📂 File<input type="file" accept=".json" style="display:none" onchange="doPrImportFile(this)"></label>' +
        '<span id="pr-import-status" style="font-size:11px;margin-left:6px;min-height:16px"></span>' +
      '</div>' +
      '<div id="pr-import-validate-result" class="pr-validate-result" style="margin-top:8px"></div>' +
    '</div>';
  }

  /**
   * Auto-documented structural element.
   */
  function renderParseRulesSampleSection() {
    const tabs = Object.entries(PR_SAMPLES).map(([k, v]) =>
      '<button class="pr-sample-tab' + (k === prSampleTab ? ' active' : '') + '" onclick="setPrSampleTab(\'' + k + '\')">' + v.label + '</button>'
    ).join('');
    const s = PR_SAMPLES[prSampleTab];
    return '<div class="pr-sample">' +
      '<div class="pr-sample-head" onclick="togglePrSample()">' +
        '<span class="pr-sample-title">📋 Mẫu cú pháp (Tree-sitter S-expression)</span>' +
        '<span style="font-size:11px;color:var(--text2)">' + (prSampleOpen ? '▲ Thu gọn' : '▼ Mở rộng') + '</span>' +
      '</div>' +
      '<div class="pr-sample-body' + (prSampleOpen ? ' open' : '') + '">' +
        '<div class="pr-sample-tabs">' + tabs + '</div>' +
        '<div class="pr-sample-desc">' + s.desc + '</div>' +
        '<pre class="pr-sample-code">' + esc(s.code) + '</pre>' +
        '<button class="btn-secondary" style="padding:3px 10px;font-size:11px;margin-top:8px" onclick="doPrCopySample()">Copy mẫu này</button>' +
      '</div>' +
    '</div>';
  }

  /**
   * Auto-documented structural element.
   */
  function togglePrSample() {
    prSampleOpen = !prSampleOpen;
    const body = document.querySelector('.pr-sample-body');
    if (body) body.classList.toggle('open', prSampleOpen);
    const arrow = document.querySelector('.pr-sample-head span:last-child');
    if (arrow) arrow.textContent = prSampleOpen ? '▲ Thu gọn' : '▼ Mở rộng';
  }

  /**
   * Auto-documented structural element.
   */
  function setPrSampleTab(tab) {
    prSampleTab = tab;
    prSampleOpen = true;
    const body = document.querySelector('.pr-sample-body');
    const arrow = document.querySelector('.pr-sample-head span:last-child');
    if (!body) { renderRulesConfig(); return; }
    body.classList.add('open');
    if (arrow) arrow.textContent = '▲ Thu gọn';
    // Update active tab button
    document.querySelectorAll('.pr-sample-tab').forEach(btn => {
      btn.classList.toggle('active', btn.textContent === PR_SAMPLES[tab]?.label);
    });
    // Update desc + code
    const s = PR_SAMPLES[tab];
    const desc = body.querySelector('.pr-sample-desc');
    const code = body.querySelector('.pr-sample-code');
    if (desc) desc.innerHTML = s.desc;
    if (code) code.textContent = s.code;
  }

  /**
   * Auto-documented structural element.
   */
  function doPrCopySample() {
    navigator.clipboard.writeText(PR_SAMPLES[prSampleTab].code).catch(() => {});
  }

  /**
   * Auto-documented structural element.
   */
  async function doPrImport() {
    const raw = document.getElementById('pr-import-textarea').value.trim();
    const status = document.getElementById('pr-import-status');
    if (!raw) { status.style.color = 'var(--red)'; status.textContent = 'Chưa có nội dung'; return; }
    let payload;
    try { payload = JSON.parse(raw); } catch (e) { status.style.color = 'var(--red)'; status.textContent = 'JSON không hợp lệ: ' + e.message; return; }
    // Override language and replace from dropdowns if not set
    if (!payload.language) payload.language = document.getElementById('pr-import-lang').value;
    if (document.getElementById('pr-import-replace').checked) payload.replace = true;
    status.style.color = 'var(--text2)'; status.textContent = 'Đang import…';
    const r = await fetch('/api/provide-parse-rules?project=' + enc(currentProject), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (data.ok) {
      status.style.color = 'var(--green)';
      status.textContent = '✓ Đã import ' + data.added + ' rules' + (data.artifactsAdded ? ' + ' + data.artifactsAdded + ' artifacts' : '') + ' (tổng: ' + data.total + ')';
      document.getElementById('pr-import-textarea').value = '';
      resetParseRulesState();
      // If imported from within a RuleSet context, assign rules to that set
      const targetSetId = window._importTargetRuleSetId;
      if (targetSetId && data.ruleIds && data.ruleIds.length) {
        await fetch('/api/rule-sets/' + enc(targetSetId) + '/assign-rules?project=' + enc(currentProject), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ruleIds: data.ruleIds, artifactIds: data.artifactIds || [] }),
        });
        await selectRuleSet(targetSetId);
      }
    } else {
      status.style.color = 'var(--red)'; status.textContent = data.error || 'Import thất bại';
    }
  }

  /**
   * Auto-documented structural element.
   */
  function doPrImportFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('pr-import-textarea').value = e.target.result;
      // Auto-detect language from filename convention (e.g. typescript.rules.json)
      const fname = file.name.toLowerCase();
      const langInput = document.getElementById('pr-import-lang');
      if (langInput && !langInput.value) {
        if (fname.includes('typescript') || fname.includes('ts.')) langInput.value = 'typescript';
        else if (fname.includes('javascript') || fname.includes('js.')) langInput.value = 'javascript';
        else if (fname.includes('python') || fname.includes('py.')) langInput.value = 'python';
      }
    };
    reader.readAsText(file);
    input.value = ''; // allow re-selecting same file
  }

  // Validate textarea JSON BEFORE importing
  async function doPrValidateImport(btnEl) {
    const raw = document.getElementById('pr-import-textarea').value.trim();
    const status = document.getElementById('pr-import-status');
    const resultEl = document.getElementById('pr-import-validate-result');
    if (!raw) { status.style.color = 'var(--red)'; status.textContent = 'Chưa có nội dung'; return; }
    let payload;
    try { payload = JSON.parse(raw); } catch (e) { status.style.color = 'var(--red)'; status.textContent = 'JSON không hợp lệ: ' + e.message; return; }
    if (!payload.language) { status.style.color = 'var(--red)'; status.textContent = 'Thiếu trường "language"'; return; }
    btnEl.disabled = true; btnEl.textContent = '…';
    status.style.color = 'var(--text2)'; status.textContent = 'Đang kiểm tra…';
    if (resultEl) resultEl.innerHTML = loading('Đang chạy trên tối đa 3 file…');
    const r = await fetch('/api/validate-parse-rules?project=' + enc(currentProject), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: payload.language, rules: payload.rules, queryPacks: payload.queryPacks, artifacts: payload.artifacts }),
    });
    const data = await r.json();
    btnEl.disabled = false; btnEl.textContent = 'Kiểm tra';
    if (data.error) {
      status.style.color = 'var(--red)'; status.textContent = data.error;
      if (resultEl) resultEl.innerHTML = '';
      return;
    }
    status.style.color = 'var(--text2)'; status.textContent = 'Đã xem trước ' + data.filesPreviewed + ' file';
    if (!resultEl) return;
    let html = '';
    for (const preview of (data.previews || [])) {
      const hasErrors = preview.queryErrors && preview.queryErrors.length;
      const errColor = hasErrors ? 'var(--red)' : 'var(--green)';
      html += '<div class="pr-validate-file">' +
        '<div class="pr-validate-file-head">' +
          '<span style="color:' + errColor + '">' + (hasErrors ? '✗' : '✓') + '</span>' +
          esc(shortPath(preview.filePath)) +
          '<span style="margin-left:auto;color:var(--text2)">' + preview.symbolCount + ' symbols · ' + preview.docSectionCount + ' docs</span>' +
        '</div>';
      if (hasErrors || (preview.matchDetails && preview.matchDetails.length) || !hasErrors) {
        html += '<div class="pr-validate-file-body">';
        if (hasErrors) {
          for (const err of preview.queryErrors) {
            html += '<div class="pr-validate-error">' +
              (err.ruleName ? '<strong>' + esc(err.ruleName) + '</strong>: ' : '') +
              esc(err.error) +
              (err.lineSnippet ? '<br><code>' + esc(err.lineSnippet) + '</code>' : '') +
            '</div>';
          }
        }
        if (preview.matchDetails && preview.matchDetails.length) {
          html += '<div style="margin-top:4px">';
          for (const m of preview.matchDetails.slice(0, 6)) {
            html += '<div class="pr-validate-match">▸ <strong>' + esc(m.ruleName) + '</strong>' +
              (m.packName ? ' [' + esc(m.packName) + ']' : '') +
              ' — ' + m.captures.length + ' capture' + (m.captures.length !== 1 ? 's' : '') +
              (m.captures[0] ? ' · first: <code>' + esc(m.captures[0].text.slice(0, 40)) + '</code>' : '') +
            '</div>';
          }
          if (preview.matchDetails.length > 6) html += '<div class="pr-validate-match" style="color:var(--text2)">…+' + (preview.matchDetails.length - 6) + ' match khác</div>';
          html += '</div>';
        }
        if (!hasErrors && (!preview.matchDetails || !preview.matchDetails.length)) {
          html += '<div style="font-size:11px;color:var(--text2)">Không có lỗi query. Đã trích xuất ' + preview.symbolCount + ' symbol.</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    resultEl.innerHTML = html;
  }

  // Test stored parse rules against project files (per language group)
  async function doValidateParseRules(language, btnEl) {
    const resultId = 'pr-validate-result-' + language;
    let resultEl = document.getElementById(resultId);
    if (!resultEl) return;
    btnEl.disabled = true; btnEl.textContent = '…';
    resultEl.innerHTML = loading('Đang chạy trên tối đa 3 file…');
    const r = await fetch('/api/validate-parse-rules?project=' + enc(currentProject), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language }),
    });
    const data = await r.json();
    btnEl.disabled = false; btnEl.textContent = 'Kiểm tra';
    if (data.error) { resultEl.innerHTML = '<div class="pr-validate-error">' + esc(data.error) + '</div>'; return; }

    let html = '<div style="font-size:11px;color:var(--text2);margin-bottom:8px">' +
      'Đã xem trước ' + data.filesPreviewed + ' file</div>';

    for (const preview of (data.previews || [])) {
      const hasErrors = preview.queryErrors && preview.queryErrors.length;
      const errColor = hasErrors ? 'var(--red)' : 'var(--green)';
      html += '<div class="pr-validate-file">' +
        '<div class="pr-validate-file-head">' +
          '<span style="color:' + errColor + '">' + (hasErrors ? '✗' : '✓') + '</span>' +
          esc(shortPath(preview.filePath)) +
          '<span style="margin-left:auto;color:var(--text2)">' + preview.symbolCount + ' symbols · ' + preview.docSectionCount + ' docs</span>' +
        '</div>';
      if (hasErrors || (preview.matchDetails && preview.matchDetails.length) || !hasErrors) {
        html += '<div class="pr-validate-file-body">';
        if (hasErrors) {
          for (const err of preview.queryErrors) {
            html += '<div class="pr-validate-error">' +
              (err.ruleName ? '<strong>' + esc(err.ruleName) + '</strong>: ' : '') +
              esc(err.error) +
              (err.lineSnippet ? '<br><code>' + esc(err.lineSnippet) + '</code>' : '') +
            '</div>';
          }
        }
        if (preview.matchDetails && preview.matchDetails.length) {
          html += '<div style="margin-top:4px">';
          for (const m of preview.matchDetails.slice(0, 6)) {
            html += '<div class="pr-validate-match">▸ <strong>' + esc(m.ruleName) + '</strong>' +
              (m.packName ? ' [' + esc(m.packName) + ']' : '') +
              ' — ' + m.captures.length + ' capture' + (m.captures.length !== 1 ? 's' : '') +
              (m.captures[0] ? ' · first: <code>' + esc(m.captures[0].text.slice(0, 40)) + '</code>' : '') +
            '</div>';
          }
          if (preview.matchDetails.length > 6) html += '<div class="pr-validate-match" style="color:var(--text2)">…+' + (preview.matchDetails.length - 6) + ' match khác</div>';
          html += '</div>';
        }
        if (!hasErrors && (!preview.matchDetails || !preview.matchDetails.length)) {
          html += '<div style="font-size:11px;color:var(--text2)">Không có lỗi query. Đã trích xuất ' + preview.symbolCount + ' symbol.</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    resultEl.innerHTML = html;
  }

  const prGroupView = {}; // language -> 'cards' | 'json'

  function ruleToExportObj(rule) {
    const obj = { name: rule.name, ruleType: rule.ruleType, query: rule.query };
    if (rule.packName)      obj.packName      = rule.packName;
    if (rule.nodeType)      obj.nodeType      = rule.nodeType;
    if (rule.edgeType)      obj.edgeType      = rule.edgeType;
    if (rule.nameCapture)   obj.nameCapture   = rule.nameCapture;
    if (rule.sourceCapture) obj.sourceCapture = rule.sourceCapture;
    if (rule.targetCapture) obj.targetCapture = rule.targetCapture;
    if (rule.docCapture)    obj.docCapture    = rule.docCapture;
    if (rule.symbolCapture) obj.symbolCapture = rule.symbolCapture;
    if (rule.priority != null && rule.priority !== 0) obj.priority = rule.priority;
    return obj;
  }

  /**
   * Auto-documented structural element.
   */
  function artifactToExportObj(a) {
    const obj = { name: a.name, artifactType: a.artifactType };
    if (a.packName)       obj.packName       = a.packName;
    if (a.content)        obj.content        = a.content;
    if (a.query)          obj.query          = a.query;
    if (a.targetLanguage) obj.targetLanguage = a.targetLanguage;
    if (a.rangeCapture)   obj.rangeCapture   = a.rangeCapture;
    if (a.priority != null && a.priority !== 0) obj.priority = a.priority;
    return obj;
  }

  /**
   * Auto-documented structural element.
   */
  function buildExportPayload(language, rules, artifacts) {
    const langRules = rules.filter(r => r.language === language);
    const langArtifacts = (artifacts || []).filter(a => a.language === language);
    // Group doc_link rules that share a packName into queryPacks
    const directRules = langRules.filter(r => !r.packName);
    const packedRulesByPack = {};
    for (const r of langRules.filter(r => r.packName)) {
      if (!packedRulesByPack[r.packName]) packedRulesByPack[r.packName] = [];
      packedRulesByPack[r.packName].push(r);
    }
    const queryPacks = Object.entries(packedRulesByPack).map(([packName, packRules]) => ({
      name: packName,
      packType: 'comment_doc_linking',
      rules: packRules.map(ruleToExportObj),
    }));
    const payload = { language };
    if (directRules.length)  payload.rules       = directRules.map(ruleToExportObj);
    if (queryPacks.length)   payload.queryPacks  = queryPacks;
    if (langArtifacts.length) payload.artifacts  = langArtifacts.map(artifactToExportObj);
    return payload;
  }

  /**
   * Auto-documented structural element.
   */
  function togglePrGroupView(language) {
    prGroupView[language] = prGroupView[language] === 'json' ? 'cards' : 'json';
    renderRulesConfig();
  }

  /**
   * Auto-documented structural element.
   */
  function copyPrGroupJson(language) {
    if (!rulesData) return;
    const allRules = rulesData.parseRules || [];
    const allArtifacts = rulesData.parseArtifacts || [];
    const payload = buildExportPayload(language, allRules, allArtifacts);
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).catch(() => {});
  }

  /**
   * Auto-documented structural element.
   */
  function loadToImport(language) {
    if (!rulesData) return;
    const allRules = rulesData.parseRules || [];
    const allArtifacts = rulesData.parseArtifacts || [];
    const payload = buildExportPayload(language, allRules, allArtifacts);
    const textarea = document.getElementById('pr-import-textarea');
    if (textarea) {
      textarea.value = JSON.stringify(payload, null, 2);
      const sel = document.getElementById('pr-import-lang');
      if (sel) sel.value = language;
      textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      textarea.focus();
    }
  }

  /**
   * Auto-documented structural element.
   */
  function renderParseRulesSection(rules) {
    const grouped = new Map();
    for (const rule of rules) {
      if (!grouped.has(rule.language)) grouped.set(rule.language, []);
      grouped.get(rule.language).push(rule);
    }
    if (!grouped.size) return '<div class="mcp-empty">Chưa có parse rules nào được lưu cho dự án này.</div>';

    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([language, group]) => {
      const sorted = group.sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.name.localeCompare(b.name));
      const viewMode = prGroupView[language] || 'cards';
      const validateId = 'pr-validate-result-' + esc(language);

      // Build content based on view mode
      let contentHtml;
      if (viewMode === 'json') {
        const allArtifacts = (rulesData && rulesData.parseArtifacts) || [];
        const payload = buildExportPayload(language, rules, allArtifacts);
        const jsonStr = JSON.stringify(payload, null, 2);
        contentHtml =
          '<div style="position:relative">' +
            '<pre class="pr-sample-code" style="max-height:400px;overflow:auto">' + esc(jsonStr) + '</pre>' +
            '<div style="display:flex;gap:6px;margin-top:8px">' +
              '<button class="btn-secondary" style="padding:3px 10px;font-size:11px" onclick="copyPrGroupJson(\'' + esc(language) + '\')">Copy JSON</button>' +
              '<button class="btn-secondary" style="padding:3px 10px;font-size:11px" onclick="loadToImport(\'' + esc(language) + '\')">Load vào Import</button>' +
            '</div>' +
          '</div>';
      } else {
        contentHtml = sorted.map(rule => renderRuleCard(rule)).join('');
      }

      return '<div class="mcp-rule-group">' +
        '<div class="mcp-rule-group-head">' +
          '<div class="mcp-rule-group-title">' + esc(language) + '</div>' +
          '<div class="mcp-rule-count">' + group.length + ' rules</div>' +
          '<div class="mcp-rule-group-actions">' +
            '<button class="btn-secondary' + (viewMode === 'json' ? ' active' : '') + '" style="padding:3px 10px;font-size:11px" ' +
              'onclick="togglePrGroupView(\'' + esc(language) + '\')">' + (viewMode === 'json' ? 'Cards' : 'JSON') + '</button>' +
            '<button class="btn-secondary" style="padding:3px 10px;font-size:11px" ' +
              'onclick="doValidateParseRules(\'' + esc(language) + '\',this)">Kiểm tra bản lưu</button>' +
          '</div>' +
        '</div>' +
        contentHtml +
        '<div id="' + validateId + '" class="pr-validate-result"></div>' +
      '</div>';
    }).join('');
  }

  /**
   * Auto-documented structural element.
   */
  function renderParseArtifactsSection(artifacts) {
    const grouped = new Map();
    for (const artifact of artifacts) {
      if (!grouped.has(artifact.language)) grouped.set(artifact.language, []);
      grouped.get(artifact.language).push(artifact);
    }
    if (!grouped.size) return '<div class="mcp-empty">Chưa có grammar artifact nào được lưu cho dự án này.</div>';

    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([language, group]) => {
      const artifactCards = group
        .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.name.localeCompare(b.name))
        .map(artifact => renderArtifactCard(artifact))
        .join('');
      return '<div class="mcp-rule-group">' +
        '<div class="mcp-rule-group-head">' +
          '<div class="mcp-rule-group-title">' + esc(language) + '</div>' +
          '<div class="mcp-rule-count">' + group.length + ' artifacts</div>' +
        '</div>' +
        artifactCards +
      '</div>';
    }).join('');
  }

  /**
   * Auto-documented structural element.
   */
  function renderRuleCard(rule) {
    const metas = [];
    if (rule.packName) metas.push('pack: ' + esc(rule.packName));
    if (rule.nodeType) metas.push('node: ' + esc(rule.nodeType));
    if (rule.edgeType) metas.push('edge: ' + esc(rule.edgeType));
    if (rule.nameCapture) metas.push('name: @' + esc(rule.nameCapture));
    if (rule.sourceCapture) metas.push('source: @' + esc(rule.sourceCapture));
    if (rule.targetCapture) metas.push('target: @' + esc(rule.targetCapture));
    if (rule.docCapture) metas.push('doc: @' + esc(rule.docCapture));
    if (rule.symbolCapture) metas.push('symbol: @' + esc(rule.symbolCapture));
    metas.push('priority: ' + String(rule.priority || 0));
    return '<div class="mcp-rule-card">' +
      '<div class="mcp-rule-head">' +
        '<div class="mcp-rule-name">' + esc(rule.name) + '</div>' +
        '<div class="mcp-rule-pill">' + esc(rule.ruleType) + '</div>' +
      '</div>' +
      '<div class="mcp-rule-meta">' + metas.map(m => '<span>' + m + '</span>').join('') + '</div>' +
      '<div class="mcp-rule-query">' + esc(rule.query || '') + '</div>' +
    '</div>';
  }

  /**
   * Auto-documented structural element.
   */
  function renderArtifactCard(artifact) {
    const metas = [];
    if (artifact.packName) metas.push('pack: ' + esc(artifact.packName));
    if (artifact.targetLanguage) metas.push('target: ' + esc(artifact.targetLanguage));
    if (artifact.rangeCapture) metas.push('range: @' + esc(artifact.rangeCapture));
    metas.push('priority: ' + String(artifact.priority || 0));
    const body = artifact.content || artifact.query || '';
    return '<div class="mcp-rule-card">' +
      '<div class="mcp-rule-head">' +
        '<div class="mcp-rule-name">' + esc(artifact.name) + '</div>' +
        '<div class="mcp-rule-pill">' + esc(artifact.artifactType) + '</div>' +
      '</div>' +
      '<div class="mcp-rule-meta">' + metas.map(m => '<span>' + m + '</span>').join('') + '</div>' +
      '<div class="mcp-rule-query">' + esc(body) + '</div>' +
    '</div>';
  }
