  // ── Visual Docs config panel ──────────────────────────────────────────────
  function toggleVdocsConfig() {
    const panel = document.getElementById('vdocs-config-panel');
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    document.getElementById('btn-vdocs-config').classList.toggle('active', !isOpen);
    if (!isOpen) vdocsCfgLoad();
  }

  /**
   * Auto-documented structural element.
   */
  function vdocsCfgLoad() {
    const proj = currentProjectEntry();
    const docSources = (vdocsData && vdocsData.docSources && vdocsData.docSources.length)
      ? vdocsData.docSources
      : (proj && proj.docSources ? proj.docSources : []);
    const vd = (vdocsData && vdocsData.visualDocsConfig) || (proj && proj.visualDocs) || {};
    _vdocsCfgSources = docSources.map(s => ({ ...s }));
    const mode = vd.structureMode || 'docSource';
    document.getElementById('vdocs-cfg-structure').value = mode;
    document.getElementById('vdocs-cfg-depth').value = String(vd.folderDepth || 2);
    document.getElementById('vdocs-cfg-depth-row').style.display = mode === 'folder' ? 'flex' : 'none';
    document.getElementById('vdocs-cfg-msg').innerHTML = '';
    document.getElementById('vdocs-cfg-scan-results').style.display = 'none';
    renderVdocsCfgSources();
  }

  let _vdocsCfgEditIdx = -1;  // -1 = add mode, >=0 = edit mode

  function renderVdocsCfgSources() {
    const el = document.getElementById('vdocs-cfg-sources-list');
    if (!_vdocsCfgSources.length) {
      el.innerHTML = '<div style="font-size:11px;color:var(--text2);padding:4px 0">Chưa có doc source. Nhấn "Scan project" hoặc thêm thủ công bên dưới.</div>';
      return;
    }
    const sorted = [..._vdocsCfgSources].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    el.innerHTML = sorted.map((s) => {
      const color = s.color || '#58a6ff';
      const excludeHtml = s.excludeFiles && s.excludeFiles.length
        ? '<span class="src-exclude" title="Exclude: ' + esc(s.excludeFiles.join(', ')) + '">✕ ' + esc(s.excludeFiles.join(', ')) + '</span>'
        : '';
      const idx = _vdocsCfgSources.indexOf(s);
      const isEditing = _vdocsCfgEditIdx === idx;
      return '<div class="vdocs-cfg-source-row" style="' + (isEditing ? 'border-color:var(--accent);' : '') + '">' +
        '<span class="src-color-dot" style="background:' + esc(color) + '"></span>' +
        '<span class="src-path">' + esc(s.path) + '</span>' +
        (s.label ? '<span class="src-label">' + esc(s.label) + '</span>' : '') +
        (s.order != null ? '<span class="src-order">#' + s.order + '</span>' : '') +
        excludeHtml +
        '<button class="btn-icon btn-icon-sm" onclick="vdocsCfgEditSource(' + idx + ')" title="Edit" style="' + (isEditing ? 'color:var(--accent)' : '') + '">✎</button>' +
        '<button class="btn-icon btn-icon-sm" style="color:var(--red)" onclick="vdocsCfgRemoveSource(' + idx + ')" title="Remove">×</button>' +
      '</div>';
    }).join('');
  }

  /**
   * Auto-documented structural element.
   */
  function vdocsCfgReadForm() {
    const path = document.getElementById('vdocs-cfg-ds-path').value.trim();
    const label = document.getElementById('vdocs-cfg-ds-label').value.trim();
    const color = document.getElementById('vdocs-cfg-ds-color').value.trim();
    const orderRaw = document.getElementById('vdocs-cfg-ds-order').value.trim();
    const excludeRaw = document.getElementById('vdocs-cfg-ds-exclude').value.trim();
    const order = orderRaw !== '' ? Number(orderRaw) : undefined;
    const excludeFiles = excludeRaw ? excludeRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    return {
      path,
      label: label || undefined,
      color: color || undefined,
      order: order != null && !isNaN(order) ? order : undefined,
      excludeFiles: excludeFiles?.length ? excludeFiles : undefined,
    };
  }

  /**
   * Auto-documented structural element.
   */
  function vdocsCfgClearForm() {
    document.getElementById('vdocs-cfg-ds-path').value = '';
    document.getElementById('vdocs-cfg-ds-label').value = '';
    document.getElementById('vdocs-cfg-ds-color').value = '';
    document.getElementById('vdocs-cfg-ds-color-picker').value = '#58a6ff';
    document.getElementById('vdocs-cfg-ds-order').value = '';
    document.getElementById('vdocs-cfg-ds-exclude').value = '';
  }

  /**
   * Auto-documented structural element.
   */
  function vdocsCfgSetAddMode() {
    _vdocsCfgEditIdx = -1;
    document.getElementById('vdocs-cfg-ds-form-title').textContent = 'ADD DOC SOURCE';
    document.getElementById('vdocs-cfg-ds-submit').textContent = '+ Add';
    document.getElementById('vdocs-cfg-ds-cancel').style.display = 'none';
    vdocsCfgClearForm();
    renderVdocsCfgSources();
  }

  /**
   * Auto-documented structural element.
   */
  function vdocsCfgSubmitSource() {
    const src = vdocsCfgReadForm();
    if (!src.path) {
      document.getElementById('vdocs-cfg-ds-path').focus();
      return;
    }
    if (_vdocsCfgEditIdx >= 0) {
      _vdocsCfgSources[_vdocsCfgEditIdx] = src;
    } else {
      _vdocsCfgSources.push(src);
    }
    vdocsCfgSetAddMode();
  }

  /**
   * Auto-documented structural element.
   */
  function vdocsCfgEditSource(i) {
    const s = _vdocsCfgSources[i];
    if (!s) return;
    _vdocsCfgEditIdx = i;
    document.getElementById('vdocs-cfg-ds-path').value = s.path || '';
    document.getElementById('vdocs-cfg-ds-label').value = s.label || '';
    document.getElementById('vdocs-cfg-ds-color').value = s.color || '';
    document.getElementById('vdocs-cfg-ds-color-picker').value = s.color || '#58a6ff';
    document.getElementById('vdocs-cfg-ds-order').value = s.order != null ? String(s.order) : '';
    document.getElementById('vdocs-cfg-ds-exclude').value = s.excludeFiles ? s.excludeFiles.join(', ') : '';
    document.getElementById('vdocs-cfg-ds-form-title').textContent = 'EDIT DOC SOURCE';
    document.getElementById('vdocs-cfg-ds-submit').textContent = '✓ Update';
    document.getElementById('vdocs-cfg-ds-cancel').style.display = '';
    document.getElementById('vdocs-cfg-ds-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    renderVdocsCfgSources();
  }

  /**
   * Auto-documented structural element.
   */
  function vdocsCfgCancelEdit() {
    vdocsCfgSetAddMode();
  }

  /**
   * Auto-documented structural element.
   */
  function vdocsCfgRemoveSource(i) {
    if (_vdocsCfgEditIdx === i) vdocsCfgSetAddMode();
    else if (_vdocsCfgEditIdx > i) _vdocsCfgEditIdx--;
    _vdocsCfgSources.splice(i, 1);
    renderVdocsCfgSources();
  }

  /**
   * Auto-documented structural element.
   */
  async function vdocsScanDocSources() {
    const btn = document.getElementById('btn-vdocs-scan');
    const scanEl = document.getElementById('vdocs-cfg-scan-results');
    btn.disabled = true;
    btn.textContent = 'Scanning…';
    scanEl.style.display = 'block';
    scanEl.innerHTML = loading('Scanning project…');
    try {
      const r = await fetch('/api/doc-sources/scan?project=' + enc(currentProject));
      const data = await r.json();
      if (!r.ok) { scanEl.innerHTML = errHTML(data.error || 'Scan failed'); return; }
      const discovered = data.discovered || [];
      if (!discovered.length) { scanEl.innerHTML = '<div style="font-size:11px;color:var(--text2)">No Markdown directories found.</div>'; return; }
      const existing = new Set(_vdocsCfgSources.map(s => s.path));
      scanEl.innerHTML = '<div style="font-size:10px;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Discovered directories — click to add</div>' +
        discovered.map(d => {
          const alreadyAdded = existing.has(d.path);
          return '<div class="vdocs-scan-item' + (alreadyAdded ? '" style="opacity:.5;cursor:default' : '" onclick="vdocsCfgAddFromScan(' + "'" + d.path.replace(/'/g, "\\'") + "'" + ')"') + '">' +
            '<span class="scan-path">' + esc(d.path) + '</span>' +
            '<span class="scan-cnt">' + d.mdFileCount + ' .md</span>' +
            '<span class="scan-files">' + esc(d.sampleFiles.slice(0,3).join(', ')) + (d.sampleFiles.length > 3 ? '…' : '') + '</span>' +
            (alreadyAdded ? '<span style="font-size:10px;color:var(--green)">✓ added</span>' : '<span style="font-size:10px;color:var(--accent)">+ Add</span>') +
          '</div>';
        }).join('');
    } catch (e) { scanEl.innerHTML = errHTML(String(e)); }
    finally { btn.disabled = false; btn.textContent = 'Scan project'; }
  }

  /**
   * Auto-documented structural element.
   */
  function vdocsCfgAddFromScan(path) {
    if (_vdocsCfgSources.some(s => s.path === path)) return;
    const parts = path.split('/').filter(Boolean);
    const label = parts[parts.length - 1] || path;
    _vdocsCfgSources.push({ path, label });
    renderVdocsCfgSources();
    document.querySelectorAll('.vdocs-scan-item').forEach(el => {
      const pathEl = el.querySelector('.scan-path');
      if (pathEl && pathEl.textContent === path) {
        el.style.opacity = '0.5';
        el.style.cursor = 'default';
        el.onclick = null;
        const addLabel = el.querySelector('span:last-child');
        if (addLabel) { addLabel.textContent = '✓ added'; addLabel.style.color = 'var(--green)'; }
      }
    });
  }

  /**
   * Auto-documented structural element.
   */
  async function vdocsCfgSave() {
    const msg = document.getElementById('vdocs-cfg-msg');
    const structureMode = document.getElementById('vdocs-cfg-structure').value;
    const folderDepth = Number(document.getElementById('vdocs-cfg-depth').value || 2);
    msg.innerHTML = loading('Saving…');
    try {
      const r = await fetch('/api/visual-docs-config?project=' + enc(currentProject), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docSources: _vdocsCfgSources,
          visualDocs: { structureMode, folderDepth },
        }),
      });
      const data = await r.json();
      if (!r.ok) { msg.innerHTML = errHTML(data.error || 'Save failed'); return; }
      msg.innerHTML = '<span style="color:var(--green);font-size:11px">✓ Saved</span>';
      resetVdocsState({ clearUi: false });
      await loadDocGraph();
    } catch (e) { msg.innerHTML = errHTML(String(e)); }
  }

  // Sync color picker ↔ hex text input in vdocs config panel
  document.getElementById('vdocs-cfg-ds-color-picker').addEventListener('input', function() {
    document.getElementById('vdocs-cfg-ds-color').value = this.value;
  });
  document.getElementById('vdocs-cfg-ds-color').addEventListener('input', function() {
    if (/^#[0-9a-fA-F]{6}$/.test(this.value)) {
      document.getElementById('vdocs-cfg-ds-color-picker').value = this.value;
    }
  });
