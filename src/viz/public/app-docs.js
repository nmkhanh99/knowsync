  // ── Validate tab ──────────────────────────────────────────────────────────
  async function doValidate() {
    validateLoaded = true;
    const el = document.getElementById('validate-results');
    el.innerHTML = loading('Scanning for undocumented symbols…');
    const data = await api('/api/validate');
    if (!data) { el.innerHTML = errHTML('Validation failed'); return; }

    if (data.total === 0) {
      el.innerHTML = '<div class="success-box">All Functions, Classes, and Methods are documented.</div>'; return;
    }

    const byFile = {};
    for (const s of data.undocumented) {
      if (!byFile[s.filePath]) byFile[s.filePath] = [];
      byFile[s.filePath].push(s);
    }

    let html = '<div class="validate-summary">' + data.total + ' undocumented symbol' + (data.total > 1 ? 's' : '') + '</div>';
    for (const [file, syms] of Object.entries(byFile)) {
      html += '<div class="file-group"><div class="file-group-header">' + esc(shortPath(file)) +
        ' <span class="file-count">' + syms.length + '</span></div>' +
        syms.map(s =>
          '<div class="symbol-card validate-item" id="vcrd-' + esc(s.id) + '">' +
          '<div class="symbol-header">' +
          badge(s.type) + ' <span class="symbol-name">' + esc(s.name) + '</span>' +
          '<span class="line-num">:' + s.startLine + '</span>' +
          '<button class="suggest-btn" data-sym-name="' + esc(s.name) + '" data-sym-id="' + esc(s.id) + '" onclick="doSuggestLinks(this.dataset.symName,this.dataset.symId)">Suggest Links</button>' +
          '</div><div id="sugg-' + esc(s.id) + '"></div></div>'
        ).join('') + '</div>';
    }
    el.innerHTML = html;
  }

  /**
   * Auto-documented structural element.
   */
  async function doSuggestLinks(symbolName, symbolId) {
    const el = document.getElementById('sugg-' + symbolId);
    if (!el) return;
    if (el.dataset.loaded) { el.style.display = el.style.display === 'none' ? '' : 'none'; return; }
    el.innerHTML = loading('Searching…');
    const data = await api('/api/suggest-links?name=' + enc(symbolName));
    if (!data || !data.length) {
      el.innerHTML = '<div style="font-size:11px;color:var(--text2);padding:4px 0">No doc sections found mentioning "' + esc(symbolName) + '"</div>';
      el.dataset.loaded = '1';
      return;
    }
    el.innerHTML = '<div class="suggestion-list">' +
      data.map(s => {
        const docId = s.docSection?.id ?? '';
        const heading = s.docSection?.heading ?? '(unknown)';
        const filePath = s.docSection?.filePath ?? '';
        const linked = s.alreadyLinked;
        const btnId = 'lbtn-' + esc(docId) + '-' + esc(symbolName);
        return '<div class="suggestion-item">' +
          '<span class="suggestion-doc">' + esc(heading) + '</span>' +
          '<span class="suggestion-file">' + esc(shortPath(filePath)) + '</span>' +
          (linked
            ? '<span class="link-btn done" style="cursor:default">✓ Linked</span>'
            : '<button class="link-btn" id="' + btnId + '" data-doc-id="' + esc(docId) + '" data-sym-name="' + esc(symbolName) + '" onclick="doCreateLink(this.dataset.docId,this.dataset.symName,this)">Link</button>'
          ) +
        '</div>';
      }).join('') + '</div>';
    el.dataset.loaded = '1';
  }

  /**
   * Auto-documented structural element.
   */
  async function doCreateLink(docSectionId, symbolName, btn) {
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const r = await fetch('/api/create-doc-link?project=' + enc(currentProject), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docSectionId, symbolName }),
      });
      const data = await r.json();
      if (data.ok) {
        btn.textContent = '✓ Linked';
        btn.classList.add('done');
        if (data.markId) {
          const badge = document.createElement('span');
          badge.className = 'mark-badge';
          badge.textContent = '🔖 marked';
          btn.insertAdjacentElement('afterend', badge);
          loadMarksBanner();
        }
      } else { btn.textContent = '✗'; btn.disabled = false; btn.title = data.error || 'Failed'; }
    } catch (e) { btn.textContent = '✗'; btn.disabled = false; }
  }

  /**
   * Auto-documented structural element.
   */
  async function doUnlink(docSectionId, symbolId, btn) {
    if (!confirm('Unlink này sẽ xóa edge và tạo mark để AI agent biết cần cập nhật tài liệu. Tiếp tục?')) return;
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const r = await fetch('/api/unlink-doc?project=' + enc(currentProject), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docSectionId, symbolId }),
      });
      const data = await r.json();
      if (data.ok) {
        const row = btn.closest('.doc-card, .suggestion-item, .linked-sym-row');
        if (row) {
          row.style.opacity = '0.4';
          const badge = document.createElement('span');
          badge.className = 'mark-badge';
          badge.textContent = '🔖 unlinked';
          btn.replaceWith(badge);
        } else {
          btn.textContent = '✓ Unlinked';
        }
        loadMarksBanner();
      } else { btn.textContent = '✗'; btn.disabled = false; btn.title = data.error || 'Failed'; }
    } catch (e) { btn.textContent = '✗'; btn.disabled = false; }
  }

  /**
   * Auto-documented structural element.
   */
  async function loadMarksBanner() {
    const banner = document.getElementById('marks-banner');
    const text = document.getElementById('marks-banner-text');
    const list = document.getElementById('marks-list');
    try {
      const r = await fetch('/api/doc-link-marks?project=' + enc(currentProject));
      const marks = await r.json();
      if (!marks.length) { banner.style.display = 'none'; return; }
      banner.style.display = '';
      text.textContent = marks.length + ' pending mark' + (marks.length > 1 ? 's' : '') + ' chờ AI agent xử lý';
      list.innerHTML = marks.map(m => {
        const actionClass = m.action === 'link' ? 'mark-action-link' : 'mark-action-unlink';
        const actionLabel = m.action === 'link' ? '+LINK' : '−UNLINK';
        const date = new Date(m.createdAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
        if (m.markType === 'doc_doc') {
          return '<div class="mark-row">' +
            '<span class="' + actionClass + '">' + actionLabel + '</span>' +
            '<span class="mark-doc" title="' + esc(m.docFilePath) + '">' + esc(m.docHeading) + '</span>' +
            '<span style="color:var(--text2);font-size:10px">→</span>' +
            '<span class="mark-doc" title="' + esc(m.targetDocFilePath) + '">' + esc(m.targetDocHeading) + '</span>' +
            '<span class="mark-file">' + esc(shortPath(m.targetDocFilePath)) + '#' + esc(m.targetDocSlug || '') + '</span>' +
            '<span style="color:var(--text2);font-size:10px;margin-left:6px"><code>' + esc(m.annotationText || m.wikiAnnotationText) + '</code></span>' +
            '<span style="color:var(--text2);font-size:10px;margin-left:4px">' + esc(date) + '</span>' +
            '<button class="btn-secondary" style="padding:1px 7px;font-size:10px;margin-left:4px" data-mark-id="' + esc(m.id) + '" onclick="resolveMarkRow(this)">Resolve</button>' +
          '</div>';
        }
        return '<div class="mark-row">' +
          '<span class="' + actionClass + '">' + actionLabel + '</span>' +
          '<span class="mark-doc" title="' + esc(m.docFilePath) + '">' + esc(m.docHeading) + '</span>' +
          '<span style="color:var(--text2);font-size:10px">→</span>' +
          '<span class="mark-sym">@' + esc(m.symbolName) + '</span>' +
          '<span class="mark-file">' + esc(shortPath(m.symbolFilePath)) + '</span>' +
          '<span style="color:var(--text2);font-size:10px;margin-left:4px">' + esc(date) + '</span>' +
          '<button class="btn-secondary" style="padding:1px 7px;font-size:10px;margin-left:4px" ' +
            'data-mark-id="' + esc(m.id) + '" onclick="resolveMarkRow(this)">Resolve</button>' +
        '</div>';
      }).join('');
    } catch (e) { /* silent */ }
  }

  /**
   * Auto-documented structural element.
   */
  function toggleMarksPanel() {
    const panel = document.getElementById('marks-panel');
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
    if (panel.style.display !== 'none') loadMarksBanner();
  }

  /**
   * Auto-documented structural element.
   */
  async function resolveMarkRow(btn) {
    const markId = btn.dataset.markId;
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const r = await fetch('/api/doc-link-marks/' + enc(markId) + '/resolve?project=' + enc(currentProject), { method: 'PATCH' });
      const data = await r.json();
      if (data.resolved) { btn.closest('.mark-row').style.opacity = '0.4'; btn.textContent = '✓'; }
      else { btn.disabled = false; btn.textContent = 'Resolve'; }
      await loadMarksBanner();
    } catch (e) { btn.disabled = false; btn.textContent = 'Resolve'; }
  }

  document.getElementById('linked-docs-name').addEventListener('keydown', e => { if (e.key === 'Enter') doLinkedDocs(); });
  document.getElementById('docsync-name').addEventListener('keydown', e => { if (e.key === 'Enter') doDocSync(); });
  document.getElementById('manual-link-sym').addEventListener('keydown', e => { if (e.key === 'Enter') doManualLink(); });
  document.getElementById('manual-docref-doc').addEventListener('keydown', e => { if (e.key === 'Enter') validateDocRefMark(); });
  document.getElementById('manual-docref-ref').addEventListener('keydown', e => { if (e.key === 'Enter') validateDocRefMark(); });
  document.getElementById('manual-docref-doc').addEventListener('input', resetDocRefMarkState);
  document.getElementById('manual-docref-ref').addEventListener('input', resetDocRefMarkState);
  document.getElementById('doc-layers-query').addEventListener('keydown', e => { if (e.key === 'Enter') doDocLayers(); });
  let docsLinksMode = 'all';
  let pendingDocRefValidation = null;

  /**
   * Auto-documented structural element.
   */
  function computeRelativeDocRef(fromFile, toFile, slug) {
    if (!slug) return '';
    if (!fromFile || !toFile || fromFile === toFile) return '#'+ slug;
    const fromParts = String(fromFile).split('/').filter(Boolean);
    const toParts = String(toFile).split('/').filter(Boolean);
    fromParts.pop();
    let i = 0;
    while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
    const up = new Array(fromParts.length - i).fill('..');
    const down = toParts.slice(i);
    const rel = [...up, ...down].join('/');
    return rel + '#' + slug;
  }

  /**
   * Auto-documented structural element.
   */
  function copyLayerAnnotation(fromFile, toFile, slug, format, btn) {
    const target = computeRelativeDocRef(fromFile, toFile, slug);
    if (!target) return;
    const text = format === 'wiki' ? '[[doc:' + target + ']]' : '@doc:' + target;
    navigator.clipboard.writeText(text).then(() => {
      if (!btn) return;
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = prev; }, 900);
    }).catch(() => {});
  }

  /**
   * Auto-documented structural element.
   */
  function setDocsLinksMode(mode, btn) {
    docsLinksMode = mode || 'all';
    document.querySelectorAll('.links-filter-btn').forEach((el) => el.classList.toggle('active', el.dataset.linksMode === docsLinksMode));
    const codeWrap = document.getElementById('links-code-wrap');
    const layersWrap = document.getElementById('links-layers-wrap');
    const tableWrap = document.getElementById('links-table-wrap');
    const note = document.getElementById('links-mode-note');
    codeWrap.style.display = docsLinksMode === 'before' || docsLinksMode === 'after' ? 'none' : '';
    tableWrap.style.display = docsLinksMode === 'before' || docsLinksMode === 'after' ? 'none' : '';
    layersWrap.style.display = docsLinksMode === 'code' ? 'none' : '';
    if (note) {
      if (docsLinksMode === 'code') note.textContent = '`Doc→Code` tập trung vào bảng links và manual linking.';
      else if (docsLinksMode === 'before') note.textContent = '`Before` chỉ tập trung vào các tài liệu nền mà section hiện tại đang tham chiếu tới.';
      else if (docsLinksMode === 'after') note.textContent = '`After` chỉ tập trung vào các tài liệu đang trỏ ngược về section hiện tại.';
      else note.textContent = '`All` hiển thị cả doc→code và doc layers.';
    }
    if ((docsLinksMode === 'before' || docsLinksMode === 'after') && document.getElementById('doc-layers-query').value.trim()) {
      doDocLayers();
    }
  }

  // ── Links Manager ─────────────────────────────────────────────────────────
  function renderLayerDoc(doc, kind, sourceFilePath) {
    const docId = String(doc.id).replace(/'/g, "\\'");
    const src = String(sourceFilePath || '').replace(/'/g, "\\'");
    const target = String(doc.filePath || '').replace(/'/g, "\\'");
    const slug = String(doc.slug || '').replace(/'/g, "\\'");
    return '<div class="layer-doc">' +
      '<div class="layer-doc-main">' +
        '<div class="layer-doc-heading">' + esc(doc.heading) + '</div>' +
        '<div class="layer-doc-file">' + esc(shortPath(doc.filePath)) + '#' + esc(doc.slug || '') + '</div>' +
      '</div>' +
      '<div class="layer-actions">' +
        '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick="openDocLayers(' + "'" + docId + "'" + ')">' + esc(kind) + '</button>' +
        '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick="gotoDocFlow(' + "'" + 'doc:' + docId + "'" + ')">Trace Flow</button>' +
        '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick=\'copyLayerAnnotation("' + src + '","' + target + '","' + slug + '","at",this)\'>Copy @doc</button>' +
        '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick=\'copyLayerAnnotation("' + src + '","' + target + '","' + slug + '","wiki",this)\'>Copy [[doc]]</button>' +
      '</div>' +
    '</div>';
  }

  /**
   * Auto-documented structural element.
   */
  async function doDocLayers(query) {
    const raw = (query ?? document.getElementById('doc-layers-query').value).trim();
    const el = document.getElementById('doc-layers-results');
    if (!raw) {
      el.innerHTML = empty('Enter a doc section heading or ID to inspect doc layers.');
      return;
    }
    document.getElementById('doc-layers-query').value = raw;
    el.innerHTML = loading('Loading doc layers…');
    const data = await api('/api/doc-section?query=' + enc(raw));
    if (!data || !data.section) { el.innerHTML = errHTML('Doc section not found'); return; }

    const before = Array.isArray(data.beforeDocs) ? data.beforeDocs : [];
    const after = Array.isArray(data.afterDocs) ? data.afterDocs : [];
    const visibleBefore = docsLinksMode === 'after' ? [] : before;
    const visibleAfter = docsLinksMode === 'before' ? [] : after;
    const meta = '<div class="layer-meta">' +
      '<span>' + esc(data.section.id) + '</span>' +
      '<span>' + esc(shortPath(data.section.filePath)) + '#' + esc(data.section.slug || '') + '</span>' +
      '</div>';

    el.innerHTML =
      '<div class="symbol-card">' +
        '<div class="symbol-header"><span class="symbol-name">' + esc(data.section.heading) + '</span></div>' +
        meta +
        '<div class="layer-row">' +
          '<div class="layer-col">' +
            '<div class="layer-col-title">Before (' + visibleBefore.length + ')</div>' +
            (visibleBefore.length ? visibleBefore.map((doc) => renderLayerDoc(doc, 'Open', data.section.filePath)).join('') : '<div style="color:var(--text2);font-size:11px">' + (docsLinksMode === 'after' ? 'Hidden in After mode.' : 'No upstream docs.') + '</div>') +
          '</div>' +
          '<div class="layer-col">' +
            '<div class="layer-col-title">After (' + visibleAfter.length + ')</div>' +
            (visibleAfter.length ? visibleAfter.map((doc) => renderLayerDoc(doc, 'Open', data.section.filePath)).join('') : '<div style="color:var(--text2);font-size:11px">' + (docsLinksMode === 'before' ? 'Hidden in Before mode.' : 'No downstream docs.') + '</div>') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /**
   * Auto-documented structural element.
   */
  function openDocLayers(docSectionId) {
    doDocLayers(docSectionId);
  }

  function resetDocRefMarkState() {
    pendingDocRefValidation = null;
    const btn = document.getElementById('manual-docref-mark-btn');
    const preview = document.getElementById('manual-docref-preview');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Mark';
    }
    if (preview) preview.innerHTML = '';
  }

  function renderDocRefValidationPreview(data) {
    return '<div class="symbol-card">' +
      '<div class="symbol-header"><span class="symbol-name">Validated Doc Layer</span></div>' +
      '<div class="layer-row">' +
        '<div class="layer-col">' +
          '<div class="layer-col-title">Source PRD</div>' +
          '<div class="layer-doc"><div class="layer-doc-main"><div class="layer-doc-heading">' + esc(data.source.heading) + '</div><div class="layer-doc-file">' + esc(shortPath(data.source.filePath)) + '#' + esc(data.source.slug || '') + '</div></div></div>' +
        '</div>' +
        '<div class="layer-col">' +
          '<div class="layer-col-title">Target BRD</div>' +
          '<div class="layer-doc"><div class="layer-doc-main"><div class="layer-doc-heading">' + esc(data.target.heading) + '</div><div class="layer-doc-file">' + esc(shortPath(data.target.filePath)) + '#' + esc(data.target.slug || '') + '</div></div></div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text2);margin-top:8px">Will mark source doc to add <code>' + esc(data.annotationText) + '</code> or <code>' + esc(data.wikiAnnotationText) + '</code>.</div>' +
    '</div>';
  }

  async function validateDocRefMark() {
    const docSectionQuery = document.getElementById('manual-docref-doc').value.trim();
    const docRef = document.getElementById('manual-docref-ref').value.trim();
    const status = document.getElementById('manual-docref-status');
    const preview = document.getElementById('manual-docref-preview');
    const btn = document.getElementById('manual-docref-mark-btn');
    resetDocRefMarkState();
    if (!docSectionQuery || !docRef) {
      status.style.color = 'var(--red)';
      status.textContent = 'Cần điền cả PRD doc section và copied source.';
      return;
    }
    status.style.color = 'var(--text2)';
    status.textContent = 'Validating…';
    preview.innerHTML = '';
    try {
      const r = await fetch('/api/validate-doc-ref?project=' + enc(currentProject), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docSectionQuery, docRef }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) {
        status.style.color = 'var(--red)';
        status.textContent = data?.error || 'Doc ref validation failed.';
        return;
      }
      pendingDocRefValidation = data;
      btn.disabled = false;
      status.style.color = 'var(--green)';
      status.textContent = '✓ Valid: ' + data.source.heading + ' -> ' + data.target.heading;
      preview.innerHTML = renderDocRefValidationPreview(data);
    } catch (e) {
      status.style.color = 'var(--red)';
      status.textContent = 'Doc ref validation failed.';
    }
  }

  async function createDocRefMark() {
    const status = document.getElementById('manual-docref-status');
    const btn = document.getElementById('manual-docref-mark-btn');
    if (!pendingDocRefValidation?.source?.id) {
      status.style.color = 'var(--red)';
      status.textContent = 'Validate trước khi tạo mark.';
      return;
    }
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const r = await fetch('/api/create-doc-ref-mark?project=' + enc(currentProject), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docSectionId: pendingDocRefValidation.source.id,
          docRef: document.getElementById('manual-docref-ref').value.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) {
        btn.disabled = false;
        btn.textContent = 'Mark';
        status.style.color = 'var(--red)';
        status.textContent = data?.error || 'Failed to create doc layer mark.';
        return;
      }
      status.style.color = 'var(--green)';
      status.textContent = '✓ Marked: ' + data.source.heading + ' -> ' + data.target.heading;
      btn.textContent = '✓';
      loadMarksBanner();
      doDocLayers(data.source.id);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Mark';
      status.style.color = 'var(--red)';
      status.textContent = 'Failed to create doc layer mark.';
    }
  }

  async function loadAllLinks() {
    const el = document.getElementById('all-links-results');
    el.innerHTML = loading('Loading links…');
    const links = await api('/api/all-links');
    if (!links) { el.innerHTML = errHTML('Failed to load'); return; }
    if (!links.length) { el.innerHTML = empty('No doc→symbol links yet. Use "Suggest Links" in Coverage or add manually above.'); return; }

    // Group by doc file for readability
    const byFile = {};
    for (const l of links) {
      const k = l.docFilePath || '(unknown)';
      if (!byFile[k]) byFile[k] = [];
      byFile[k].push(l);
    }

    let html = '<table class="links-table"><thead><tr>' +
      '<th>Doc section</th><th>Symbol</th><th>Type</th><th></th>' +
      '</tr></thead><tbody>';
    for (const [file, rows] of Object.entries(byFile)) {
      html += '<tr><td colspan="4" style="padding:6px 8px 2px;color:var(--text2);font-size:10px;font-family:monospace;border-bottom:1px solid var(--border)">' + esc(shortPath(file)) + '</td></tr>';
      for (const l of rows) {
        html += '<tr>' +
          '<td><span style="color:var(--text)">' + esc(l.docHeading) + '</span>' +
            '<button class="btn-secondary" style="padding:1px 7px;font-size:10px;margin-left:6px" data-doc-id="' + esc(l.docSectionId) + '" onclick="openDocLayers(this.dataset.docId)">Layers</button></td>' +
          '<td><span style="font-family:monospace;color:var(--accent)">' + esc(l.symbolName) + '</span>' +
            '<span style="color:var(--text2);font-size:10px;margin-left:4px">' + esc(shortPath(l.symbolFilePath)) + '</span></td>' +
          '<td><span class="link-edge-type">' + esc(l.edgeType) + '</span>' +
            (l.isManual ? ' <span class="link-manual-badge">manual</span>' : '') + '</td>' +
          '<td><button class="unlink-btn" data-doc-id="' + esc(l.docSectionId) + '" data-sym-id="' + esc(l.symbolId) + '" onclick="doUnlinkFromTable(this)">Unlink</button></td>' +
          '</tr>';
      }
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  /**
   * Auto-documented structural element.
   */
  async function doUnlinkFromTable(btn) {
    const { docId, symId } = btn.dataset;
    await doUnlink(docId, symId, btn);
    // Reload the table after unlink
    const row = btn.closest('tr');
    if (row) row.style.opacity = '0.3';
    setTimeout(loadAllLinks, 600);
  }

  /**
   * Auto-documented structural element.
   */
  async function doManualLink() {
    const docInput = document.getElementById('manual-link-doc').value.trim();
    const symName = document.getElementById('manual-link-sym').value.trim();
    const status = document.getElementById('manual-link-status');
    if (!docInput || !symName) { status.style.color = 'var(--red)'; status.textContent = 'Cần điền cả doc section và symbol name.'; return; }

    // Try to find doc section by heading search
    status.style.color = 'var(--text2)'; status.textContent = 'Searching…';
    const suggestions = await api('/api/suggest-links?name=' + enc(symName));
    let docSectionId = null;
    if (suggestions && suggestions.length) {
      const match = suggestions.find(s => {
        const h = (s.docSection?.heading || '').toLowerCase();
        return h === docInput.toLowerCase() || h.includes(docInput.toLowerCase());
      });
      if (match) docSectionId = match.docSection?.id;
    }

    if (!docSectionId) {
      // Maybe user typed a raw ID
      docSectionId = docInput;
    }

    const r = await fetch('/api/create-doc-link?project=' + enc(currentProject), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docSectionId, symbolName: symName }),
    });
    const data = await r.json();
    if (data.ok) {
      status.style.color = 'var(--green)';
      status.textContent = '✓ Linked ' + symName + ' → mark created';
      document.getElementById('manual-link-doc').value = '';
      document.getElementById('manual-link-sym').value = '';
      loadAllLinks();
      loadMarksBanner();
    } else {
      status.style.color = 'var(--red)';
      status.textContent = data.error || 'Failed';
    }
  }

  // ── Forward Refs ──────────────────────────────────────────────────────────
  async function loadForwardRefs() {
    const el = document.getElementById('forward-refs-results');
    el.innerHTML = loading('Scanning docs for [[forward refs]]…');
    const [refs, symbols] = await Promise.all([
      api('/api/forward-refs'),
      api('/api/search?q='),  // get symbol index to check which names now exist
    ]);
    if (!refs) { el.innerHTML = errHTML('Failed to scan'); return; }
    if (!refs.length) {
      el.innerHTML = '<div class="success-box">No pending forward refs — all [[name]] patterns in docs are either linked or have matching symbols.</div>';
      return;
    }

    // Also do a quick check: for each unique symbolName, see if the symbol now exists
    const uniqueNames = [...new Set(refs.map(r => r.symbolName))];
    const existsMap = {};
    await Promise.all(uniqueNames.map(async (name) => {
      const result = await api('/api/symbol?name=' + enc(name));
      existsMap[name] = result && result.symbol;
    }));

    let html = '<div style="font-size:11px;color:var(--text2);margin-bottom:10px">' + refs.length + ' pending forward reference' + (refs.length > 1 ? 's' : '') + '</div>';
    for (const ref of refs) {
      const symExists = existsMap[ref.symbolName];
      const statusHtml = symExists
        ? '<span class="fref-status-ready">symbol found — ready</span>'
        : '<span class="fref-status-pending">pending — symbol not yet in graph</span>';
      const actionHtml = symExists
        ? '<button class="promote-btn" data-doc-id="' + esc(ref.docSectionId) + '" data-sym-name="' + esc(ref.symbolName) + '" onclick="doPromoteForwardRef(this)">Promote →</button>'
        : '';
      html += '<div class="fref-item">' +
        '<div class="fref-doc"><div class="fref-doc-heading">' + esc(ref.docHeading) + '</div>' +
          '<div class="fref-doc-file">' + esc(shortPath(ref.docFilePath)) + ':' + ref.docStartLine + '</div></div>' +
        '<span class="fref-sym">[[' + esc(ref.symbolName) + ']]</span>' +
        statusHtml + actionHtml +
        '</div>';
    }
    el.innerHTML = html;
  }

  /**
   * Auto-documented structural element.
   */
  async function doPromoteForwardRef(btn) {
    const { docId, symName } = btn.dataset;
    btn.disabled = true; btn.textContent = '…';
    const r = await fetch('/api/create-doc-link?project=' + enc(currentProject), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docSectionId: docId, symbolName: symName }),
    });
    const data = await r.json();
    if (data.ok) {
      btn.textContent = '✓ Linked';
      btn.closest('.fref-item').style.opacity = '0.4';
      const statusEl = btn.previousElementSibling;
      if (statusEl) { statusEl.className = 'fref-status-ready'; statusEl.textContent = 'linked'; }
      loadMarksBanner();
    } else {
      btn.textContent = '✗'; btn.disabled = false; btn.title = data.error || 'Failed';
    }
  }

  // ── Linked Docs ───────────────────────────────────────────────────────────
  async function doLinkedDocs() {
    const name = document.getElementById('linked-docs-name').value.trim();
    const el = document.getElementById('linked-docs-results');
    if (!name) return;
    el.innerHTML = loading();
    const data = await api('/api/symbol?name=' + enc(name));
    if (!data) { el.innerHTML = empty('Symbol "' + esc(name) + '" not found'); return; }
    if (!data.linkedDocs || !data.linkedDocs.length) {
      el.innerHTML = empty('No linked documentation found for "' + esc(name) + '"');
      return;
    }
    const symId = data.symbol?.id;
    const symName = data.symbol?.name || name;
    el.innerHTML = '<div class="section-title">Linked Docs (' + data.linkedDocs.length + ')</div>' +
      data.linkedDocs.map(d => linkedDocCard(d, symId, symName)).join('');
  }

  // ── Doc Sync ──────────────────────────────────────────────────────────────
  async function doDocSync() {
    const name = document.getElementById('docsync-name').value.trim();
    const el = document.getElementById('docsync-results');
    if (!name) return;
    el.innerHTML = loading();
    const data = await api('/api/docsync?name=' + enc(name));
    if (!data) { el.innerHTML = empty('Symbol "' + esc(name) + '" not found'); return; }

    let html = '<div style="margin-bottom:12px">' + symbolCard(data.symbol, false) + '</div>';

    if (data.isSynced) {
      html += '<div class="success-box">Documentation is in sync.</div>';
    } else {
      html += '<div class="error-state">' +
        data.issues.map(i => esc(i)).join('<br>') +
        '</div>';
    }

    if (data.linkedDocs && data.linkedDocs.length) {
      html += '<div class="section-title" style="margin-top:16px">Linked Docs (' + data.linkedDocs.length + ')</div>' +
        data.linkedDocs.map(d => docCard(d, data.symbol?.name || name)).join('');
    }
    el.innerHTML = html;
  }

  // ── Validate Links ────────────────────────────────────────────────────────
  async function doValidateLinks() {
    const el = document.getElementById('validate-links-results');
    el.innerHTML = loading('Checking doc links…');
    const data = await api('/api/validate-links');
    if (!data) { el.innerHTML = errHTML('Check failed'); return; }

    let html = '<div class="vlinks-summary">' +
      data.totalLinks + ' total links · ' +
      (data.staleCount > 0
        ? '<span style="color:var(--red)">' + data.staleCount + ' stale</span>'
        : '<span style="color:var(--green)">0 stale — all good</span>') +
      '</div>';

    if (data.staleLinks && data.staleLinks.length) {
      html += data.staleLinks.map(s =>
        '<div class="vlinks-stale-item">' +
        '<div>' + esc(s.docSection?.heading ?? s.docSectionId) +
        ' → <span class="vlinks-stale-sym">' + esc(s.missingSymbolId) + '</span></div>' +
        '<div style="font-size:10px;color:var(--text2)">' + esc(shortPath(s.docSection?.filePath ?? '')) + '</div>' +
        '</div>'
      ).join('');
    }
    el.innerHTML = html;
  }
