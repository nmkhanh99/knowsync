  // ── RuleSets ──────────────────────────────────────────────────────────────
  let rsAllSets = [];
  let rsSelected = null; // { ...ruleSet, rules, artifacts, links }
  // ── RuleSets new form state ───────────────────────────────────────────────
  let rsNewForm = false;

  /**
   * Auto-documented structural element.
   */
  function resetRuleSetsState() {
    rsAllSets = [];
    rsSelected = null;
    rsNewForm = false;
    const rsTree = document.getElementById('rs-tree');
    if (rsTree) rsTree.innerHTML = '';
    const rsPanel = document.getElementById('rs-panel');
    if (rsPanel) {
      rsPanel.style.display = 'none';
      rsPanel.innerHTML = '';
    }
    const rsWelcome = document.getElementById('rs-welcome');
    if (rsWelcome) rsWelcome.style.display = 'block';
  }

  /**
   * Auto-documented structural element.
   */
  async function fetchJsonWithError(path, options) {
    try {
      const hasProjectParam = /(?:\?|&)project=/.test(path);
      const sep = path.includes('?') ? '&' : '?';
      const url = currentProject && !hasProjectParam ? `${path}${sep}project=${currentProject}` : path;
      const r = await fetch(url, options);
      let data = null;
      try { data = await r.json(); } catch (_) {}
      if (!r.ok) {
        return { ok: false, error: data?.error || ('HTTP ' + r.status), data };
      }
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: String(e), data: null };
    }
  }

  /**
   * Auto-documented structural element.
   */
  async function loadRuleSets() {
    if (!currentProject) return;
    const el = document.getElementById('rs-tree');
    el.innerHTML = loading('Loading RuleSets…');
    const lang = document.getElementById('rs-lang-filter')?.value || '';
    const url = '/api/rule-sets' + (lang ? '?language=' + enc(lang) : '');
    const result = await fetchJsonWithError(url);
    if (!result.ok) {
      el.innerHTML = errHTML('RuleSets load failed: ' + esc(result.error));
      return;
    }
    rsAllSets = Array.isArray(result.data) ? result.data : (Array.isArray(result.data?.ruleSets) ? result.data.ruleSets : []);
    renderRsTree();
  }

  /**
   * Auto-documented structural element.
   */
  function renderRsTree() {
    const el = document.getElementById('rs-tree');
    if (!rsAllSets.length) {
      el.innerHTML = '<div class="rs-empty" style="padding:12px 8px">Chưa có RuleSet nào.<br>Nhấn <b>+ New</b> để tạo.</div>';
      return;
    }
    const globals = rsAllSets.filter(s => s.isGlobal);
    const projects = rsAllSets.filter(s => !s.isGlobal);

    let html = '';
    if (globals.length) {
      html += '<div class="rs-section-head">🌐 Global</div>';
      html += globals.map(s => rsTreeItem(s)).join('');
    }
    if (projects.length) {
      html += '<div class="rs-section-head" style="margin-top:8px">📁 Project</div>';
      // show parent-first, then children indented
      const roots = projects.filter(s => !s.parentId || !projects.find(p => p.id === s.parentId));
      const children = projects.filter(s => s.parentId && projects.find(p => p.id === s.parentId));
      html += roots.map(s => {
        const kids = children.filter(c => c.parentId === s.id);
        return rsTreeItem(s) + kids.map(c => rsTreeItem(c, true)).join('');
      }).join('');
      // children whose parent is global
      const globalChildren = projects.filter(s => s.parentId && globals.find(g => g.id === s.parentId));
      html += globalChildren.map(s => rsTreeItem(s, true)).join('');
    }
    el.innerHTML = html;
  }

  /**
   * Auto-documented structural element.
   */
  function rsTreeItem(s, isChild = false) {
    const active = rsSelected && rsSelected.id === s.id;
    const icon = s.isGlobal ? '🌐' : (s.parentId ? '↳' : '📋');
    const ruleCount = (s.ruleCount ?? '?');
    return '<div class="rs-item' + (active ? ' active' : '') + (isChild ? ' rs-child' : '') + '" onclick="selectRuleSet(' + "'" + esc(s.id) + "'" + ')">' +
      '<span class="rs-item-icon">' + icon + '</span>' +
      '<span class="rs-item-name" title="' + esc(s.name) + '">' + esc(s.name) + '</span>' +
      '<span class="rs-item-lang">' + esc(s.language) + '</span>' +
    '</div>';
  }

  /**
   * Auto-documented structural element.
   */
  async function selectRuleSet(id) {
    const el = document.getElementById('rs-panel');
    const welcome = document.getElementById('rs-welcome');
    el.style.display = 'flex';
    welcome.style.display = 'none';
    el.innerHTML = loading('Loading…');
    rsNewForm = false;
    const result = await fetchJsonWithError('/api/rule-sets/' + enc(id));
    if (!result.ok) { el.innerHTML = errHTML('RuleSet detail failed: ' + esc(result.error)); return; }
    rsSelected = result.data;
    // re-mark active in tree
    document.querySelectorAll('.rs-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('onclick')?.includes(id));
    });
    renderRsPanel();
  }

  /**
   * Auto-documented structural element.
   */
  function renderRsPanel() {
    const el = document.getElementById('rs-panel');
    if (!rsSelected) return;
    const s = rsSelected;
    const rules = s.rules || [];
    const artifacts = s.artifacts || [];
    const links = s.links || [];

    // Find parent and children in tree
    const parent = rsAllSets.find(x => x.id === s.parentId);
    const children = rsAllSets.filter(x => x.parentId === s.id);

    // Build inheritance chain HTML
    let chainHtml = '';
    if (parent) {
      chainHtml = '<div class="rs-chain">' +
        '<span class="rs-chain-item" onclick="selectRuleSet(\'' + esc(parent.id) + '\')">' + esc(parent.name) + '</span>' +
        '<span class="rs-chain-arrow">→</span>' +
        '<span class="rs-chain-item rs-chain-current">' + esc(s.name) + '</span>' +
      '</div>';
    } else {
      chainHtml = '<span class="rs-chain-item rs-chain-current">' + esc(s.name) + '</span><span style="font-size:11px;color:var(--text2);margin-left:6px">(no parent)</span>';
    }

    // Build links HTML
    const linksHtml = links.length
      ? links.map(l => {
          const other = rsAllSets.find(x => x.id === (l.sourceId === s.id ? l.targetId : l.sourceId));
          const dir = l.sourceId === s.id ? '→' : '←';
          return '<div class="rs-link-item">' +
            '<span class="rs-link-type rs-link-' + esc(l.linkType) + '">' + esc(l.linkType) + '</span>' +
            '<span style="color:var(--text2)">' + dir + '</span>' +
            '<span onclick="selectRuleSet(\'' + esc(other?.id || '') + '\')" style="cursor:pointer;color:var(--accent)">' + esc(other?.name || l.targetId) + '</span>' +
            '<button class="btn-danger" style="margin-left:auto;padding:1px 8px;font-size:10px;width:auto" onclick="doDeleteLink(\'' + esc(l.id) + '\')">✕</button>' +
          '</div>';
        }).join('')
      : '<div class="rs-empty">No dependency links.</div>';

    // Merge children
    const childrenHtml = children.length
      ? children.map(c => '<span class="rs-chain-item" onclick="selectRuleSet(\'' + esc(c.id) + '\')">' + esc(c.name) + '</span>').join('')
      : '<span class="rs-empty">None</span>';

    // Rules per type grouped
    const rulesByType = {};
    for (const r of rules) {
      if (!rulesByType[r.ruleType]) rulesByType[r.ruleType] = [];
      rulesByType[r.ruleType].push(r);
    }
    const artifactsByType = {};
    for (const a of artifacts) {
      if (!artifactsByType[a.artifactType]) artifactsByType[a.artifactType] = [];
      artifactsByType[a.artifactType].push(a);
    }
    const allTypes = [...Object.keys(rulesByType), ...Object.keys(artifactsByType).map(t => 'artifact:' + t)];
    const rulesHtml = allTypes.length
      ? allTypes.map(t => {
          const isArtifact = t.startsWith('artifact:');
          const type = isArtifact ? t.slice(9) : t;
          const items = isArtifact ? (artifactsByType[type] || []) : (rulesByType[t] || []);
          return '<div style="margin-bottom:12px">' +
            '<div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">' + esc(type) + (isArtifact ? ' (artifact)' : '') + ' <span style="color:var(--text2)">×' + items.length + '</span></div>' +
            items.map(r => renderRuleCard(r)).join('') +
          '</div>';
        }).join('')
      : '<div class="rs-empty">No rules in this RuleSet yet. Import rules và assign vào đây.</div>';

    el.innerHTML =
      '<div class="rs-panel-header">' +
        '<div class="rs-panel-title">' + esc(s.name) + '</div>' +
        '<div class="rs-panel-meta">' +
          '<span class="rs-badge rs-badge-lang">' + esc(s.language) + '</span>' +
          (s.isGlobal ? '<span class="rs-badge rs-badge-global">Global</span>' : '<span class="rs-badge rs-badge-project">Project</span>') +
          '<span class="rs-badge rs-badge-version">v' + esc(s.version) + '</span>' +
          (s.grammarWasmUrl ? '<span class="rs-badge" style="background:rgba(63,185,80,.1);color:var(--green)">WASM ✓</span>' : '') +
        '</div>' +
        '<div class="rs-panel-actions">' +
          '<button class="btn-secondary" style="padding:4px 10px;font-size:11px" onclick="openEditRsForm()">✎ Edit</button>' +
          '<button class="btn-secondary" style="padding:4px 10px;font-size:11px" onclick="doForkRuleSet(\'' + esc(s.id) + '\')">⑂ Fork</button>' +
          '<button class="btn-secondary" style="padding:4px 10px;font-size:11px" onclick="openAddLinkForm(\'' + esc(s.id) + '\')">⬡ Add Link</button>' +
          '<button class="btn-secondary" style="padding:4px 10px;font-size:11px" onclick="openImportToSet(\'' + esc(s.id) + '\')">⬆ Import</button>' +
          '<button class="btn-danger" style="padding:4px 10px;font-size:11px;width:auto;margin-top:0" onclick="doDeleteRuleSet(\'' + esc(s.id) + '\')">Delete</button>' +
        '</div>' +
      '</div>' +
      '<div class="rs-panel-body">' +
        '<div class="rs-section">' +
          '<div class="rs-section-title">Inheritance Chain</div>' +
          chainHtml +
          (children.length ? '<div style="margin-top:6px;font-size:11px;color:var(--text2)">Children: ' + childrenHtml + '</div>' : '') +
        '</div>' +
        '<div class="rs-section">' +
          '<div class="rs-section-title">Description' +
            (s.description ? '' : ' <span style="font-size:10px;color:var(--text2)">(none)</span>') +
          '</div>' +
          (s.description ? '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + esc(s.description) + '</div>' : '') +
          (s.grammarWasmUrl ? '<div style="font-size:11px;color:var(--text2);margin-top:6px">Grammar WASM: <code>' + esc(s.grammarWasmUrl) + '</code></div>' : '') +
        '</div>' +
        '<div class="rs-section">' +
          '<div class="rs-section-title">Dependency Links <span style="font-size:10px">' + links.length + '</span></div>' +
          '<div class="rs-links-list">' + linksHtml + '</div>' +
        '</div>' +
        '<div class="rs-section">' +
          '<div class="rs-section-title" style="margin-bottom:10px">Rules <span style="font-size:10px">' + rules.length + ' rules · ' + artifacts.length + ' artifacts</span></div>' +
          '<div id="rs-rules-body">' + rulesHtml + '</div>' +
        '</div>' +
        '<div id="rs-import-inline" style="display:none">' +
          renderParseRulesImportSection([s.language]) +
        '</div>' +
      '</div>';
  }

  /**
   * Auto-documented structural element.
   */
  function openNewRuleSetForm() {
    const el = document.getElementById('rs-panel');
    const welcome = document.getElementById('rs-welcome');
    el.style.display = 'flex';
    welcome.style.display = 'none';
    rsSelected = null;
    document.querySelectorAll('.rs-item').forEach(i => i.classList.remove('active'));
    el.innerHTML =
      '<div class="rs-form" style="margin:20px">' +
        '<div class="rs-form-title">+ New RuleSet</div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Name</label><input id="rsf-name" class="rs-form-input" placeholder="My TypeScript Rules" /></div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Language</label>' +
          '<select id="rsf-lang" class="rs-form-input">' +
            '<option value="typescript">TypeScript</option>' +
            '<option value="javascript">JavaScript</option>' +
            '<option value="python">Python</option>' +
          '</select>' +
        '</div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Description</label><input id="rsf-desc" class="rs-form-input" placeholder="Optional description" /></div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Version</label><input id="rsf-ver" class="rs-form-input" value="1.0.0" /></div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Parent RuleSet (inherit from)</label>' +
          '<select id="rsf-parent" class="rs-form-input">' +
            '<option value="">— None —</option>' +
            rsAllSets.map(s => '<option value="' + esc(s.id) + '">' + esc(s.name) + ' (' + esc(s.language) + ')</option>').join('') +
          '</select>' +
        '</div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Grammar WASM URL</label><input id="rsf-wasm" class="rs-form-input" placeholder="https://… (optional)" /></div>' +
        '<div class="rs-form-row" style="flex-direction:row;align-items:center;gap:8px">' +
          '<input type="checkbox" id="rsf-global" /><label class="rs-form-label" for="rsf-global" style="text-transform:none;font-size:12px">Global (shared across all projects)</label>' +
        '</div>' +
        '<div id="rsf-msg"></div>' +
        '<div class="rs-form-actions">' +
          '<button class="btn-primary" style="padding:6px 16px;font-size:12px" onclick="doCreateRuleSet()">Create</button>' +
          '<button class="btn-secondary" style="padding:6px 12px;font-size:12px" onclick="cancelRsForm()">Cancel</button>' +
        '</div>' +
      '</div>';
  }

  /**
   * Auto-documented structural element.
   */
  function openEditRsForm() {
    if (!rsSelected) return;
    const s = rsSelected;
    const el = document.getElementById('rs-panel');
    el.innerHTML =
      '<div class="rs-form" style="margin:20px">' +
        '<div class="rs-form-title">✎ Edit: ' + esc(s.name) + '</div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Name</label><input id="rsf-name" class="rs-form-input" value="' + esc(s.name) + '" /></div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Description</label><input id="rsf-desc" class="rs-form-input" value="' + esc(s.description) + '" /></div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Version</label><input id="rsf-ver" class="rs-form-input" value="' + esc(s.version) + '" /></div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Parent RuleSet</label>' +
          '<select id="rsf-parent" class="rs-form-input">' +
            '<option value="">— None —</option>' +
            rsAllSets.filter(x => x.id !== s.id).map(x => '<option value="' + esc(x.id) + '"' + (x.id === s.parentId ? ' selected' : '') + '>' + esc(x.name) + ' (' + esc(x.language) + ')</option>').join('') +
          '</select>' +
        '</div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Grammar WASM URL</label><input id="rsf-wasm" class="rs-form-input" value="' + esc(s.grammarWasmUrl) + '" /></div>' +
        '<div id="rsf-msg"></div>' +
        '<div class="rs-form-actions">' +
          '<button class="btn-primary" style="padding:6px 16px;font-size:12px" onclick="doUpdateRuleSet(\'' + esc(s.id) + '\')">Save</button>' +
          '<button class="btn-secondary" style="padding:6px 12px;font-size:12px" onclick="selectRuleSet(\'' + esc(s.id) + '\')">Cancel</button>' +
        '</div>' +
      '</div>';
  }

  /**
   * Auto-documented structural element.
   */
  function cancelRsForm() {
    if (rsSelected) { renderRsPanel(); } else {
      const el = document.getElementById('rs-panel');
      el.style.display = 'none';
      document.getElementById('rs-welcome').style.display = 'block';
    }
  }

  /**
   * Auto-documented structural element.
   */
  async function doCreateRuleSet() {
    const name = document.getElementById('rsf-name')?.value.trim();
    const language = document.getElementById('rsf-lang')?.value;
    const msg = document.getElementById('rsf-msg');
    if (!name) { msg.innerHTML = errHTML('Tên không được trống'); return; }
    msg.innerHTML = loading('Creating…');
    const r = await fetch('/api/rule-sets?project=' + enc(currentProject), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        language,
        description: document.getElementById('rsf-desc')?.value.trim() || '',
        version: document.getElementById('rsf-ver')?.value.trim() || '1.0.0',
        parentId: document.getElementById('rsf-parent')?.value || null,
        grammarWasmUrl: document.getElementById('rsf-wasm')?.value.trim() || '',
        isGlobal: document.getElementById('rsf-global')?.checked || false,
      }),
    });
    const data = await r.json();
    if (!r.ok) { msg.innerHTML = errHTML(data.error || 'Failed'); return; }
    await loadRuleSets();
    await selectRuleSet(data.id);
  }

  /**
   * Auto-documented structural element.
   */
  async function doUpdateRuleSet(id) {
    const msg = document.getElementById('rsf-msg');
    msg.innerHTML = loading('Saving…');
    const r = await fetch('/api/rule-sets/' + enc(id) + '?project=' + enc(currentProject), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('rsf-name')?.value.trim(),
        description: document.getElementById('rsf-desc')?.value.trim() || '',
        version: document.getElementById('rsf-ver')?.value.trim() || '1.0.0',
        parentId: document.getElementById('rsf-parent')?.value || null,
        grammarWasmUrl: document.getElementById('rsf-wasm')?.value.trim() || '',
      }),
    });
    const data = await r.json();
    if (!r.ok) { msg.innerHTML = errHTML(data.error || 'Failed'); return; }
    await loadRuleSets();
    await selectRuleSet(id);
  }

  /**
   * Auto-documented structural element.
   */
  async function doDeleteRuleSet(id) {
    if (!confirm('Xóa RuleSet này? Rules bên trong sẽ không bị xóa nhưng mất liên kết.')) return;
    const r = await fetch('/api/rule-sets/' + enc(id) + '?project=' + enc(currentProject), { method: 'DELETE' });
    if (!r.ok) { alert('Failed'); return; }
    rsSelected = null;
    const panel = document.getElementById('rs-panel');
    panel.style.display = 'none';
    document.getElementById('rs-welcome').style.display = 'block';
    await loadRuleSets();
  }

  /**
   * Auto-documented structural element.
   */
  async function doForkRuleSet(id) {
    const src = rsAllSets.find(s => s.id === id);
    const name = prompt('Tên RuleSet mới (fork):', (src?.name || 'Fork') + ' (Copy)');
    if (!name) return;
    const r = await fetch('/api/rule-sets/' + enc(id) + '/fork?project=' + enc(currentProject), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Fork failed'); return; }
    await loadRuleSets();
    await selectRuleSet(data.id);
  }

  /**
   * Auto-documented structural element.
   */
  function openAddLinkForm(sourceId) {
    const el = document.getElementById('rs-panel');
    el.innerHTML =
      '<div class="rs-form" style="margin:20px">' +
        '<div class="rs-form-title">⬡ Add Dependency Link</div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Source RuleSet</label>' +
          '<select id="rsl-source" class="rs-form-input">' +
            rsAllSets.map(s => '<option value="' + esc(s.id) + '"' + (s.id === sourceId ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Link Type</label>' +
          '<select id="rsl-type" class="rs-form-input">' +
            '<option value="inherit">inherit — áp dụng rules của target trước, source override</option>' +
            '<option value="override">override — source hoàn toàn thay thế target</option>' +
            '<option value="inject">inject — inject rules của target vào source</option>' +
          '</select>' +
        '</div>' +
        '<div class="rs-form-row"><label class="rs-form-label">Target RuleSet</label>' +
          '<select id="rsl-target" class="rs-form-input">' +
            rsAllSets.filter(s => s.id !== sourceId).map(s => '<option value="' + esc(s.id) + '">' + esc(s.name) + ' (' + esc(s.language) + ')</option>').join('') +
          '</select>' +
        '</div>' +
        '<div id="rsl-msg"></div>' +
        '<div class="rs-form-actions">' +
          '<button class="btn-primary" style="padding:6px 16px;font-size:12px" onclick="doCreateLink()">Add Link</button>' +
          '<button class="btn-secondary" style="padding:6px 12px;font-size:12px" onclick="selectRuleSet(\'' + esc(sourceId) + '\')">Cancel</button>' +
        '</div>' +
      '</div>';
  }

  /**
   * Auto-documented structural element.
   */
  async function doCreateLink() {
    const msg = document.getElementById('rsl-msg');
    const sourceId = document.getElementById('rsl-source')?.value;
    const targetId = document.getElementById('rsl-target')?.value;
    const linkType = document.getElementById('rsl-type')?.value;
    if (sourceId === targetId) { msg.innerHTML = errHTML('Source và target không được giống nhau'); return; }
    msg.innerHTML = loading('Adding…');
    const r = await fetch('/api/rule-links?project=' + enc(currentProject), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId, targetId, linkType }),
    });
    const data = await r.json();
    if (!r.ok) { msg.innerHTML = errHTML(data.error || 'Failed'); return; }
    await selectRuleSet(sourceId);
  }

  /**
   * Auto-documented structural element.
   */
  async function doDeleteLink(linkId) {
    const r = await fetch('/api/rule-links/' + enc(linkId) + '?project=' + enc(currentProject), { method: 'DELETE' });
    if (!r.ok) { alert('Failed'); return; }
    if (rsSelected) await selectRuleSet(rsSelected.id);
  }

  /**
   * Auto-documented structural element.
   */
  function openImportToSet(ruleSetId) {
    const inline = document.getElementById('rs-import-inline');
    if (!inline) { alert('Reload panel first'); return; }
    inline.style.display = inline.style.display === 'none' ? 'block' : 'none';
    if (inline.style.display === 'block') {
      // patch doPrImport to also assign to this ruleset
      window._importTargetRuleSetId = ruleSetId;
    }
  }
