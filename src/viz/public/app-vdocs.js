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

  function clearVdocsUi() {
    document.getElementById('vdocs-container').innerHTML = '';
    document.getElementById('vdocs-empty').style.display = 'flex';
    document.getElementById('vdocs-stats').textContent = '';
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
    document.getElementById('vdocs-expand-code').parentElement.style.display = type === 'links' ? 'inline-flex' : 'none';
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
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text2);gap:8px"><div class="spinner"></div><span>Loading doc graph…</span></div>';
    const query = [];
    if (currentProject) query.push('project=' + currentProject);
    if (pattern) query.push('pattern=' + enc(pattern));
    query.push('includeAllCode=0');
    const sep = query.length ? '?' + query.join('&') : '';
    const data = await fetch('/api/doc-graph' + sep).then(r => r.json()).catch(() => null);
    if (!data || !data.nodes.length) {
      clearVdocsUi();
      return;
    }
    vdocsData = data;
    if (!vdocsSelectedId) {
      const firstDoc = (data.nodes || []).find(n => n.type === 'DocSection');
      vdocsSelectedId = firstDoc?.id || '';
    }
    await renderVdocs();
  }

  /**
   * Auto-documented structural element.
   */
  async function renderVdocs() {
    if (!vdocsData) return;
    if (vdocsTypeFilter === 'links') {
      await loadDocNeighborhood();
      renderLinksGraph(vdocsLinksData);
    } else {
      renderOutline(vdocsData);
    }
  }
  document.getElementById('vdocs-filter').addEventListener('keydown', e => { if (e.key === 'Enter') loadDocGraph(); });
  document.getElementById('vdocs-expand-code').parentElement.style.display = 'none';
