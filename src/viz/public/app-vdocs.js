  // ── Visual Docs tab ───────────────────────────────────────────────────────
  let vdocsRenderer = null;
  let vdocsData = null;
  let vdocsLinksData = null;
  let vdocsTypeFilter = 'outline';
  let vdocsSelectedId = '';
  let vdocsCollapsed = new Set();
  let _vdocsCfgSources = [];
  let vdocsNodeById = new Map(); // populated by renderOutline for use in renderVdocsPreview
  let vdocsChildMap = new Map();
  let vdocsParentById = new Map();
  let vdocsLinkScopeDocIds = [];
  let vdocsArchitecturePreview = null;

  function getVdocsExportViewLabel() {
    const value = document.getElementById('vdocs-export-view')?.value || 'component';
    return { context: 'Context', container: 'Container', component: 'Component', code: 'Code' }[value] || value;
  }

  function getVdocsArchitecturePreviewSignature() {
    const viewType = document.getElementById('vdocs-export-view')?.value || 'component';
    const includeCodeContext = !!document.getElementById('vdocs-expand-code')?.checked;
    return viewType + '|' + (includeCodeContext ? 'code' : 'docs');
  }

  function getVdocsArchitecturePreviewHtml(nodeId) {
    if (!nodeId) {
      return '<div class="vdocs-outline-empty">Chọn một section để xem sơ đồ Mermaid.</div>';
    }
    if (!vdocsArchitecturePreview || vdocsArchitecturePreview.nodeId !== nodeId) {
      return '<div class="vdocs-outline-empty">Bấm <strong>Xem Mermaid</strong> để dựng sơ đồ cho section này.</div>';
    }
    if (vdocsArchitecturePreview.signature !== getVdocsArchitecturePreviewSignature()) {
      return '<div class="vdocs-outline-empty">Mức sơ đồ đã đổi. Bấm <strong>Xem Mermaid</strong> để dựng lại theo mức mới.</div>';
    }
    return '<div class="mermaid">' + esc(vdocsArchitecturePreview.diagram || '') + '</div>';
  }

  function getVdocsArchitectureActionLabel(nodeId) {
    if (!nodeId) return 'Xem Mermaid';
    if (vdocsArchitecturePreview && vdocsArchitecturePreview.nodeId === nodeId) {
      return 'Làm mới Mermaid';
    }
    return 'Xem Mermaid';
  }

  function getActiveVdocsPreviewNodeId() {
    if (!vdocsSelectedId) return '';
    const node = vdocsNodeById.get(vdocsSelectedId);
    if (!node) return '';
    if (node.type === 'DocSection' || node.type === 'DocFile' || node.type === 'EmbeddedDocRegion') {
      return String(node.id);
    }
    return '';
  }

  function setVdocsToolbarNote(message) {
    const note = document.getElementById('vdocs-toolbar-note');
    if (note) note.textContent = message || '';
  }

  function updateVdocsToolbarUi() {
    const exportWrap = document.getElementById('vdocs-export-wrap');
    const expandWrap = document.getElementById('vdocs-expand-code-wrap');
    const expandCode = document.getElementById('vdocs-expand-code');
    if (exportWrap) exportWrap.style.display = 'inline-flex';
    if (expandWrap) expandWrap.style.display = vdocsTypeFilter === 'links' ? 'inline-flex' : 'none';
    if (vdocsTypeFilter === 'links') {
      setVdocsToolbarNote((expandCode?.checked ? 'Đang kèm thêm code context trong đồ thị Liên kết.' : 'Đang chỉ hiển thị tài liệu và liên kết gần nhất trong mode Liên kết.'));
    } else {
      setVdocsToolbarNote('Mức sơ đồ ' + getVdocsExportViewLabel() + ' áp dụng khi bấm Xem Mermaid ở panel bên phải.');
    }
  }

  function clearVdocsUi() {
    document.getElementById('vdocs-container').innerHTML = '';
    document.getElementById('vdocs-empty').style.display = 'flex';
    document.getElementById('vdocs-stats').textContent = '';
  }

  function setVdocsError(message) {
    const el = document.getElementById('vdocs-container');
    document.getElementById('vdocs-empty').style.display = 'none';
    if (vdocsRenderer) { vdocsRenderer.kill(); vdocsRenderer = null; }
    el.innerHTML = errHTML(message || 'Tải tài liệu trực quan thất bại');
    document.getElementById('vdocs-stats').textContent = 'lỗi';
  }

  function collectExportDocIds(nodeId) {
    const seen = new Set();
    const ids = [];
    const stack = [nodeId];
    while (stack.length) {
      const currentId = stack.pop();
      if (!currentId || seen.has(currentId)) continue;
      seen.add(currentId);
      const node = vdocsNodeById.get(currentId);
      if (node?.type === 'DocSection') ids.push(currentId);
      const children = vdocsChildMap.get(currentId) || [];
      for (const childId of children) stack.push(childId);
    }
    return ids;
  }

  async function previewArchitecture(nodeId, btn) {
    const node = vdocsNodeById.get(nodeId);
    if (!node) return;
    const docSectionIds = collectExportDocIds(nodeId);
    const focusDocId = node.type === 'DocSection' ? node.id : (docSectionIds[0] || '');
    if (!focusDocId) return;
    const previous = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      const params = new URLSearchParams();
      params.set('format', 'mermaid');
      params.set('viewType', document.getElementById('vdocs-export-view')?.value || 'component');
      params.set('focusDocId', focusDocId);
      if (docSectionIds.length) params.set('docSectionIds', docSectionIds.join(','));
      if (document.getElementById('vdocs-expand-code')?.checked) params.set('includeCodeContext', '1');
      if (currentProject) params.set('project', currentProject);
      const response = await fetch('/api/architecture-export?' + params.toString());
      const data = await response.json();
      if (!response.ok || !data?.diagram) throw new Error(data?.error || 'Dựng sơ đồ thất bại');
      vdocsArchitecturePreview = {
        nodeId,
        diagram: data.diagram,
        signature: getVdocsArchitecturePreviewSignature(),
      };
      const previewEl = document.getElementById('vdocs-arch-preview');
      if (previewEl) {
        previewEl.innerHTML = getVdocsArchitecturePreviewHtml(nodeId);
        requestAnimationFrame(() => renderMermaidIn(previewEl));
      }
      if (btn) btn.textContent = 'Đã dựng';
    } catch (err) {
      console.error(err);
      const previewEl = document.getElementById('vdocs-arch-preview');
      if (previewEl) {
        previewEl.innerHTML = errHTML(err instanceof Error ? err.message : 'Dựng sơ đồ thất bại');
      }
      if (btn) btn.textContent = 'Lỗi';
    } finally {
      if (btn) {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = previous || 'Xem Mermaid';
        }, 900);
      }
    }
  }

  async function rerenderArchitecturePreviewIfActive() {
    const nodeId = getActiveVdocsPreviewNodeId();
    if (!nodeId) return;
    if (!vdocsArchitecturePreview || vdocsArchitecturePreview.nodeId !== nodeId) return;
    await previewArchitecture(nodeId);
  }

  /**
   * Auto-documented structural element.
   */
  function resetVdocsState(options = {}) {
    const clearUi = options.clearUi !== false;
    vdocsData = null;
    vdocsLinksData = null;
    vdocsSelectedId = '';
    vdocsCollapsed = new Set();
    vdocsNodeById = new Map();
    vdocsChildMap = new Map();
    vdocsParentById = new Map();
    vdocsLinkScopeDocIds = [];
    if (vdocsRenderer) { vdocsRenderer.kill(); vdocsRenderer = null; }
    if (clearUi) clearVdocsUi();
  }

  /**
   * Auto-documented structural element.
   */
  function setVdocsType(type) {
    vdocsTypeFilter = type;
    document.querySelectorAll('[data-vtype]').forEach(p => {
      p.classList.toggle('active', p.dataset.vtype === type);
    });
    updateVdocsToolbarUi();
    if (vdocsData) renderVdocs();
  }

  /**
   * Auto-documented structural element.
   */
  async function loadDocGraph() {
    const pattern = document.getElementById('vdocs-filter').value.trim();
    const el = document.getElementById('vdocs-container');
    document.getElementById('vdocs-empty').style.display = 'none';
    if (vdocsRenderer) { vdocsRenderer.kill(); vdocsRenderer = null; }
    el.innerHTML = loading('Đang tải đồ thị tài liệu…');
    const query = [];
    if (currentProject) query.push('project=' + currentProject);
    if (pattern) query.push('pattern=' + enc(pattern));
    query.push('includeAllCode=0');
    const sep = query.length ? '?' + query.join('&') : '';
    let data = null;
    try {
      const response = await fetch('/api/doc-graph' + sep);
      data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || ('HTTP ' + response.status));
      if (!data || !Array.isArray(data.nodes)) throw new Error('Dữ liệu đồ thị tài liệu không hợp lệ');
    } catch (error) {
      console.error('loadDocGraph failed', error);
      setVdocsError(error instanceof Error ? error.message : 'Yêu cầu đồ thị tài liệu thất bại');
      return;
    }
    if (!data.nodes.length) {
      clearVdocsUi();
      return;
    }
    vdocsData = data;
    if (!vdocsSelectedId) {
      const firstDoc = (data.nodes || []).find(n => n.type === 'DocSection');
      vdocsSelectedId = firstDoc?.id || '';
    }
    try {
      await renderVdocs();
    } catch (error) {
      console.error('renderVdocs failed', error);
      setVdocsError(error instanceof Error ? error.message : 'Render tài liệu trực quan thất bại');
    }
  }

  /**
   * Auto-documented structural element.
   */
  async function renderVdocs() {
    if (!vdocsData) return;
    if (vdocsTypeFilter === 'links') {
      if (typeof window.loadDocNeighborhood !== 'function') {
        throw new Error('loadDocNeighborhood chưa sẵn sàng');
      }
      if (typeof window.renderLinksGraph !== 'function') {
        throw new Error('renderLinksGraph chưa sẵn sàng');
      }
      await window.loadDocNeighborhood();
      window.renderLinksGraph(vdocsLinksData);
    } else {
      if (typeof window.renderOutline !== 'function') {
        throw new Error('renderOutline chưa sẵn sàng');
      }
      window.renderOutline(vdocsData);
    }
  }
  document.getElementById('vdocs-filter').addEventListener('keydown', e => { if (e.key === 'Enter') loadDocGraph(); });
  document.getElementById('vdocs-export-view').addEventListener('change', async () => {
    updateVdocsToolbarUi();
    if (vdocsTypeFilter === 'outline' && vdocsData) {
      renderVdocs();
      await rerenderArchitecturePreviewIfActive();
    }
  });
  document.getElementById('vdocs-expand-code').addEventListener('change', async () => {
    updateVdocsToolbarUi();
    if (vdocsTypeFilter === 'links' && vdocsData) {
      await renderVdocs();
    } else if (vdocsTypeFilter === 'outline' && vdocsData) {
      renderVdocs();
      await rerenderArchitecturePreviewIfActive();
    }
  });
  updateVdocsToolbarUi();

  window.loadDocGraph = loadDocGraph;
  window.setVdocsType = setVdocsType;
  window.previewArchitecture = previewArchitecture;
  window.getVdocsExportViewLabel = getVdocsExportViewLabel;
  window.getVdocsArchitecturePreviewHtml = getVdocsArchitecturePreviewHtml;
  window.getVdocsArchitectureActionLabel = getVdocsArchitectureActionLabel;
