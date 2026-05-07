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
let healthLoadedProject = '';

/**
 * Auto-documented structural element.
 */
async function loadProjects(selectId) {
  allProjects = await fetch('/api/projects').then(r => r.json()).catch(() => []);
  const sel = document.getElementById('project-select');

  if (!allProjects.length) {
    sel.innerHTML = '<option value="">Chưa có dự án, bấm + để thêm</option>';
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
      healthLoadedProject = '';
      resetMcpState();
      resetVdocsState();
      ['health-results', 'search-results', 'impact-results', 'flow-results', 'module-results', 'validate-results', 'all-links-results', 'forward-refs-results', 'linked-docs-results', 'docsync-results', 'validate-links-results', 'mcp-results']
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
  msg.innerHTML = loading('Đang thêm…');
  try {
    const r = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await r.json();
    if (!r.ok) { msg.innerHTML = errHTML(data.error || 'Thất bại'); return; }
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
function renderCodeSourcesList() {
  const el = document.getElementById('cfg-code-sources-list');
  if (!el) return;
  if (!_cfgCodeSources.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text2);padding:2px 0">Chưa có nguồn code, sẽ bỏ qua lập chỉ mục code.</div>'; return; }
  el.innerHTML = _cfgCodeSources.map((s, i) =>
    '<div class="doc-source-tag">' +
    '<span class="doc-source-path">' + esc(s.path) + '</span>' +
    (s.label ? '<span class="doc-source-label">' + esc(s.label) + '</span>' : '') +
    '<button class="doc-source-rm" onclick="editCodeSource(' + i + ')" title="Sửa" style="color:var(--accent)">✎</button>' +
    '<button class="doc-source-rm" onclick="removeCodeSource(' + i + ')" title="Xóa">×</button>' +
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
}

/**
 * Auto-documented structural element.
 */
function renderDocSourcesList() {
  const el = document.getElementById('cfg-doc-sources-list');
  if (!el) return;
  if (!_cfgDocSources.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text2);padding:2px 0">Chưa có nguồn tài liệu, sẽ bỏ qua lập chỉ mục tài liệu.</div>'; return; }
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
      '<button class="doc-source-rm" onclick="editDocSource(' + i + ')" title="Sửa" style="color:var(--accent)">✎</button>' +
      '<button class="doc-source-rm" onclick="removeDocSource(' + i + ')" title="Xóa">×</button>' +
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
  const visualDocs = {
    structureMode: document.getElementById('cfg-vdocs-structure').value,
    folderDepth: Number(document.getElementById('cfg-vdocs-depth').value || 2),
  };
  msg.innerHTML = loading('Saving…');
  try {
    const r = await fetch('/api/projects/' + currentProject, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, docSources: _cfgDocSources, codeSources: _cfgCodeSources, visualDocs }),
    });
    const data = await r.json();
    if (!r.ok) { msg.innerHTML = errHTML(data.error || 'Thất bại'); return; }
    msg.innerHTML = '<div class="success-box" style="margin-top:4px;padding:6px 10px">Đã lưu</div>';
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
  if (!confirm('Gỡ "' + (proj?.name ?? currentProject) + '" khỏi registry?')) return;
  try {
    const r = await fetch('/api/projects/' + currentProject, { method: 'DELETE' });
    if (!r.ok) { alert('Gỡ dự án thất bại'); return; }
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
    warnings.push('Chưa cấu hình nguồn code: sẽ bỏ qua lập chỉ mục code.');
  }
  if (includeDocs && (!Array.isArray(project.docSources) || project.docSources.length === 0)) {
    warnings.push('Chưa cấu hình nguồn tài liệu: sẽ bỏ qua lập chỉ mục tài liệu.');
  }
  return warnings;
}

/**
 * Auto-documented structural element.
 */
function formatIndexWarnings(projectName, warnings) {
  return projectName + '\n\n' + warnings.map(w => '• ' + w).join('\n');
}

function setIndexRunNote(text, tone) {
  const el = document.getElementById('index-run-note');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = tone === 'error'
    ? 'var(--red)'
    : tone === 'success'
      ? 'var(--green)'
      : 'var(--text2)';
}

function formatIndexSummary(summary) {
  const totalFiles = Number(summary.codeFiles || 0) + Number(summary.docFiles || 0);
  const skipped = Number(summary.skipped || 0);
  const parsed = Math.max(0, totalFiles - skipped);
  const elapsed = formatDuration(Number(summary.elapsedMs || 0));
  return `${String(summary.mode || 'full').toUpperCase()} · ${parsed}/${totalFiles} đã parse · ${skipped} bỏ qua · ${Number(summary.prunedFiles || 0)} đã prune · ${Number(summary.errors || 0)} lỗi · ${elapsed}`;
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
  setIndexRunNote('Indexing…', 'neutral');
  try {
    const r = await fetch('/api/index?project=' + currentProject + (delta ? '&delta=true' : ''), { method: 'POST' });
    const data = await r.json();
    if (!r.ok) {
      setIndexRunNote('Lập chỉ mục thất bại: ' + (data.error || 'Lỗi không rõ'), 'error');
      alert('Lập chỉ mục thất bại: ' + (data.error || 'Lỗi không rõ'));
      return;
    }
    document.getElementById('stat-nodes').textContent = data.nodes;
    document.getElementById('stat-edges').textContent = data.edges;
    document.getElementById('stat-clusters').textContent = data.clusters;
    await reloadGraph();
    setIndexRunNote(formatIndexSummary(data), data.errors ? 'error' : 'success');
  } catch (e) {
    setIndexRunNote('Lập chỉ mục thất bại: ' + String(e), 'error');
    alert(String(e));
  }
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
  setIndexRunNote('Indexing all projects…', 'neutral');
  try {
    const r = await fetch('/api/index-all' + (delta ? '?delta=true' : ''), { method: 'POST' });
    const data = await r.json();
    if (!r.ok) {
      setIndexRunNote('Lập chỉ mục toàn bộ thất bại: ' + (data.error || 'Lỗi không rõ'), 'error');
      alert('Lập chỉ mục toàn bộ thất bại: ' + (data.error || 'Lỗi không rõ'));
      return;
    }
    await reloadGraph();
    const total = Array.isArray(data) ? data.reduce((acc, item) => {
      const summary = item.summary || {};
      acc.projects += 1;
      acc.codeFiles += Number(summary.codeFiles || 0);
      acc.docFiles += Number(summary.docFiles || 0);
      acc.skipped += Number(summary.skipped || 0);
      acc.prunedFiles += Number(summary.prunedFiles || 0);
      acc.errors += Number(summary.errors || 0);
      acc.elapsedMs += Number(summary.elapsedMs || 0);
      return acc;
    }, { projects: 0, codeFiles: 0, docFiles: 0, skipped: 0, prunedFiles: 0, errors: 0, elapsedMs: 0, mode: delta ? 'delta' : 'full' }) : null;
    if (total) {
      setIndexRunNote(`${total.projects} dự án · ${formatIndexSummary(total)}`, total.errors ? 'error' : 'success');
    }
  } catch (e) {
    setIndexRunNote('Lập chỉ mục toàn bộ thất bại: ' + String(e), 'error');
    alert(String(e));
  }
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
  if (name === 'health' && healthLoadedProject !== currentProject) loadHealthDashboard();
  if (name === 'docs') {
    loadMarksBanner();
    switchDocsTab(currentDocsTab); // restore last active sub-tab
  }
  if (name === 'vdocs' && !vdocsData) loadDocGraph();
  if (name === 'mcp' && !mcpData) loadMcpConfig();
  if (name === 'rules') loadRuleSets();
  if (name === 'flow') {
    const flowResults = document.getElementById('flow-results');
    if (flowResults && !flowResults.innerHTML.trim()) {
      flowResults.innerHTML = empty('Nhập một entry point code hoặc heading của section tài liệu, rồi bấm `Truy dấu`.');
    }
  }
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

function formatRelativeAge(ms) {
  if (ms == null) return 'Not indexed yet';
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatTimestamp(ts) {
  if (!ts) return 'Not indexed yet';
  return new Date(ts).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return 'n/a';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.round((seconds % 60) * 10) / 10;
  return `${minutes}m ${remSeconds}s`;
}

function toneClassForPct(value, inverted) {
  const score = Number(value || 0);
  if (inverted) {
    if (score <= 15) return 'good';
    if (score <= 40) return 'warn';
    return 'bad';
  }
  if (score >= 85) return 'good';
  if (score >= 60) return 'warn';
  return 'bad';
}

async function loadHealthDashboard() {
  const el = document.getElementById('health-results');
  if (!el) return;
  el.innerHTML = loading('Building knowledge health snapshot…');
  const data = await api('/api/health-dashboard');
  if (!data) { el.innerHTML = errHTML('Tải dashboard sức khỏe thất bại'); return; }
  healthLoadedProject = currentProject;

  const coverageTone = toneClassForPct(data.coveragePct, false);
  const traceTone = toneClassForPct(data.traceCompletenessPct, false);
  const provenanceTone = toneClassForPct(data.provenanceConfidencePct, false);
  const driftTone = toneClassForPct(data.driftScore, true);

  const metrics = [
    { label: 'Coverage', value: `${data.coveragePct}%`, tone: coverageTone, meta: `${data.undocumentedSymbolCount} undocumented / ${data.documentableSymbolCount} documentable` },
    { label: 'Trace Completeness', value: `${data.traceCompletenessPct}%`, tone: traceTone, meta: `${data.tracedRequirementCount} traced / ${data.requirementCount} requirements` },
    { label: 'Provenance Confidence', value: `${data.provenanceConfidencePct}%`, tone: provenanceTone, meta: `${data.staleLinkCount} stale / ${data.totalLinks} doc links` },
    { label: 'Drift Score', value: `${data.driftScore}`, tone: driftTone, meta: '0 = healthier, 100 = driftier' },
    { label: 'Mark mồ côi', value: `${data.orphanedMarkCount}`, tone: data.orphanedMarkCount === 0 ? 'good' : 'warn', meta: `${data.unresolvedMarkCount} mark liên kết UI chưa xử lý` },
    { label: 'Độ mới dữ liệu', value: formatRelativeAge(data.freshnessAgeMs), tone: data.freshnessAgeMs != null && data.freshnessAgeMs < 86400000 ? 'good' : 'warn', meta: formatTimestamp(data.lastIndexedAt) },
    { label: 'Lần index gần nhất', value: (data.lastIndexMode || 'unknown').toUpperCase(), tone: 'good', meta: `${data.prunedFileCount || 0} file stale đã prune` },
  ];

  let html = '<div class="health-grid">' + metrics.map((metric) =>
    '<div class="health-card ' + metric.tone + '">' +
      '<div class="health-label">' + esc(metric.label) + '</div>' +
      '<div class="health-value">' + esc(metric.value) + '</div>' +
      '<div class="health-meta">' + esc(metric.meta) + '</div>' +
    '</div>'
  ).join('') + '</div>';

  html += '<div class="health-details">' +
    '<div class="health-detail-card">' +
      '<div class="section-title">Graph Footprint</div>' +
      '<div class="health-list">' +
        '<div><strong>' + data.symbolCount + '</strong> symbols</div>' +
        '<div><strong>' + data.edgeCount + '</strong> edges</div>' +
        '<div><strong>' + data.docSectionCount + '</strong> doc sections</div>' +
        '<div><strong>' + data.requirementCount + '</strong> requirements</div>' +
      '</div>' +
    '</div>' +
    '<div class="health-detail-card">' +
      '<div class="section-title">Operational Notes</div>' +
      '<div class="health-list">' +
        '<div>Làm mới tab này sau khi index để cập nhật độ phủ và độ lệch.</div>' +
        '<div>Coverage only counts Functions, Classes, and Methods without docstring or linked docs.</div>' +
        '<div>Trace completeness counts requirements with at least one `SATISFIES` code link.</div>' +
        '<div>Orphaned marks are unresolved UI marks whose target doc or symbol no longer exists.</div>' +
      '</div>' +
    '</div>' +
    '<div class="health-detail-card">' +
      '<div class="section-title">Tín hiệu độ mới</div>' +
      '<div class="health-list">' +
        '<div><strong>Last indexed at:</strong> ' + esc(formatTimestamp(data.lastIndexedAt)) + '</div>' +
        '<div><strong>Index mode:</strong> ' + esc((data.lastIndexMode || 'unknown').toUpperCase()) + '</div>' +
        '<div><strong>Pruned stale files:</strong> ' + esc(String(data.prunedFileCount || 0)) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="health-detail-card">' +
      '<div class="section-title">Lần chạy index gần nhất</div>' +
      '<div class="health-list">' +
        '<div><strong>Code files:</strong> ' + esc(String(data.lastIndexCodeFiles || 0)) + '</div>' +
        '<div><strong>Doc files:</strong> ' + esc(String(data.lastIndexDocFiles || 0)) + '</div>' +
        '<div><strong>Skipped:</strong> ' + esc(String(data.lastIndexSkipped || 0)) + '</div>' +
        '<div><strong>Errors:</strong> ' + esc(String(data.lastIndexErrors || 0)) + '</div>' +
        '<div><strong>Elapsed:</strong> ' + esc(formatDuration(data.lastIndexElapsedMs || 0)) + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  el.innerHTML = html;
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
    btn.textContent = 'Đã chép';
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
  const traceQuery = String(d.id || '').replace(/'/g, "\\'");
  return '<div class="doc-card">' +
    '<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">' +
    '<div><div class="doc-heading">' + esc(d.heading) + anchor + '</div>' +
    '<div class="doc-file">' + esc(shortPath(d.filePath)) + ':' + d.startLine + '</div></div>' +
    '<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end">' +
      '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick=\'gotoDocFlow("' + traceQuery + '")\'>Truy dấu luồng</button>' +
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
  const traceQuery = String(d.id || '').replace(/'/g, "\\'");
  const unlinkBtn = symbolId
    ? '<button class="unlink-btn" data-doc-id="' + esc(d.id) + '" data-sym-id="' + esc(symbolId) + '" onclick="doUnlink(this.dataset.docId,this.dataset.symId,this)">Unlink</button>'
    : '';
  return '<div class="doc-card" style="position:relative">' +
    '<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">' +
    '<div><div class="doc-heading">' + esc(d.heading) + anchor + '</div>' +
    '<div class="doc-file">' + esc(shortPath(d.filePath)) + ':' + d.startLine + '</div></div>' +
    '<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end">' +
      '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick=\'gotoDocFlow("' + traceQuery + '")\'>Truy dấu luồng</button>' +
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
  return '<div class="loading-state"><div class="spinner"></div><span>' + (msg || 'Đang tải…') + '</span></div>';
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
    '<div class="panel-row"><span class="pl">Loại</span><span class="pv">' + badge(attrs.nodeType) + '</span></div>' +
    '<div class="panel-row"><span class="pl">File</span><span class="pv pv-file">' + esc(shortPath(attrs.file)) + '</span></div>' +
    '<div class="panel-row"><span class="pl">Dòng</span><span class="pv">' + attrs.startLine + '–' + attrs.endLine + '</span></div>' +
    (attrs.cluster ? '<div class="panel-row"><span class="pl">Cụm</span><span class="pv">' + esc(attrs.cluster) + '</span></div>' : '') +
    (attrs.signature ? '<div class="panel-sig"><code>' + esc(attrs.signature) + '</code></div>' : '') +
    (attrs.docString ? '<div class="panel-doc">' + esc(attrs.docString.slice(0, 200)) + '</div>' : '') +
    '<div class="panel-actions">' +
    '<button class="btn-sm btn-blue" onclick="gotoImpact(\'' + esc(attrs.label) + '\')">⚑ Ảnh hưởng</button>' +
    '<button class="btn-sm btn-purple" onclick="gotoFlow(\'' + esc(attrs.label) + '\')">⟶ Luồng</button>' +
    '</div>' +
    '<div class="panel-section-title">Bên gọi <span id="callers-loading" style="font-weight:normal;text-transform:none">…</span></div>' +
    '<div id="panel-callers"></div>';

  document.getElementById('graph-panel').classList.add('open');

  api('/api/symbol?name=' + enc(attrs.label)).then(data => {
    const cl = document.getElementById('panel-callers');
    const ll = document.getElementById('callers-loading');
    if (!cl) return;
    if (!data) { if (ll) ll.textContent = ''; cl.innerHTML = empty('Không tìm thấy'); return; }

    if (ll) ll.textContent = '(' + data.callers.length + ')';
    cl.innerHTML = data.callers.length
      ? data.callers.slice(0, 6).map(c => '<div class="mini-card">' + badge(c.type) + ' ' + esc(c.name) + '</div>').join('')
      : '<div style="font-size:12px;color:var(--text2);padding:4px 0">Không có</div>';

    const pc = document.getElementById('panel-content');
    if (!pc) return;

    if (data.callees.length) {
      const sec = document.createElement('div');
      sec.innerHTML = '<div class="panel-section-title">Bên được gọi (' + data.callees.length + ')</div>' +
        data.callees.slice(0, 6).map(c => '<div class="mini-card">' + badge(c.type) + ' ' + esc(c.name) + '</div>').join('');
      pc.appendChild(sec);
    }

    if (data.linkedDocs && data.linkedDocs.length) {
      const sec = document.createElement('div');
      sec.innerHTML = '<div class="panel-section-title">Tài liệu (' + data.linkedDocs.length + ')</div>' +
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
  document.getElementById('flow-entry').placeholder = 'Heading tài liệu, từ khóa, hoặc ID của section...';
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
  body.innerHTML = '<div style="color:var(--text2);font-size:12px;padding:20px 0;text-align:center">Đang tải…</div>';
  overlay.style.display = 'flex';

  const data = await api('/api/symbol-by-id?id=' + enc(symId));
  if (!data || !data.symbol) {
    body.innerHTML = '<div style="color:var(--red);font-size:12px;padding:12px 0">Không tìm thấy symbol (có thể đã được index lại)</div>';
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
    html += '<div class="sym-popup-section"><div class="sym-popup-section-title">Bên gọi (' + data.callers.length + ')</div>';
    html += data.callers.slice(0, 8).map(c =>
      '<div class="sym-popup-caller">' + badge(c.type) + ' <span style="font-family:monospace">' + esc(c.name) + '</span><span class="sym-popup-file">' + esc(shortPath(c.filePath || '')) + '</span></div>'
    ).join('');
    if (data.callers.length > 8) html += '<div style="font-size:10px;color:var(--text2);padding:3px 0">…và thêm ' + (data.callers.length - 8) + '</div>';
    html += '</div>';
  }

  // Callees
  if (data.callees && data.callees.length) {
    html += '<div class="sym-popup-section"><div class="sym-popup-section-title">Lời gọi (' + data.callees.length + ')</div>';
    html += data.callees.slice(0, 8).map(c =>
      '<div class="sym-popup-caller">' + badge(c.type) + ' <span style="font-family:monospace">' + esc(c.name) + '</span><span class="sym-popup-file">' + esc(shortPath(c.filePath || '')) + '</span></div>'
    ).join('');
    if (data.callees.length > 8) html += '<div style="font-size:10px;color:var(--text2);padding:3px 0">…và thêm ' + (data.callees.length - 8) + '</div>';
    html += '</div>';
  }

  // Linked docs
  if (data.linkedDocs && data.linkedDocs.length) {
    html += '<div class="sym-popup-section"><div class="sym-popup-section-title">Tài liệu liên kết (' + data.linkedDocs.length + ')</div>';
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
