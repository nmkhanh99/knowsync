  // ── Search tab ────────────────────────────────────────────────────────────
  let searchResults = null;
  let searchTypeFilter = 'all';

  /**
   * Auto-documented structural element.
   */
  function symbolCardExpand(s, idx) {
    const panelId = 'expand-' + idx;
    return '<div class="symbol-card-wrap">' +
      '<div class="symbol-card" style="margin-bottom:0;border-radius:8px 8px ' + (idx >= 0 ? '0 0' : '8px 8px') + '">' +
      '<div class="symbol-header">' + badge(s.type) + ' <span class="symbol-name">' + esc(s.name) + '</span></div>' +
      '<div class="symbol-file">' + esc(shortPath(s.filePath)) + ':' + s.startLine + '</div>' +
      (s.signature ? '<div class="symbol-sig"><code>' + esc(s.signature) + '</code></div>' : '') +
      (s.docString ? '<div class="symbol-doc">' + esc(s.docString.slice(0, 140)) + '</div>' : '') +
      '<button class="symbol-expand-btn" id="btn-' + panelId + '" onclick="toggleSymbolDetail(\'' + esc(s.name).replace(/'/g,"&#39;") + '\',\'' + panelId + '\')">▶ Detail</button>' +
      '</div>' +
      '<div id="' + panelId + '" class="symbol-detail-panel" style="display:none"></div>' +
      '</div>';
  }

  /**
   * Auto-documented structural element.
   */
  async function toggleSymbolDetail(name, panelId) {
    const panel = document.getElementById(panelId);
    const btn = document.getElementById('btn-' + panelId);
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    if (isOpen) {
      panel.style.display = 'none';
      if (btn) btn.innerHTML = '▶ Detail';
      return;
    }
    panel.style.display = 'block';
    if (btn) btn.innerHTML = '▼ Detail';
    if (panel.dataset.loaded) return;
    panel.innerHTML = loading('');
    const data = await api('/api/symbol?name=' + enc(name));
    panel.dataset.loaded = '1';
    if (!data) { panel.innerHTML = '<div style="font-size:12px;color:var(--text2);padding:4px 0">Symbol not found</div>'; return; }
    let html = '';
    if (data.callers.length) {
      html += '<div class="panel-section-title" style="margin-top:0">Callers (' + data.callers.length + ')</div>' +
        data.callers.slice(0, 6).map(c => '<div class="mini-card">' + badge(c.type) + ' ' + esc(c.name) + '</div>').join('');
    }
    if (data.callees.length) {
      html += '<div class="panel-section-title">Callees (' + data.callees.length + ')</div>' +
        data.callees.slice(0, 6).map(c => '<div class="mini-card">' + badge(c.type) + ' ' + esc(c.name) + '</div>').join('');
    }
    if (data.linkedDocs && data.linkedDocs.length) {
      html += '<div class="panel-section-title">Linked Docs (' + data.linkedDocs.length + ')</div>' +
        data.linkedDocs.slice(0, 4).map(d =>
          '<div class="mini-card" style="flex-direction:column;align-items:flex-start;gap:2px">' +
          '<span style="font-weight:500;font-size:11px">' + esc(d.heading) + '</span>' +
          '<span style="font-size:10px;color:var(--text2);font-family:monospace">' + esc(shortPath(d.filePath)) + '</span>' +
          '</div>'
        ).join('');
    }
    if (!html) html = '<div style="font-size:12px;color:var(--text2);padding:4px 0">No callers, callees, or linked docs</div>';
    html += '<div style="display:flex;gap:6px;margin-top:8px">' +
      '<button class="btn-sm btn-blue" onclick="gotoImpact(\'' + esc(name).replace(/'/g,"&#39;") + '\')">⚑ Impact</button>' +
      '<button class="btn-sm btn-purple" onclick="gotoFlow(\'' + esc(name).replace(/'/g,"&#39;") + '\')">⟶ Flow</button>' +
      '</div>';
    panel.innerHTML = html;
  }

  /**
   * Auto-documented structural element.
   */
  function renderSearchResults() {
    const el = document.getElementById('search-results');
    if (!searchResults) return;
    const { symbols, docs } = searchResults;
    const filtered = searchTypeFilter === 'all' ? symbols : symbols.filter(s => s.type === searchTypeFilter);
    let html = '';
    if (filtered.length) {
      const countLabel = searchTypeFilter !== 'all' ? filtered.length + '/' + symbols.length : filtered.length;
      html += '<div class="section-title">Symbols (' + countLabel + ')</div>';
      html += filtered.map((s, i) => symbolCardExpand(s, i)).join('');
    }
    if (docs.length && searchTypeFilter === 'all') {
      html += '<div class="section-title">Documentation (' + docs.length + ')</div>';
      html += docs.map(docCard).join('');
    }
    el.innerHTML = html || empty('No results');
  }

  /**
   * Auto-documented structural element.
   */
  function setSearchType(type) {
    searchTypeFilter = type;
    document.querySelectorAll('.type-filter-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.type === type);
    });
    renderSearchResults();
  }

  /**
   * Auto-documented structural element.
   */
  async function doSearch() {
    const q = document.getElementById('search-input').value.trim();
    const el = document.getElementById('search-results');
    const filterBar = document.getElementById('search-type-filter');
    if (!q) return;
    el.innerHTML = loading();
    filterBar.style.display = 'none';
    searchResults = null;
    searchTypeFilter = 'all';
    const data = await api('/api/search?q=' + enc(q) + '&limit=40');
    if (!data) { el.innerHTML = errHTML('Search failed'); return; }
    searchResults = data;

    if (data.symbols.length) {
      const types = [...new Set(data.symbols.map(s => s.type))];
      if (types.length > 1) {
        filterBar.innerHTML =
          '<button class="type-filter-pill active" data-type="all" onclick="setSearchType(\'all\')">All (' + data.symbols.length + ')</button>' +
          types.map(t =>
            '<button class="type-filter-pill" data-type="' + t + '" onclick="setSearchType(\'' + t + '\')">' + t + '</button>'
          ).join('');
        filterBar.style.display = 'flex';
      }
    }

    renderSearchResults();
  }

  document.getElementById('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

