  // ── Impact tab ────────────────────────────────────────────────────────────
  async function doImpact() {
    const name = document.getElementById('impact-name').value.trim();
    const depth = document.getElementById('impact-depth').value;
    const el = document.getElementById('impact-results');
    if (!name) return;
    el.innerHTML = loading('Analyzing impact…');
    const data = await api('/api/impact?name=' + enc(name) + '&depth=' + depth);
    if (!data) { el.innerHTML = errHTML('Analysis failed'); return; }

    const total = data.directlyAffected.length + data.transitivelyAffected.length;
    if (total === 0 && data.linkedDocs.length === 0) {
      el.innerHTML = '<div class="success-box">No dependents found — safe to change.</div>'; return;
    }

    let html = '<div class="impact-summary">' +
      '<span class="impact-badge direct">' + data.directlyAffected.length + ' direct</span>' +
      '<span class="impact-badge transitive">' + data.transitivelyAffected.length + ' transitive</span>' +
      '<span class="impact-badge docs">' + data.linkedDocs.length + ' docs</span>' +
      '</div>';

    if (data.directlyAffected.length) {
      html += '<div class="section-title">Directly Affected</div>' + data.directlyAffected.map(s => symbolCard(s)).join('');
    }
    if (data.transitivelyAffected.length) {
      html += '<div class="section-title">Transitively Affected</div>' + data.transitivelyAffected.map(s => symbolCard(s)).join('');
    }
    if (data.linkedDocs.length) {
      html += '<div class="section-title">Linked Docs</div>' + data.linkedDocs.map(docCard).join('');
    }
    el.innerHTML = html;
  }

  document.getElementById('impact-name').addEventListener('keydown', e => { if (e.key === 'Enter') doImpact(); });

  // ── Flow tab ──────────────────────────────────────────────────────────────
  async function doFlow() {
    const mode = document.getElementById('flow-mode').value;
    const entry = document.getElementById('flow-entry').value.trim();
    const docDepth = document.getElementById('flow-doc-depth').value;
    const depth = document.getElementById('flow-depth').value;
    const el = document.getElementById('flow-results');
    if (!entry) return;
    el.innerHTML = loading('Tracing flow…');
    if (mode === 'doc') {
      const data = await api('/api/doc-flow?query=' + enc(entry) + '&docDepth=' + docDepth + '&codeDepth=' + depth);
      if (!data) { el.innerHTML = empty('Doc section "' + esc(entry) + '" not found'); return; }
      el.innerHTML = renderDocFlowTrace(data);
      return;
    }

    const data = await api('/api/flow?entry=' + enc(entry) + '&depth=' + depth);
    if (!data) { el.innerHTML = empty('Entry point "' + esc(entry) + '" not found'); return; }

    let html = '<div class="flow-entry">' +
      badge(data.entryPoint.type) + ' <strong>' + esc(data.entryPoint.name) + '</strong>' +
      '<span class="file-path">' + esc(shortPath(data.entryPoint.filePath)) + ':' + data.entryPoint.startLine + '</span>' +
      '</div>';

    if (!data.steps.length) { html += empty('No outgoing calls found'); }
    else {
      html += '<div class="flow-steps">' + data.steps.map(step =>
        '<div class="flow-step" style="padding-left:' + (14 + step.callDepth * 20) + 'px">' +
        '<span class="flow-depth">→</span>' + badge(step.symbol.type) +
        ' <span class="flow-name">' + esc(step.symbol.name) + '</span>' +
        '<span class="file-path">' + esc(shortPath(step.symbol.filePath)) + ':' + step.symbol.startLine + '</span>' +
        '</div>'
      ).join('') + '</div>';
    }
    el.innerHTML = html;
  }

  document.getElementById('flow-entry').addEventListener('keydown', e => { if (e.key === 'Enter') doFlow(); });
  document.getElementById('flow-mode').addEventListener('change', () => {
    const mode = document.getElementById('flow-mode').value;
    const input = document.getElementById('flow-entry');
    input.placeholder = mode === 'doc'
      ? 'Doc heading, keyword, hoặc doc:<id>...'
      : 'Entry point function...';
  });

  function renderDocFlowTrace(data) {
    const renderDocDepthList = (title, items, emptyText) => {
      if (!items.length) return '<div class="section-title">' + title + '</div>' + empty(emptyText);
      return '<div class="section-title">' + title + '</div>' + items.map((item) =>
        '<div>' +
          '<div style="font-size:10px;color:var(--text2);margin:0 0 4px 4px">Depth ' + item.depth + '</div>' +
          docCard(item.doc) +
        '</div>'
      ).join('');
    };

    const renderDocSources = (fromDocs) => fromDocs.map((item) =>
      '<div style="font-size:11px;color:var(--text2);margin-top:4px">' +
        '<span style="color:var(--text);font-family:monospace">' + esc(item.heading) + '</span>' +
        ' · ' + esc(item.edgeType) +
        ' · ' + (item.relationToFocus === 'focus' ? 'focus doc' : ('after depth ' + item.docDepth)) +
      '</div>'
    ).join('');

    const renderCodeFlow = (flow) => {
      let html = '<div class="symbol-card">' +
        '<div class="symbol-header">' + badge(flow.entrySymbol.type) +
        ' <span class="symbol-name">' + esc(flow.entrySymbol.name) + '</span></div>' +
        '<div class="symbol-file">' + esc(shortPath(flow.entrySymbol.filePath)) + ':' + flow.entrySymbol.startLine + '</div>' +
      '</div>';
      if (!flow.steps.length) return html + empty('No outgoing calls found for "' + esc(flow.entrySymbol.name) + '"');
      return html + '<div class="flow-steps">' + flow.steps.map((step) =>
        '<div class="flow-step" style="padding-left:' + (14 + step.callDepth * 20) + 'px">' +
          '<span class="flow-depth">→</span>' + badge(step.symbol.type) +
          ' <span class="flow-name">' + esc(step.symbol.name) + '</span>' +
          '<span class="file-path">' + esc(shortPath(step.symbol.filePath)) + ':' + step.symbol.startLine + '</span>' +
        '</div>'
      ).join('') + '</div>';
    };

    let html = '<div class="impact-summary">' +
      '<span class="impact-badge direct">' + data.summary.beforeDocCount + ' before docs</span>' +
      '<span class="impact-badge transitive">' + data.summary.afterDocCount + ' after docs</span>' +
      '<span class="impact-badge docs">' + data.summary.linkedSymbolCount + ' linked symbols</span>' +
      '</div>';

    html += '<div class="section-title">Focus Doc</div>' + docCard(data.focusDoc);
    html += renderDocDepthList('Before Docs', data.beforeDocs, 'No upstream docs.');
    html += renderDocDepthList('After Docs', data.afterDocs, 'No downstream docs.');

    if (!data.linkedSymbols.length) {
      html += '<div class="section-title">Linked Symbols</div>' + empty('No doc -> code links found from focus doc and downstream docs.');
    } else {
      html += '<div class="section-title">Linked Symbols</div>' + data.linkedSymbols.map((item) =>
        symbolCard(item.symbol) +
        '<div style="margin:-8px 0 14px 12px;padding:0 0 0 12px;border-left:2px solid var(--border)">' +
          '<div style="font-size:11px;color:var(--text2)">Edge types: ' + esc(item.edgeTypes.join(', ')) + '</div>' +
          '<div style="font-size:11px;color:var(--text2)">Direct callers: ' + item.directCallers.length + ' · Direct callees: ' + item.directCallees.length + ' · Linked docs: ' + item.linkedDocs.length + '</div>' +
          renderDocSources(item.fromDocs) +
        '</div>'
      ).join('');
    }

    html += '<div class="section-title">Code Flow</div>' + data.codeFlows.map(renderCodeFlow).join('');
    return html;
  }

  // ── Module tab ────────────────────────────────────────────────────────────
  async function doModule() {
    const pattern = document.getElementById('module-pattern').value.trim();
    const el = document.getElementById('module-results');
    if (!pattern) return;
    el.innerHTML = loading();
    const data = await api('/api/module?pattern=' + enc(pattern));
    if (!data || data.symbolCount === 0) { el.innerHTML = empty('No symbols found for "' + esc(pattern) + '"'); return; }

    let html = '<div class="module-stats">' +
      '<div class="module-stat"><span class="stat-val">' + data.symbolCount + '</span><span class="stat-lbl">symbols</span></div>' +
      '<div class="module-stat"><span class="stat-val">' + data.fileCount + '</span><span class="stat-lbl">files</span></div>' +
      '</div>';

    if (data.topCalledSymbols.length) {
      html += '<div class="section-title">Top Called</div>' + data.topCalledSymbols.map(({ symbol: s, callCount }) =>
        '<div class="symbol-card"><div class="symbol-header">' + badge(s.type) + ' <span class="symbol-name">' + esc(s.name) + '</span>' +
        '<span class="call-count">' + callCount + ' calls</span></div>' +
        '<div class="symbol-file">' + esc(shortPath(s.filePath)) + ':' + s.startLine + '</div></div>'
      ).join('');
    }

    // Symbols grouped by file
    html += '<div class="section-title">All Symbols (' + data.symbolCount + ')</div>';
    const byFile = {};
    for (const s of data.symbols) {
      if (!byFile[s.filePath]) byFile[s.filePath] = [];
      byFile[s.filePath].push(s);
    }
    for (const [file, syms] of Object.entries(byFile)) {
      html += '<div class="file-group"><div class="file-group-header">' + esc(file) +
        ' <span class="file-count">' + syms.length + '</span></div>' +
        syms.map(s => symbolCard(s)).join('') + '</div>';
    }
    el.innerHTML = html;
  }

  document.getElementById('module-pattern').addEventListener('keydown', e => { if (e.key === 'Enter') doModule(); });
