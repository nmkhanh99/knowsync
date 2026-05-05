// ── Constants ─────────────────────────────────────────────────────────────
const NODE_COLORS = {
  Function: '#60a5fa', Class: '#34d399', Method: '#f59e0b',
  Module: '#a78bfa', Interface: '#38bdf8', Type: '#e879f9',
  Variable: '#94a3b8', Export: '#fbbf24', DocSection: '#fb7185', Heading: '#fb7185', EmbeddedDocRegion: '#c084fc', DocFile: '#f97316',
};
const EDGE_COLORS = {
  CALLS: '#3b82f6', IMPORTS: '#8b5cf6', DOCUMENTED_BY: '#10b981',
  REFERENCES: '#f43f5e', REFERENCES_DOC: '#ec4899', EXPLAINS_FLOW: '#f59e0b',
  EXPORTS: '#6b7280', INHERITS: '#f97316', IMPLEMENTS: '#06b6d4',
  CONTAINS: '#c084fc',
};

// ── Project management ────────────────────────────────────────────────────
let currentProject = '';
let allProjects = [];
let projectListenerAdded = false;

/**
 * Auto-documented structural element.
 */
async function loadProjects(selectId) {
  allProjects = await fetch('/api/projects').then(r => r.json()).catch(() => []);
  const sel = document.getElementById('project-select');

  if (!allProjects.length) {
    sel.innerHTML = '<option value="">No projects — click + to add</option>';
    currentProject = '';
    return;
  }

  sel.innerHTML = allProjects.map(p =>
    `<option value="${p.id}">${p.name}${p.code ? ` [code: ${p.code}]` : ''} (${p.nodeCount} symbols)</option>`
  ).join('');

  const target = selectId && allProjects.find(p => p.id === selectId);
  currentProject = target ? selectId : allProjects[0].id;
  sel.value = currentProject;

  if (!projectListenerAdded) {
    sel.addEventListener('change', async () => {
      currentProject = sel.value;
      validateLoaded = false;
      resetMcpState();
      resetVdocsState();
      ['search-results', 'impact-results', 'flow-results', 'module-results', 'validate-results', 'all-links-results', 'forward-refs-results', 'linked-docs-results', 'docsync-results', 'validate-links-results', 'mcp-results']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
      resetParseRulesState();
      resetRuleSetsState();
      currentDocsTab = 'links';
      switchDocsTab('links');
      await reloadGraph();
    });
    projectListenerAdded = true;
  }
}

/**
 * Auto-documented structural element.
 */
function toggleAddProject() {
  const form = document.getElementById('add-project-form');
  const isOpen = form.style.display !== 'none';
  form.style.display = isOpen ? 'none' : 'flex';
  document.getElementById('btn-add-proj').classList.toggle('active', !isOpen);
  if (!isOpen) document.getElementById('add-project-name').focus();
}

/**
 * Auto-documented structural element.
 */
function cancelAddProject() {
  document.getElementById('add-project-form').style.display = 'none';
  document.getElementById('btn-add-proj').classList.remove('active');
  document.getElementById('add-project-name').value = '';
  document.getElementById('add-project-msg').innerHTML = '';
}

/**
 * Auto-documented structural element.
 */
async function doAddProject() {
  const name = document.getElementById('add-project-name').value.trim();
  const msg = document.getElementById('add-project-msg');
  if (!name) return;
  msg.innerHTML = loading('Adding…');
  try {
    const r = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await r.json();
    if (!r.ok) { msg.innerHTML = errHTML(data.error || 'Failed'); return; }
    cancelAddProject();
    await loadProjects(data.id);
    await reloadGraph();
    openProjectSettings();
  } catch (e) { msg.innerHTML = errHTML(String(e)); }
}

/**
 * Auto-documented structural element.
 */
async function browseFor(inputId) {
  try {
    const r = await fetch('/api/browse');
    const data = await r.json();
    if (data.path) document.getElementById(inputId).value = data.path;
  } catch (_) { }
}

document.getElementById('add-project-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') doAddProject();
  if (e.key === 'Escape') cancelAddProject();
});

/**
 * Auto-documented structural element.
 */
function openProjectSettings() {
  // close add-project form if open
  document.getElementById('add-project-form').style.display = 'none';
  document.getElementById('btn-add-proj').classList.remove('active');
  switchTab('settings');
  renderProjectConfig();
}

let _cfgDocSources = [];
let _cfgCodeSources = [];
let _cfgVisualDocs = { structureMode: 'docSource', folderDepth: 2 };
let _cfgDocSourceEditIdx = -1;
let _cfgCodeSourceEditIdx = -1;

/**
 * Auto-documented structural element.
 */
function deriveRootFromCodeSources(codeSources) {
  const abs = codeSources.map(s => s.path.trim()).filter(p => p.startsWith('/'));
  if (!abs.length) return null;
  const segs = abs.map(p => p.replace(/\/$/, '').split('/').filter(Boolean));
  let d = 0;
  while (d < Math.min(...segs.map(s => s.length)) && segs.every(s => s[d] === segs[0][d])) d++;
  const common = '/' + segs[0].slice(0, d).join('/');
  // Single source whose path equals common ancestor → go one level up
  if (abs.some(p => p.replace(/\/$/, '') === common)) {
    const up = segs[0].slice(0, Math.max(d - 1, 0));
    return up.length ? '/' + up.join('/') : '/';
  }
  return common || '/';
}

/**
 * Auto-documented structural element.
 */
function updateDerivedRoot() {
  const el = document.getElementById('cfg-derived-root');
  if (!el) return;
  const root = deriveRootFromCodeSources(_cfgCodeSources);
  el.textContent = root ? 'Root: ' + root : '';
}

/**
 * Auto-documented structural element.
 */
function renderCodeSourcesList() {
  const el = document.getElementById('cfg-code-sources-list');
  if (!el) return;
  if (!_cfgCodeSources.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text2);padding:2px 0">No code sources — code indexing will be skipped.</div>'; return; }
  el.innerHTML = _cfgCodeSources.map((s, i) =>
    '<div class="doc-source-tag">' +
    '<span class="doc-source-path">' + esc(s.path) + '</span>' +
    (s.label ? '<span class="doc-source-label">' + esc(s.label) + '</span>' : '') +
    '<button class="doc-source-rm" onclick="editCodeSource(' + i + ')" title="Edit" style="color:var(--accent)">✎</button>' +
    '<button class="doc-source-rm" onclick="removeCodeSource(' + i + ')" title="Remove">×</button>' +
    '</div>'
  ).join('');
}

/**
 * Auto-documented structural element.
 */
function resetCodeSourceForm() {
  _cfgCodeSourceEditIdx = -1;
  document.getElementById('cfg-cs-path').value = '';
  document.getElementById('cfg-cs-label').value = '';
  const submit = document.getElementById('cfg-cs-submit');
  const cancel = document.getElementById('cfg-cs-cancel');
  if (submit) submit.textContent = '+';
  if (cancel) cancel.style.display = 'none';
}

/**
 * Auto-documented structural element.
 */
function addCodeSource() {
  const path = document.getElementById('cfg-cs-path').value.trim();
  if (!path) return;
  const label = document.getElementById('cfg-cs-label').value.trim();
  const nextSource = { path, label: label || undefined };
  if (_cfgCodeSourceEditIdx >= 0) _cfgCodeSources[_cfgCodeSourceEditIdx] = nextSource;
  else _cfgCodeSources.push(nextSource);
  resetCodeSourceForm();
  renderCodeSourcesList();
  updateDerivedRoot();
}

/**
 * Auto-documented structural element.
 */
function editCodeSource(i) {
  const source = _cfgCodeSources[i];
  if (!source) return;
  _cfgCodeSourceEditIdx = i;
  document.getElementById('cfg-cs-path').value = source.path || '';
  document.getElementById('cfg-cs-label').value = source.label || '';
  const submit = document.getElementById('cfg-cs-submit');
  const cancel = document.getElementById('cfg-cs-cancel');
  if (submit) submit.textContent = '✓';
  if (cancel) cancel.style.display = '';
}

/**
 * Auto-documented structural element.
 */
function removeCodeSource(i) {
  if (_cfgCodeSourceEditIdx === i) resetCodeSourceForm();
  else if (_cfgCodeSourceEditIdx > i) _cfgCodeSourceEditIdx--;
  _cfgCodeSources.splice(i, 1);
  renderCodeSourcesList();
  updateDerivedRoot();
}

/**
 * Auto-documented structural element.
 */
function renderDocSourcesList() {
  const el = document.getElementById('cfg-doc-sources-list');
  if (!el) return;
  if (!_cfgDocSources.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text2);padding:2px 0">No doc sources — doc indexing will be skipped.</div>'; return; }
  el.innerHTML = _cfgDocSources.map((s, i) => {
    const colorDot = s.color ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + esc(s.color) + ';margin-right:3px;flex-shrink:0"></span>' : '';
    const orderBadge = s.order != null ? '<span class="doc-source-label" style="min-width:18px;text-align:center">' + esc(String(s.order)) + '</span>' : '';
    const excludeBadge = s.excludeFiles && s.excludeFiles.length
      ? '<span class="doc-source-label" style="color:#f59e0b;font-size:9px" title="Exclude: ' + esc(s.excludeFiles.join(', ')) + '">✕ ' + esc(s.excludeFiles.join(', ')) + '</span>'
      : '';
    return '<div class="doc-source-tag">' +
      colorDot +
      '<span class="doc-source-path">' + esc(s.path) + '</span>' +
      (s.label ? '<span class="doc-source-label">' + esc(s.label) + '</span>' : '') +
      orderBadge + excludeBadge +
      '<button class="doc-source-rm" onclick="editDocSource(' + i + ')" title="Edit" style="color:var(--accent)">✎</button>' +
      '<button class="doc-source-rm" onclick="removeDocSource(' + i + ')" title="Remove">×</button>' +
      '</div>';
  }).join('');
}

/**
 * Auto-documented structural element.
 */
function resetDocSourceForm() {
  _cfgDocSourceEditIdx = -1;
  document.getElementById('cfg-ds-path').value = '';
  document.getElementById('cfg-ds-label').value = '';
  document.getElementById('cfg-ds-exclude').value = '';
  document.getElementById('cfg-ds-order').value = '';
  document.getElementById('cfg-ds-color').value = '';
  const submit = document.getElementById('cfg-ds-submit');
  const cancel = document.getElementById('cfg-ds-cancel');
  if (submit) submit.textContent = '+';
  if (cancel) cancel.style.display = 'none';
}

/**
 * Auto-documented structural element.
 */
function addDocSource() {
  const path = document.getElementById('cfg-ds-path').value.trim();
  if (!path) return;
  const label = document.getElementById('cfg-ds-label').value.trim();
  const excludeRaw = document.getElementById('cfg-ds-exclude').value.trim();
  const orderRaw = document.getElementById('cfg-ds-order').value.trim();
  const color = document.getElementById('cfg-ds-color').value.trim();
  const excludeFiles = excludeRaw ? excludeRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const order = orderRaw !== '' ? Number(orderRaw) : undefined;
  const nextSource = {
    path,
    label: label || undefined,
    excludeFiles: excludeFiles?.length ? excludeFiles : undefined,
    order: order != null && !isNaN(order) ? order : undefined,
    color: color || undefined,
  };
  if (_cfgDocSourceEditIdx >= 0) _cfgDocSources[_cfgDocSourceEditIdx] = nextSource;
  else _cfgDocSources.push(nextSource);
  resetDocSourceForm();
  renderDocSourcesList();
}

/**
 * Auto-documented structural element.
 */
function editDocSource(i) {
  const source = _cfgDocSources[i];
  if (!source) return;
  _cfgDocSourceEditIdx = i;
  document.getElementById('cfg-ds-path').value = source.path || '';
  document.getElementById('cfg-ds-label').value = source.label || '';
  document.getElementById('cfg-ds-exclude').value = source.excludeFiles ? source.excludeFiles.join(', ') : '';
  document.getElementById('cfg-ds-order').value = source.order != null ? String(source.order) : '';
  document.getElementById('cfg-ds-color').value = source.color || '';
  const submit = document.getElementById('cfg-ds-submit');
  const cancel = document.getElementById('cfg-ds-cancel');
  if (submit) submit.textContent = '✓';
  if (cancel) cancel.style.display = '';
}

/**
 * Auto-documented structural element.
 */
function removeDocSource(i) {
  if (_cfgDocSourceEditIdx === i) resetDocSourceForm();
  else if (_cfgDocSourceEditIdx > i) _cfgDocSourceEditIdx--;
  _cfgDocSources.splice(i, 1);
  renderDocSourcesList();
}

/**
 * Auto-documented structural element.
 */
function renderProjectConfig() {
  const proj = allProjects.find(p => p.id === currentProject);
  if (!proj) return;
  document.getElementById('cfg-name').value = proj.name ?? '';
  document.getElementById('cfg-code').value = proj.code ?? '';
  _cfgDocSources = (proj.docSources ?? []).map(s => ({ ...s }));
  resetDocSourceForm();
  _cfgCodeSources = (proj.codeSources ?? []).map(s => ({ ...s }));
  resetCodeSourceForm();
  _cfgVisualDocs = normalizeVisualDocsConfig(proj.visualDocs);
  document.getElementById('cfg-vdocs-structure').value = _cfgVisualDocs.structureMode;
  document.getElementById('cfg-vdocs-depth').value = String(_cfgVisualDocs.folderDepth);
  document.getElementById('vdocs-depth-row').style.display = _cfgVisualDocs.structureMode === 'folder' ? '' : 'none';
  renderCodeSourcesList();
  updateDerivedRoot();
  renderDocSourcesList();
  document.getElementById('cfg-stats').textContent =
    (proj.nodeCount ?? 0) + ' nodes · ' + (proj.edgeCount ?? 0) + ' edges  ·  id: ' + proj.id;
  document.getElementById('cfg-msg').innerHTML = '';
}

/**
 * Auto-documented structural element.
 */
async function saveProjectConfig() {
  const msg = document.getElementById('cfg-msg');
  const name = document.getElementById('cfg-name').value.trim();
  const code = document.getElementById('cfg-code').value.trim();
  const rootPath = deriveRootFromCodeSources(_cfgCodeSources)
    || allProjects.find(p => p.id === currentProject)?.rootPath
    || '';
  const visualDocs = {
    structureMode: document.getElementById('cfg-vdocs-structure').value,
    folderDepth: Number(document.getElementById('cfg-vdocs-depth').value || 2),
  };
  msg.innerHTML = loading('Saving…');
  try {
    const r = await fetch('/api/projects/' + currentProject, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, rootPath, docSources: _cfgDocSources, codeSources: _cfgCodeSources, visualDocs }),
    });
    const data = await r.json();
    if (!r.ok) { msg.innerHTML = errHTML(data.error || 'Failed'); return; }
    msg.innerHTML = '<div class="success-box" style="margin-top:4px;padding:6px 10px">Saved</div>';
    await loadProjects(data.id);
    resetVdocsState({ clearUi: false });
    await reloadGraph();
  } catch (e) { msg.innerHTML = errHTML(String(e)); }
}

/**
 * Auto-documented structural element.
 */
async function doRemoveProject() {
  if (!currentProject) return;
  const proj = allProjects.find(p => p.id === currentProject);
  if (!confirm('Remove "' + (proj?.name ?? currentProject) + '" from registry?')) return;
  try {
    const r = await fetch('/api/projects/' + currentProject, { method: 'DELETE' });
    if (!r.ok) { alert('Failed to remove project'); return; }
    switchTab('graph');
    await loadProjects();
    await reloadGraph();
  } catch (e) { alert(String(e)); }
}

/**
 * Auto-documented structural element.
 */
function getIndexWarnings(project, includeDocs) {
  const warnings = [];
  if (!project) return ['No project selected.'];
  if (!Array.isArray(project.codeSources) || project.codeSources.length === 0) {
    warnings.push('No Code Sources configured: code indexing will be skipped.');
  }
  if (includeDocs && (!Array.isArray(project.docSources) || project.docSources.length === 0)) {
    warnings.push('No Doc Sources configured: doc indexing will be skipped.');
  }
  return warnings;
}

/**
 * Auto-documented structural element.
 */
function formatIndexWarnings(projectName, warnings) {
  return projectName + '\n\n' + warnings.map(w => '• ' + w).join('\n');
}

// ── Index ─────────────────────────────────────────────────────────────────
async function doIndex() {
  if (!currentProject) return;
  const btn = document.getElementById('btn-index');
  const delta = document.getElementById('index-delta').checked;
  const includeDocs = true;
  const project = currentProjectEntry();
  const warnings = getIndexWarnings(project, includeDocs);
  if (warnings.length && !confirm(formatIndexWarnings(project?.name || 'Current project', warnings) + '\n\nContinue indexing?')) {
    return;
  }
  btn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:1.5px;margin:0"></div> Indexing…';
  btn.disabled = true;
  try {
    const r = await fetch('/api/index?project=' + currentProject + (delta ? '&delta=true' : ''), { method: 'POST' });
    const data = await r.json();
    if (!r.ok) { alert('Index failed: ' + (data.error || 'Unknown error')); return; }
    document.getElementById('stat-nodes').textContent = data.nodes;
    document.getElementById('stat-edges').textContent = data.edges;
    document.getElementById('stat-clusters').textContent = data.clusters;
    await reloadGraph();
  } catch (e) { alert(String(e)); }
  finally { btn.innerHTML = '⟳ Index'; btn.disabled = false; }
}

/**
 * Auto-documented structural element.
 */
async function doIndexAll() {
  const btnIndex = document.getElementById('btn-index');
  const btnIndexAll = document.getElementById('btn-index-all');
  const delta = document.getElementById('index-delta').checked;
  const includeDocs = true;
  const warningBlocks = allProjects
    .map((project) => {
      const warnings = getIndexWarnings(project, includeDocs);
      return warnings.length ? formatIndexWarnings(project.name, warnings) : '';
    })
    .filter(Boolean);
  if (warningBlocks.length && !confirm(warningBlocks.join('\n\n') + '\n\nContinue indexing all projects?')) {
    return;
  }
  btnIndex.disabled = true;
  btnIndexAll.disabled = true;
  btnIndexAll.textContent = '…';
  try {
    const r = await fetch('/api/index-all' + (delta ? '?delta=true' : ''), { method: 'POST' });
    const data = await r.json();
    if (!r.ok) { alert('Index All failed: ' + (data.error || 'Unknown error')); return; }
    await reloadGraph();
  } catch (e) { alert(String(e)); }
  finally {
    btnIndex.disabled = false;
    btnIndexAll.disabled = false;
    btnIndexAll.textContent = 'All';
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────
let validateLoaded = false;
let sigmaRenderer = null;
let currentDocsTab = 'links';

/**
 * Auto-documented structural element.
 */
function switchDocsTab(name) {
  currentDocsTab = name;
  document.querySelectorAll('.docs-subtab').forEach(b => b.classList.toggle('active', b.dataset.docsTab === name));
  document.querySelectorAll('.docs-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('docs-panel-' + name).classList.add('active');
  // Lazy-load data for the activated panel
  if (name === 'links') loadAllLinks();
  else if (name === 'frefs') loadForwardRefs();
  else if (name === 'coverage' && !validateLoaded) doValidate();
  else if (name === 'stale') doValidateLinks();
}

/**
 * Auto-documented structural element.
 */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  const navBtn = document.querySelector('[data-tab="' + name + '"]');
  if (navBtn) navBtn.classList.add('active');
  if (name === 'docs') {
    loadMarksBanner();
    switchDocsTab(currentDocsTab); // restore last active sub-tab
  }
  if (name === 'vdocs' && !vdocsData) loadDocGraph();
  if (name === 'mcp' && !mcpData) loadMcpConfig();
  if (name === 'rules') loadRuleSets();
  if (name === 'graph' && sigmaRenderer) sigmaRenderer.refresh();
}

document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── API helper ────────────────────────────────────────────────────────────
async function api(path) {
  try {
    const hasProjectParam = /(?:\?|&)project=/.test(path);
    const sep = path.includes('?') ? '&' : '?';
    const url = currentProject && !hasProjectParam ? `${path}${sep}project=${currentProject}` : path;
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    console.error('API error', path, e);
    return null;
  }
}

// ── Rendering helpers ─────────────────────────────────────────────────────
function badge(type) {
  const c = NODE_COLORS[type] || '#94a3b8';
  return '<span class="badge" style="background:' + c + '22;color:' + c + '">' + esc(type) + '</span>';
}

/**
 * Auto-documented structural element.
 */
function symbolCard(s, showDoc) {
  return '<div class="symbol-card">' +
    '<div class="symbol-header">' + badge(s.type) + ' <span class="symbol-name">' + esc(s.name) + '</span></div>' +
    '<div class="symbol-file">' + esc(shortPath(s.filePath)) + ':' + s.startLine + '</div>' +
    (s.signature ? '<div class="symbol-sig"><code>' + esc(s.signature) + '</code></div>' : '') +
    (showDoc && s.docString ? '<div class="symbol-doc">' + esc(s.docString.slice(0, 140)) + '</div>' : '') +
    '</div>';
}

/**
 * Auto-documented structural element.
 */
function copySymbolAnnotation(symbolName, format, btn) {
  const clean = String(symbolName || '').trim();
  if (!clean) return;
  const text = format === 'wiki' ? '[[' + clean + ']]' : '@' + clean;
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
function renderSymbolCopyActions(symbolName) {
  const clean = String(symbolName || '').trim();
  if (!clean) return '';
  const safe = clean.replace(/'/g, "\\'");
  return '<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0">' +
    '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick=\'copySymbolAnnotation("' + safe + '","at",this)\'>Copy @symbol</button>' +
    '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick=\'copySymbolAnnotation("' + safe + '","wiki",this)\'>Copy [[Symbol]]</button>' +
    '</div>';
}

/**
 * Auto-documented structural element.
 */
function docCard(d, symbolName) {
  let preview = '';
  if (d.content) {
    const snippet = d.content.slice(0, 200);
    preview = (typeof marked !== 'undefined')
      ? '<div class="doc-content">' + marked.parse(snippet) + (d.content.length > 200 ? '<span style="color:var(--text2)">…</span>' : '') + '</div>'
      : '<div class="doc-content">' + esc(snippet) + (d.content.length > 200 ? '…' : '') + '</div>';
  }
  const anchor = d.slug ? ' <span style="font-family:monospace;font-size:10px;color:var(--text2)">#' + esc(d.slug) + '</span>' : '';
  const actions = renderSymbolCopyActions(symbolName);
  const traceQuery = ('doc:' + String(d.id || '')).replace(/'/g, "\\'");
  return '<div class="doc-card">' +
    '<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">' +
    '<div><div class="doc-heading">' + esc(d.heading) + anchor + '</div>' +
    '<div class="doc-file">' + esc(shortPath(d.filePath)) + ':' + d.startLine + '</div></div>' +
    '<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end">' +
      '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick=\'gotoDocFlow("' + traceQuery + '")\'>Trace Flow</button>' +
      actions +
    '</div>' +
    '</div>' +
    preview +
    '</div>';
}

/**
 * Auto-documented structural element.
 */
function linkedDocCard(d, symbolId, symbolName) {
  let preview = '';
  if (d.content) {
    const snippet = d.content.slice(0, 200);
    preview = (typeof marked !== 'undefined')
      ? '<div class="doc-content">' + marked.parse(snippet) + (d.content.length > 200 ? '<span style="color:var(--text2)">…</span>' : '') + '</div>'
      : '<div class="doc-content">' + esc(snippet) + (d.content.length > 200 ? '…' : '') + '</div>';
  }
  const anchor = d.slug ? ' <span style="font-family:monospace;font-size:10px;color:var(--text2)">#' + esc(d.slug) + '</span>' : '';
  const copyBtns = renderSymbolCopyActions(symbolName);
  const traceQuery = ('doc:' + String(d.id || '')).replace(/'/g, "\\'");
  const unlinkBtn = symbolId
    ? '<button class="unlink-btn" data-doc-id="' + esc(d.id) + '" data-sym-id="' + esc(symbolId) + '" onclick="doUnlink(this.dataset.docId,this.dataset.symId,this)">Unlink</button>'
    : '';
  return '<div class="doc-card" style="position:relative">' +
    '<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">' +
    '<div><div class="doc-heading">' + esc(d.heading) + anchor + '</div>' +
    '<div class="doc-file">' + esc(shortPath(d.filePath)) + ':' + d.startLine + '</div></div>' +
    '<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end">' +
      '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick=\'gotoDocFlow("' + traceQuery + '")\'>Trace Flow</button>' +
      copyBtns + unlinkBtn +
    '</div>' +
    '</div>' +
    preview +
    '</div>';
}

/**
 * Auto-documented structural element.
 */
function shortPath(p) {
  if (!p) return '';
  return p.split('/').slice(-3).join('/');
}

/**
 * Auto-documented structural element.
 */
function normalizeVisualDocsConfig(config) {
  const structureMode = config && typeof config === 'object' ? config.structureMode : '';
  return {
    structureMode: structureMode === 'file' || structureMode === 'folder' || structureMode === 'docSource' || structureMode === 'flat'
      ? structureMode
      : 'docSource',
    folderDepth: Math.max(1, Math.min(6, Number(config && config.folderDepth ? config.folderDepth : 2) || 2)),
  };
}

/**
 * Auto-documented structural element.
 */
function currentProjectEntry() {
  return allProjects.find(p => p.id === currentProject) || null;
}

/**
 * Auto-documented structural element.
 */
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Auto-documented structural element.
 */
function enc(s) { return encodeURIComponent(s); }

/**
 * Auto-documented structural element.
 */
function loading(msg) {
  return '<div class="loading-state"><div class="spinner"></div><span>' + (msg || 'Loading…') + '</span></div>';
}

/**
 * Auto-documented structural element.
 */
function empty(msg) { return '<div class="empty-state">' + esc(msg) + '</div>'; }
/**
 * Auto-documented structural element.
 */
function errHTML(msg) { return '<div class="error-state">' + esc(msg) + '</div>'; }

// ── Graph tab ─────────────────────────────────────────────────────────────
async function reloadGraph() {
  if (sigmaRenderer) { sigmaRenderer.kill(); sigmaRenderer = null; }
  document.getElementById('sigma-container').innerHTML = '';
  closePanel();
  document.getElementById('graph-search-input').value = '';
  await initGraph();
}

/**
 * Auto-documented structural element.
 */
async function initGraph() {
  const data = await api('/api/graph');
  if (!data) {
    document.getElementById('sigma-container').innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#7d8590;flex-direction:column;gap:8px">' +
      '<div style="font-size:32px">◈</div><div>No index data — run <code>knowsync index .</code> first</div></div>';
    return;
  }

  document.getElementById('stat-nodes').textContent = data.nodes.length;
  document.getElementById('stat-edges').textContent = data.edges.length;

  // Compute cluster count and degree
  const clusters = new Set(data.nodes.map(n => n.cluster).filter(Boolean));
  document.getElementById('stat-clusters').textContent = clusters.size;

  const degree = {};
  data.nodes.forEach(n => { degree[n.id] = 0; });
  data.edges.forEach(e => {
    degree[e.source] = (degree[e.source] || 0) + 1;
    degree[e.target] = (degree[e.target] || 0) + 1;
  });

  // Cluster-based positioning
  const clusterArr = [...clusters];
  const centerOf = {};
  clusterArr.forEach((c, i) => {
    const a = (i / clusterArr.length) * 2 * Math.PI;
    centerOf[c] = { x: Math.cos(a) * 22, y: Math.sin(a) * 22 };
  });

  // Build graphology graph
  const g = new graphology.Graph({ type: 'directed', multi: true });

  for (const n of data.nodes) {
    const center = centerOf[n.cluster] || { x: 0, y: 0 };
    const a = Math.random() * 2 * Math.PI;
    const r = 2 + Math.random() * 6;
    g.addNode(n.id, {
      label: n.label, x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a),
      size: 3 + Math.min((degree[n.id] || 0) / 2, 9),
      color: NODE_COLORS[n.type] || '#94a3b8',
      originalColor: NODE_COLORS[n.type] || '#94a3b8',
      nodeType: n.type, file: n.file, cluster: n.cluster,
      startLine: n.startLine, endLine: n.endLine,
      signature: n.signature, docString: n.docString,
    });
  }

  for (const e of data.edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      try {
        g.addEdge(e.source, e.target, {
          color: EDGE_COLORS[e.type] || '#30363d',
          size: 0.8,
          edgeType: e.type,
        });
      } catch (_) { }
    }
  }

  sigmaRenderer = new Sigma(g, document.getElementById('sigma-container'), {
    renderEdgeLabels: false,
    defaultEdgeColor: '#30363d',
    labelColor: { color: '#7d8590' },
    labelSize: 10,
    labelRenderedSizeThreshold: 5,
    allowInvalidContainer: true,
  });

  sigmaRenderer.on('clickNode', ({ node }) => {
    showGraphPanel(g.getNodeAttributes(node), g);
  });
  sigmaRenderer.on('clickStage', closePanel);

  // Search filter
  document.getElementById('graph-search-input').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    g.forEachNode((id, attrs) => {
      const match = !q || attrs.label.toLowerCase().includes(q);
      g.setNodeAttribute(id, 'color', match ? attrs.originalColor : '#21262d');
      g.setNodeAttribute(id, 'label', match ? attrs.label : '');
    });
    sigmaRenderer.refresh();
  });

  // Build legend
  buildLegend();
}

/**
 * Auto-documented structural element.
 */
function buildLegend() {
  const types = ['Function', 'Class', 'Method', 'Module', 'Interface', 'DocSection', 'EmbeddedDocRegion'];
  document.getElementById('graph-legend').innerHTML = types.map(t =>
    '<div class="legend-item"><div class="legend-dot" style="background:' + NODE_COLORS[t] + '"></div>' + t + '</div>'
  ).join('');
}

/**
 * Auto-documented structural element.
 */
function showGraphPanel(attrs, graph) {
  document.getElementById('panel-name').textContent = attrs.label;
  document.getElementById('panel-content').innerHTML =
    '<div class="panel-row"><span class="pl">Type</span><span class="pv">' + badge(attrs.nodeType) + '</span></div>' +
    '<div class="panel-row"><span class="pl">File</span><span class="pv pv-file">' + esc(shortPath(attrs.file)) + '</span></div>' +
    '<div class="panel-row"><span class="pl">Lines</span><span class="pv">' + attrs.startLine + '–' + attrs.endLine + '</span></div>' +
    (attrs.cluster ? '<div class="panel-row"><span class="pl">Cluster</span><span class="pv">' + esc(attrs.cluster) + '</span></div>' : '') +
    (attrs.signature ? '<div class="panel-sig"><code>' + esc(attrs.signature) + '</code></div>' : '') +
    (attrs.docString ? '<div class="panel-doc">' + esc(attrs.docString.slice(0, 200)) + '</div>' : '') +
    '<div class="panel-actions">' +
    '<button class="btn-sm btn-blue" onclick="gotoImpact(\'' + esc(attrs.label) + '\')">⚑ Impact</button>' +
    '<button class="btn-sm btn-purple" onclick="gotoFlow(\'' + esc(attrs.label) + '\')">⟶ Flow</button>' +
    '</div>' +
    '<div class="panel-section-title">Callers <span id="callers-loading" style="font-weight:normal;text-transform:none">…</span></div>' +
    '<div id="panel-callers"></div>';

  document.getElementById('graph-panel').classList.add('open');

  api('/api/symbol?name=' + enc(attrs.label)).then(data => {
    const cl = document.getElementById('panel-callers');
    const ll = document.getElementById('callers-loading');
    if (!cl) return;
    if (!data) { if (ll) ll.textContent = ''; cl.innerHTML = empty('Not found'); return; }

    if (ll) ll.textContent = '(' + data.callers.length + ')';
    cl.innerHTML = data.callers.length
      ? data.callers.slice(0, 6).map(c => '<div class="mini-card">' + badge(c.type) + ' ' + esc(c.name) + '</div>').join('')
      : '<div style="font-size:12px;color:var(--text2);padding:4px 0">None</div>';

    const pc = document.getElementById('panel-content');
    if (!pc) return;

    if (data.callees.length) {
      const sec = document.createElement('div');
      sec.innerHTML = '<div class="panel-section-title">Callees (' + data.callees.length + ')</div>' +
        data.callees.slice(0, 6).map(c => '<div class="mini-card">' + badge(c.type) + ' ' + esc(c.name) + '</div>').join('');
      pc.appendChild(sec);
    }

    if (data.linkedDocs && data.linkedDocs.length) {
      const sec = document.createElement('div');
      sec.innerHTML = '<div class="panel-section-title">Docs (' + data.linkedDocs.length + ')</div>' +
        data.linkedDocs.slice(0, 3).map(d =>
          '<div class="mini-card" style="flex-direction:column;align-items:flex-start;gap:2px">' +
          '<span style="font-weight:500;font-size:11px">' + esc(d.heading) + '</span>' +
          '<span style="font-size:10px;color:var(--text2);font-family:monospace">' + esc(shortPath(d.filePath)) + '</span>' +
          '</div>'
        ).join('');
      pc.appendChild(sec);
    }
  });
}

/**
 * Auto-documented structural element.
 */
function closePanel() {
  document.getElementById('graph-panel').classList.remove('open');
}

/**
 * Auto-documented structural element.
 */
function gotoImpact(name) {
  switchTab('impact');
  document.getElementById('impact-name').value = name;
  doImpact();
}

/**
 * Auto-documented structural element.
 */
function gotoFlow(name) {
  switchTab('flow');
  document.getElementById('flow-mode').value = 'code';
  document.getElementById('flow-entry').value = name;
  doFlow();
}

/**
 * Auto-documented structural element.
 */
function gotoDocFlow(docQuery) {
  const clean = String(docQuery || '').trim();
  if (!clean) return;
  switchTab('flow');
  document.getElementById('flow-mode').value = 'doc';
  document.getElementById('flow-entry').value = clean;
  document.getElementById('flow-entry').placeholder = 'Doc heading, keyword, hoặc doc:<id>...';
  doFlow();
}

// ── Mermaid init ──────────────────────────────────────────────────────────
function initMermaidRendering() {
  if (typeof mermaid === 'undefined') return;
  mermaid.initialize({ startOnLoad: false, theme: 'dark', themeVariables: { background: '#0d1117', primaryColor: '#1f6feb', edgeLabelBackground: '#161b22' } });
}

// ── Marked Mermaid renderer ───────────────────────────────────────────────
function initMarkedMermaidRenderer() {
  if (typeof marked === 'undefined') return;
  const origRenderer = new marked.Renderer();
  const mermaidRenderer = new marked.Renderer();
  mermaidRenderer.code = function (token) {
    const lang = (typeof token === 'object' ? token.lang : '') || '';
    const text = typeof token === 'object' ? (token.text || token.raw || '') : String(token);
    if (lang === 'mermaid') {
      return '<div class="mermaid">' + text + '</div>';
    }
    return origRenderer.code.call(this, token);
  };
  marked.use({ renderer: mermaidRenderer });
}

/**
 * Auto-documented structural element.
 */
function renderMermaidIn(containerEl) {
  if (typeof mermaid === 'undefined') return;
  const nodes = containerEl ? containerEl.querySelectorAll('.vdocs-content .mermaid') : document.querySelectorAll('.vdocs-content .mermaid');
  if (!nodes.length) return;
  // Remove already-rendered ones (have svg inside)
  const fresh = [...nodes].filter(n => !n.querySelector('svg'));
  if (fresh.length) mermaid.run({ nodes: fresh }).catch(() => { });
}

// ── Symbol popup ──────────────────────────────────────────────────────────
async function openSymPopup(symId, symName) {
  const overlay = document.getElementById('sym-popup-overlay');
  const body = document.getElementById('sym-popup-body');
  const title = document.getElementById('sym-popup-title');
  title.textContent = symName || symId;
  body.innerHTML = '<div style="color:var(--text2);font-size:12px;padding:20px 0;text-align:center">Loading…</div>';
  overlay.style.display = 'flex';

  const data = await api('/api/symbol-by-id?id=' + enc(symId));
  if (!data || !data.symbol) {
    body.innerHTML = '<div style="color:var(--red);font-size:12px;padding:12px 0">Symbol not found (may have been re-indexed)</div>';
    return;
  }
  const s = data.symbol;
  let html = '';

  // Meta row
  html += '<div class="sym-popup-section">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    badge(s.type) + ' <span style="font-family:monospace;color:var(--text)">' + esc(s.name) + '</span>' +
    '<span class="sym-popup-file">' + esc(shortPath(s.filePath || '')) + ':' + (s.startLine || '') + '</span>' +
    '</div>';
  if (s.signature) html += '<div class="sym-popup-sig">' + esc(s.signature) + '</div>';
  if (s.docString) html += '<div style="margin-top:8px;font-size:11px;color:var(--text2);line-height:1.5">' + esc(s.docString.slice(0, 300)) + (s.docString.length > 300 ? '…' : '') + '</div>';
  html += '</div>';

  // Callers
  if (data.callers && data.callers.length) {
    html += '<div class="sym-popup-section"><div class="sym-popup-section-title">Callers (' + data.callers.length + ')</div>';
    html += data.callers.slice(0, 8).map(c =>
      '<div class="sym-popup-caller">' + badge(c.type) + ' <span style="font-family:monospace">' + esc(c.name) + '</span><span class="sym-popup-file">' + esc(shortPath(c.filePath || '')) + '</span></div>'
    ).join('');
    if (data.callers.length > 8) html += '<div style="font-size:10px;color:var(--text2);padding:3px 0">…and ' + (data.callers.length - 8) + ' more</div>';
    html += '</div>';
  }

  // Callees
  if (data.callees && data.callees.length) {
    html += '<div class="sym-popup-section"><div class="sym-popup-section-title">Calls (' + data.callees.length + ')</div>';
    html += data.callees.slice(0, 8).map(c =>
      '<div class="sym-popup-caller">' + badge(c.type) + ' <span style="font-family:monospace">' + esc(c.name) + '</span><span class="sym-popup-file">' + esc(shortPath(c.filePath || '')) + '</span></div>'
    ).join('');
    if (data.callees.length > 8) html += '<div style="font-size:10px;color:var(--text2);padding:3px 0">…and ' + (data.callees.length - 8) + ' more</div>';
    html += '</div>';
  }

  // Linked docs
  if (data.linkedDocs && data.linkedDocs.length) {
    html += '<div class="sym-popup-section"><div class="sym-popup-section-title">Linked Docs (' + data.linkedDocs.length + ')</div>';
    html += data.linkedDocs.map(d =>
      '<div class="sym-popup-doc"><span style="color:var(--text)">' + esc(d.heading) + '</span>' +
      '<span class="sym-popup-file" style="margin-left:6px">' + esc(shortPath(d.filePath || '')) + ':' + (d.startLine || '') + '</span></div>'
    ).join('');
    html += '</div>';
  }

  body.innerHTML = html;
}

/**
 * Auto-documented structural element.
 */
function closeSymPopup() {
  document.getElementById('sym-popup-overlay').style.display = 'none';
}

// ── Init ──────────────────────────────────────────────────────────────────
initMermaidRendering();
initMarkedMermaidRenderer();
loadProjects().then(() => initGraph());
