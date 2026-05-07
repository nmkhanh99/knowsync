  /**
   * Auto-documented structural element.
   */
  function renderOutline(data) {
    const el = document.getElementById('vdocs-container');
    const stats = document.getElementById('vdocs-stats');
    const previousTree = el.querySelector('.vdocs-outline-tree');
    const previousTreeScrollTop = previousTree ? previousTree.scrollTop : 0;
    const previousTreeScrollLeft = previousTree ? previousTree.scrollLeft : 0;
    if (vdocsRenderer) { vdocsRenderer.kill(); vdocsRenderer = null; }
    el.innerHTML = '';

    const tree = buildEmbeddedDocRegionTree(data.embeddedDocRegions || []);
    const augmented = augmentDocNodes(data.nodes, tree.nodeMeta, tree.regionNodes);
    // Merge API-returned docSources/visualDocsConfig over registry entry so MCP-set config wins
    const baseProject = currentProjectEntry() || {};
    const effectiveProject = {
      ...baseProject,
      docSources: (data.docSources && data.docSources.length) ? data.docSources : (baseProject.docSources || []),
      visualDocs: data.visualDocsConfig || baseProject.visualDocs || null,
    };
    const structured = buildStructuredDocGraph(augmented, tree.edges, effectiveProject);
    const nodeById = new Map(structured.docNodes.map((node) => [node.id, node]));
    // Also index raw symbol nodes from vdocsData for use by renderVdocsPreview
    if (vdocsData && vdocsData.nodes) {
      for (const n of vdocsData.nodes) nodeById.set(n.id, nodeById.get(n.id) || n);
    }
    vdocsNodeById = nodeById;
    const childMap = new Map();
    const parentMap = new Map();
    for (const edge of structured.docEdges) {
      if (edge.type !== 'CONTAINS') continue;
      if (!childMap.has(edge.source)) childMap.set(edge.source, []);
      childMap.get(edge.source).push(edge.target);
      parentMap.set(edge.target, edge.source);
    }
    for (const ids of childMap.values()) {
      ids.sort((a, b) => {
        const na = nodeById.get(a);
        const nb = nodeById.get(b);
        return (na?.startLine || 0) - (nb?.startLine || 0) || String(na?.label || '').localeCompare(String(nb?.label || ''));
      });
    }
    vdocsChildMap = childMap;
    vdocsParentById = parentMap;
    const config = normalizeVisualDocsConfig(effectiveProject.visualDocs);
    let roots = [...(structured.docRoots?.keys?.() ? structured.docRoots.keys() : [])];
    if (config.structureMode === 'docSource') {
      const docSources = Array.isArray(effectiveProject.docSources) ? effectiveProject.docSources : [];
      const orderByLabel = {};
      for (const s of docSources) orderByLabel[s.label || s.path] = s.order ?? 999;
      roots.sort((a, b) => {
        const na = nodeById.get(a);
        const nb = nodeById.get(b);
        const oa = orderByLabel[na?.label] ?? 999;
        const ob = orderByLabel[nb?.label] ?? 999;
        return oa - ob || String(na?.label || '').localeCompare(String(nb?.label || ''));
      });
    }
    const treeHtml = roots.length
      ? '<ul class="vdocs-tree-list">' + roots.map((rootId) => renderOutlineTreeNode(rootId, childMap, nodeById)).join('') + '</ul>'
      : '<div class="vdocs-outline-empty">No doc structure found.</div>';
    const selectedNode = nodeById.get(vdocsSelectedId) || structured.docNodes.find((node) => node.type === 'DocSection') || structured.docNodes[0] || null;
    if (selectedNode) vdocsSelectedId = selectedNode.id;

    const docSourceBar = renderDocSourceBar(effectiveProject, config, structured);

    el.innerHTML =
      '<div class="vdocs-outline-wrap">' +
        '<div class="vdocs-outline-tree">' + docSourceBar + treeHtml + '</div>' +
        '<div class="vdocs-outline-preview">' + renderVdocsPreview(selectedNode) + '</div>' +
      '</div>';

    const nextTree = el.querySelector('.vdocs-outline-tree');
    if (nextTree) {
      nextTree.scrollTop = previousTreeScrollTop;
      nextTree.scrollLeft = previousTreeScrollLeft;
    }

    // Render mermaid diagrams in content area after DOM update
    requestAnimationFrame(() => renderMermaidIn(el));

    const docCount = structured.docNodes.filter((node) => node.type === 'DocSection').length;
    const groupCount = structured.docNodes.filter((node) => node.type === 'DocFile' && node.groupKind === 'docSource').length;
    const modeLabel = { docSource: 'by doc source', folder: 'by folder', file: 'by file', flat: 'flat' }[config.structureMode] || config.structureMode;
    stats.textContent = modeLabel + ' · ' + (groupCount || structured.docNodes.filter(n => n.type === 'DocFile').length) + ' nhóm · ' + docCount + ' section';
  }

  /**
   * Auto-documented structural element.
   */
  function renderDocSourceBar(project, config, structured) {
    if (config.structureMode !== 'docSource') {
      const modeLabel = { folder: 'By folder', file: 'By file', flat: 'Flat' }[config.structureMode] || config.structureMode;
      return '<div style="margin-bottom:10px;font-size:10px;color:var(--text2);display:flex;align-items:center;gap:6px">' +
        '<span class="vdocs-mode-badge">' + esc(modeLabel) + '</span>' +
      '</div>';
    }
    const docSources = (project && Array.isArray(project.docSources)) ? project.docSources : [];
    if (!docSources.length) return '';
    const sorted = [...docSources].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.label || '').localeCompare(b.label || ''));
    const groupNodes = (structured.docNodes || []).filter(n => n.type === 'DocFile' && n.groupKind === 'docSource');
    const countByLabel = {};
    for (const g of groupNodes) countByLabel[g.label] = (structured.docNodes || []).filter(n => n.type === 'DocSection' && (n.path || []).includes(g.label)).length;
    const chips = sorted.map(s => {
      const label = s.label || s.path;
      const color = s.color || '#58a6ff';
      const cnt = countByLabel[label] || '';
      return '<span class="vdocs-docsource-chip" onclick="scrollToDocSource(' + "'" + label.replace(/'/g, "\\'") + "'" + ')" title="Scroll to ' + esc(label) + '">' +
        '<span class="chip-dot" style="background:' + esc(color) + '"></span>' +
        esc(label) +
        (cnt ? '<span style="font-size:10px;color:var(--text2);margin-left:2px">' + cnt + '</span>' : '') +
      '</span>';
    }).join('');
    return '<div class="vdocs-docsource-bar">' + chips + '</div>';
  }

  /**
   * Auto-documented structural element.
   */
  function scrollToDocSource(label) {
    const tree = document.querySelector('.vdocs-outline-tree');
    if (!tree) return;
    const items = tree.querySelectorAll('.vdocs-group-item');
    for (const item of items) {
      const btn = item.querySelector('.vdocs-group-btn');
      if (btn && btn.textContent.trim().startsWith(label)) {
        item.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
  }

  /**
   * Auto-documented structural element.
   */
  function renderOutlineTreeNode(nodeId, childMap, nodeById) {
    const node = nodeById.get(nodeId);
    if (!node) return '';
    const childIds = childMap.get(nodeId) || [];
    const isCollapsed = vdocsCollapsed.has(nodeId);
    const children = isCollapsed ? '' : childIds.map((childId) => renderOutlineTreeNode(childId, childMap, nodeById)).join('');
    const isGroup = node.type === 'DocFile';
    const isDocSource = isGroup && node.groupKind === 'docSource';
    const color = node.docSetColor || null;

    if (isDocSource) {
      const colorStyle = color
        ? 'border-left:3px solid ' + color + ';padding-left:8px;margin-bottom:2px;'
        : 'border-left:3px solid var(--border);padding-left:8px;margin-bottom:2px;';
      const colorDot = color
        ? '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + esc(color) + ';margin-right:6px;flex-shrink:0;vertical-align:middle"></span>'
        : '';
      const countLabel = childIds.length ? '<span style="font-size:10px;color:var(--text2);margin-left:6px;font-weight:400">' + childIds.length + '</span>' : '';
      return '<li class="vdocs-tree-item vdocs-group-item" style="' + colorStyle + '">' +
        '<div class="vdocs-tree-row">' +
          '<button class="vdocs-tree-toggle' + (childIds.length ? '' : ' placeholder') + '" onclick="toggleVdocsFold(' + "'" + String(node.id).replace(/'/g, "\\'") + "'" + ')" title="' + (isCollapsed ? 'Unfold' : 'Fold') + '">' + (childIds.length ? (isCollapsed ? '▸' : '▾') : '•') + '</button>' +
          '<button class="vdocs-tree-btn vdocs-group-btn' + (node.id === vdocsSelectedId ? ' active' : '') + '" data-vdocs-node-id="' + esc(node.id) + '" onclick="selectVdocsNode(' + "'" + String(node.id).replace(/'/g, "\\'") + "'" + ')">' +
            '<div class="vdocs-group-header">' + colorDot + esc(node.label) + countLabel + '</div>' +
          '</button>' +
        '</div>' +
        (children ? '<ul class="vdocs-tree-list">' + children + '</ul>' : '') +
      '</li>';
    }

    const meta = node.type === 'DocSection'
      ? shortPath(node.file || '') + ':' + (node.startLine || 1)
      : node.groupKind || node.type;
    return '<li class="vdocs-tree-item' + (isGroup ? ' vdocs-group-item' : '') + '">' +
      '<div class="vdocs-tree-row">' +
        '<button class="vdocs-tree-toggle' + (childIds.length ? '' : ' placeholder') + '" onclick="toggleVdocsFold(' + "'" + String(node.id).replace(/'/g, "\\'") + "'" + ')" title="' + (isCollapsed ? 'Unfold' : 'Fold') + '">' + (childIds.length ? (isCollapsed ? '▸' : '▾') : '•') + '</button>' +
        '<button class="vdocs-tree-btn' + (isGroup ? ' vdocs-group-btn' : '') + (node.id === vdocsSelectedId ? ' active' : '') + '" data-vdocs-node-id="' + esc(node.id) + '" onclick="selectVdocsNode(' + "'" + String(node.id).replace(/'/g, "\\'") + "'" + ')">' +
          '<div' + (isGroup ? ' class="vdocs-group-header"' : '') + '>' + esc(vdocsDocLabel(node)) + '</div>' +
          (isGroup ? '' : '<div class="vdocs-tree-meta">' + esc(meta) + '</div>') +
        '</button>' +
      '</div>' +
      (children ? '<ul class="vdocs-tree-list">' + children + '</ul>' : '') +
    '</li>';
  }

  /**
   * Auto-documented structural element.
   */
  function computeVdocsRelativeDocRef(fromFile, toFile, slug) {
    if (!slug) return '';
    if (!fromFile || !toFile || fromFile === toFile) return '#' + slug;
    const fromParts = String(fromFile).split('/').filter(Boolean);
    const toParts = String(toFile).split('/').filter(Boolean);
    fromParts.pop();
    let i = 0;
    while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
    const up = new Array(fromParts.length - i).fill('..');
    const down = toParts.slice(i);
    return [...up, ...down].join('/') + '#' + slug;
  }

  /**
   * Auto-documented structural element.
   */
  function copyVdocsLayerAnnotation(fromFile, toFile, slug, format, btn) {
    const target = computeVdocsRelativeDocRef(fromFile, toFile, slug);
    if (!target) return;
    const text = format === 'wiki' ? '[[doc:' + target + ']]' : '@doc:' + target;
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
  function collectVdocsDescendantSections(nodeId) {
    const visited = new Set();
    const out = [];
    const walk = (id) => {
      if (!id || visited.has(id)) return;
      visited.add(id);
      const node = vdocsNodeById.get(id);
      if (node && node.type === 'DocSection') out.push(node);
      const childIds = vdocsChildMap.get(id) || [];
      for (const childId of childIds) walk(childId);
    };
    walk(nodeId);
    out.sort((a, b) =>
      String(a.file || '').localeCompare(String(b.file || '')) ||
      (a.startLine || 0) - (b.startLine || 0) ||
      String(a.label || '').localeCompare(String(b.label || ''))
    );
    return out;
  }

  /**
   * Auto-documented structural element.
   */
  function resolveVdocsScopeSections(nodeId) {
    const node = vdocsNodeById.get(nodeId);
    if (!node) return [];
    if (node.type === 'DocSection') {
      const descendants = collectVdocsDescendantSections(nodeId);
      return descendants.length ? descendants : [node];
    }

    const allSections = [...vdocsNodeById.values()]
      .filter((item) => item && item.type === 'DocSection');
    const hasPathPrefix = (section, prefix) => {
      const sectionPath = Array.isArray(section.path) ? section.path : [];
      if (!prefix.length || sectionPath.length < prefix.length) return false;
      return prefix.every((part, index) => sectionPath[index] === part);
    };
    const matchesSourceScope = (section, sourcePath, projectRoot, label) => {
      const normalizedFile = normalizeSlashes(String(section.file || ''));
      const relative = relativeDocPath(normalizedFile, projectRoot);
      const rawSource = normalizeSlashes(String(sourcePath || ''))
        .replace(/\/\*\*.*$/, '')
        .replace(/\*.*$/, '')
        .replace(/\/$/, '');
      const trimmedLabel = normalizeSlashes(String(label || '')).replace(/\/$/, '');
      const absoluteSource = rawSource.startsWith('/') || !projectRoot
        ? rawSource
        : normalizeSlashes(projectRoot).replace(/\/$/, '') + '/' + rawSource;
      const relativeChecks = [
        rawSource,
        trimmedLabel,
      ].filter(Boolean);
      const absoluteChecks = [absoluteSource].filter(Boolean);

      return relativeChecks.some((prefix) =>
        relative === prefix ||
        relative.startsWith(prefix + '/') ||
        relative.endsWith('/' + prefix) ||
        relative.includes('/' + prefix + '/')
      ) || absoluteChecks.some((prefix) =>
        normalizedFile === prefix ||
        normalizedFile.startsWith(prefix + '/') ||
        normalizedFile.endsWith('/' + prefix) ||
        normalizedFile.includes('/' + prefix + '/')
      );
    };

    let scoped = [];
    if (node.type === 'EmbeddedDocRegion') {
      scoped = allSections.filter((section) => section.regionId === node.id);
    } else if (node.type === 'DocFile') {
      if (node.groupKind === 'file' && node.file) {
        scoped = allSections.filter((section) => section.file === node.file);
      } else if (node.groupKind === 'docSource' && node.label) {
        scoped = allSections.filter((section) =>
          section.docSetLabel === node.label ||
          (!section.docSetLabel && node.label === 'Other docs')
        );
      } else if (node.groupKind === 'docSource' && node.sourcePath) {
        scoped = allSections.filter((section) => matchesSourceScope(section, node.sourcePath, '', node.label));
      } else {
        const prefix = Array.isArray(node.path) ? node.path : [];
        scoped = allSections.filter((section) => hasPathPrefix(section, prefix));
      }
    }

    const descendants = collectVdocsDescendantSections(nodeId);
    if (!scoped.length && descendants.length) scoped = descendants;

    return scoped.sort((a, b) =>
      String(a.file || '').localeCompare(String(b.file || '')) ||
      (a.startLine || 0) - (b.startLine || 0) ||
      String(a.label || '').localeCompare(String(b.label || ''))
    );
  }

  /**
   * Auto-documented structural element.
   */
  function aggregatedVdocsContent(node, sections) {
    if (!node) return '';
    const aggregatedSections = Array.isArray(sections) ? sections : collectVdocsDescendantSections(node.id);
    if (node.type === 'DocSection' && aggregatedSections.length <= 1) return node.content || '';
    return aggregatedSections
      .map((section) => {
        const headingPrefix = '#'.repeat(Math.max(1, Math.min(6, Number(section.headingLevel || 1))));
        return section.content
          ? section.content
          : headingPrefix + ' ' + section.label;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Auto-documented structural element.
   */
  function vdocsDisplayType(node) {
    if (!node) return 'Không rõ';
    if (node.type === 'DocFile') {
      if (node.groupKind === 'docSource') return 'Nguồn tài liệu';
      if (node.groupKind === 'folder') return 'Nhóm thư mục';
      if (node.groupKind === 'file') return 'File tài liệu';
      if (node.groupKind === 'flat') return 'Nhóm phẳng';
    }
    if (node.type === 'EmbeddedDocRegion') return 'Vùng tài liệu nhúng';
    return node.type;
  }

  /**
   * Auto-documented structural element.
   */
  function renderVdocsPreview(node) {
    if (!node) return '<div class="vdocs-outline-empty">Chọn một node tài liệu để xem trước.</div>';
    const sectionNodes = resolveVdocsScopeSections(node.id);
    const isGroupingNode = node.type === 'DocFile' && (node.groupKind === 'docSource' || node.groupKind === 'folder' || node.groupKind === 'flat');
    const isAggregatedContentNode =
      node.type === 'EmbeddedDocRegion' ||
      (node.type === 'DocFile' && node.groupKind === 'file') ||
      (node.type === 'DocSection' && sectionNodes.length > 1);
    const previewContent = isGroupingNode ? '' : aggregatedVdocsContent(node, sectionNodes);
    const mdHtml = isGroupingNode
      ? '<div class="vdocs-outline-empty">Node nhóm không có nội dung riêng. Hãy mở file hoặc section tài liệu bên dưới để đọc nội dung.</div>'
      : (previewContent
        ? ((typeof marked !== 'undefined') ? marked.parse(previewContent) : '<pre>' + esc(previewContent) + '</pre>')
        : '<div class="vdocs-outline-empty">Node này không có nội dung Markdown.</div>');
    let metaHtml = '<div class="panel-row"><span class="pl">Loại</span><span class="pv">' + badge(vdocsDisplayType(node)) + '</span></div>' +
      '<div class="panel-row"><span class="pl">File</span><span class="pv pv-file">' + esc(shortPath(node.file || '')) + '</span></div>' +
      '<div class="panel-row"><span class="pl">Dòng</span><span class="pv">' + (node.startLine || 1) + '–' + (node.endLine || 1) + '</span></div>';
    if (isAggregatedContentNode && sectionNodes.length > 1) {
      metaHtml += '<div class="panel-row"><span class="pl">Phạm vi nội dung</span><span class="pv">Tổng hợp từ ' + sectionNodes.length + ' section</span></div>';
    } else if (isGroupingNode) {
      metaHtml += '<div class="panel-row"><span class="pl">Phạm vi</span><span class="pv">' + sectionNodes.length + ' section trong nhóm này</span></div>';
    }
    if (node.path && node.path.length) {
      metaHtml += '<div class="panel-row"><span class="pl">Đường dẫn</span><span class="pv" style="font-family:monospace;font-size:11px">' + esc(node.path.join(' / ')) + '</span></div>';
    }
    if (node.sourceArtifact) metaHtml += renderSourceArtifact(node.sourceArtifact);
    let linkedSymsHtml = '';
    let relatedDocsHtml = '';
    if ((node.type === 'DocSection' || node.type === 'DocFile' || node.type === 'EmbeddedDocRegion') && vdocsData && vdocsData.edges) {
      const sectionIds = sectionNodes.map((item) => item.id);
      const docEdgeTypes = new Set(['REFERENCES', 'DOCUMENTED_BY', 'EXPLAINS_FLOW']);
      const linked = vdocsData.edges
        .filter(e => sectionIds.includes(e.source) && docEdgeTypes.has(e.type))
        .map(e => vdocsNodeById.get(e.target))
        .filter(Boolean);
      const related = vdocsData.edges
        .filter(e => e.type === 'REFERENCES_DOC' && (sectionIds.includes(e.source) || sectionIds.includes(e.target)))
        .map(e => ({
          direction: sectionIds.includes(e.source) && !sectionIds.includes(e.target) ? 'outgoing'
            : sectionIds.includes(e.target) && !sectionIds.includes(e.source) ? 'incoming'
              : null,
          doc: vdocsNodeById.get(sectionIds.includes(e.source) && !sectionIds.includes(e.target) ? e.target : e.source),
        }))
        .filter(item => item.doc && item.direction);
      const beforeDocs = related.filter(item => item.direction === 'outgoing');
      const afterDocs = related.filter(item => item.direction === 'incoming');
      if (linked.length) {
          linkedSymsHtml = '<div class="panel-section-title">Symbol liên kết (' + linked.length + ')</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">' +
          linked.map(s => {
            const symName = String(s.label || s.name || '').replace(/'/g, "\\'");
            return (
            '<div class="linked-sym-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;border-radius:6px;background:var(--bg);border:1px solid var(--border)">' +
              '<span style="min-width:0;overflow:hidden">' + badge(s.type || 'Symbol') + ' <span style="font-family:monospace;font-size:12px">' + esc(s.label || s.name || s.id) + '</span>' +
              '<span style="font-size:10px;color:var(--text2);margin-left:6px">' + esc(shortPath(s.file || '')) + '</span></span>' +
              '<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0">' +
                '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" data-sym-id="' + esc(s.id) + '" data-sym-name="' + esc(s.label || s.name || '') + '" onclick="openSymPopup(this.dataset.symId,this.dataset.symName)">Xem</button>' +
                '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick=\'copySymbolAnnotation("' + symName + '","at",this)\'>Chép @symbol</button>' +
                '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick=\'copySymbolAnnotation("' + symName + '","wiki",this)\'>Chép [[Symbol]]</button>' +
                '<button class="unlink-btn" data-doc-id="' + esc(node.id) + '" data-sym-id="' + esc(s.id) + '" onclick="doUnlink(this.dataset.docId,this.dataset.symId,this)">Gỡ liên kết</button>' +
              '</div>' +
            '</div>'
          ); }).join('') +
          '</div>';
      }
      if (related.length) {
        const renderRelatedGroup = (title, items, tone) =>
          '<div class="panel-section-title">' + title + ' (' + items.length + ')</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">' +
          items.map(item => {
            const docId = String(item.doc.id).replace(/'/g, "\\'");
            return (
            '<div class="linked-sym-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;border-radius:6px;background:var(--bg);border:1px solid var(--border)">' +
              '<span style="min-width:0;overflow:hidden">' +
                '<span class="badge" style="background:' + tone.bg + ';color:' + tone.fg + '">' + esc(title.toLowerCase()) + '</span> ' +
                '<span style="font-family:monospace;font-size:12px">' + esc(item.doc.label || item.doc.heading || item.doc.id) + '</span>' +
                '<span style="font-size:10px;color:var(--text2);margin-left:6px">' + esc(shortPath(item.doc.file || '')) + '</span></span>' +
              '<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0">' +
                '<button class="btn-secondary" style="padding:2px 8px;font-size:10px" onclick="selectVdocsNode(' + "'" + docId + "'" + ',true)">Mở</button>' +
              '</div>' +
            '</div>'
          ); }).join('') +
          '</div>';
        relatedDocsHtml = '<div class="panel-section-title">Tầng tài liệu (' + related.length + ')</div>' +
          '<div style="color:var(--text2);font-size:11px;margin-bottom:10px">Danh sách này để định vị nhanh section liên quan. Khi cần xem Liên kết hoặc Truy dấu luồng, mở section đó rồi dùng action ở panel chính.</div>' +
          (beforeDocs.length
            ? renderRelatedGroup('Trước', beforeDocs, { bg: '#ec489922', fg: '#ec4899' })
            : '<div style="color:var(--text2);font-size:11px;margin-bottom:10px">Không có tài liệu upstream.</div>') +
          (afterDocs.length
            ? renderRelatedGroup('Sau', afterDocs, { bg: '#f59e0b22', fg: '#f59e0b' })
            : '<div style="color:var(--text2);font-size:11px;margin-bottom:10px">Không có tài liệu downstream.</div>');
      }
    }
    const primaryFlowDocId = node.type === 'DocSection' ? node.id : (sectionNodes[0]?.id || node.id);
    const exportViewLabel = typeof window.getVdocsExportViewLabel === 'function'
      ? window.getVdocsExportViewLabel()
      : 'Component';
    const mermaidPreviewHtml = typeof window.getVdocsArchitecturePreviewHtml === 'function'
      ? window.getVdocsArchitecturePreviewHtml(String(node.id))
      : '<div class="vdocs-outline-empty">Bấm <strong>Xem Mermaid</strong> để dựng sơ đồ cho section này.</div>';
    const mermaidActionLabel = typeof window.getVdocsArchitectureActionLabel === 'function'
      ? window.getVdocsArchitectureActionLabel(String(node.id))
      : 'Xem Mermaid';
    const actions = (node.type === 'DocSection' || node.type === 'DocFile' || node.type === 'EmbeddedDocRegion')
      ? '<div class="vdocs-preview-actions">' +
          '<button class="btn-primary" style="padding:6px 10px;font-size:12px" onclick="openVdocsLinks(' + "'" + String(node.id).replace(/'/g, "\\'") + "'" + ')">Mở ở Liên kết</button>' +
          '<button class="btn-secondary" style="padding:6px 10px;font-size:12px" onclick="gotoDocFlow(' + "'" + String(primaryFlowDocId).replace(/'/g, "\\'") + "'" + ')">Truy dấu luồng</button>' +
          '<button class="btn-secondary" style="padding:6px 10px;font-size:12px" onclick="previewArchitecture(' + "'" + String(node.id).replace(/'/g, "\\'") + "'" + ',this)">' + esc(mermaidActionLabel) + '</button>' +
        '</div>' +
        '<div style="margin-top:8px;font-size:11px;color:var(--text2)">Mức sơ đồ hiện tại: <strong style="color:var(--text)">' + esc(exportViewLabel) + '</strong>.</div>' +
        '<div class="panel-section-title">Sơ đồ Mermaid</div>' +
        '<div id="vdocs-arch-preview" class="vdocs-content">' + mermaidPreviewHtml + '</div>'
      : '';
    return '<div class="vdocs-preview-head">' +
        '<div><h3 class="vdocs-preview-title">' + esc(node.fullLabel || node.label) + '</h3>' +
        '<div class="vdocs-preview-breadcrumb">' + esc((node.path || []).join(' / ')) + '</div></div>' +
      '</div>' +
      '<div class="vdocs-preview-card">' + metaHtml + actions + relatedDocsHtml + linkedSymsHtml + '<div class="panel-section-title">Nội dung</div><div class="vdocs-content">' + mdHtml + '</div></div>';
  }

  /**
   * Auto-documented structural element.
   */
  function revealVdocsNodeInTree(nodeId) {
    if (!nodeId) return false;
    let current = vdocsParentById.get(nodeId);
    let changed = false;
    while (current) {
      if (vdocsCollapsed.has(current)) {
        vdocsCollapsed.delete(current);
        changed = true;
      }
      current = vdocsParentById.get(current);
    }
    const container = document.getElementById('vdocs-container');
    const tree = container ? container.querySelector('.vdocs-outline-tree') : null;
    const target = tree ? tree.querySelector('[data-vdocs-node-id="' + cssEscape(nodeId) + '"]') : null;
    if (changed && vdocsData && vdocsTypeFilter === 'outline') {
      renderOutline(vdocsData);
    }
    const finalContainer = document.getElementById('vdocs-container');
    const finalTree = finalContainer ? finalContainer.querySelector('.vdocs-outline-tree') : null;
    const finalTarget = finalTree ? finalTree.querySelector('[data-vdocs-node-id="' + cssEscape(nodeId) + '"]') : null;
    if (finalTarget) {
      requestAnimationFrame(() => finalTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      return true;
    }
    return false;
  }

  /**
   * Auto-documented structural element.
   */
  function cssEscape(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * Auto-documented structural element.
   */
  function selectVdocsNode(nodeId, shouldReveal) {
    vdocsSelectedId = nodeId;
    if (vdocsTypeFilter === 'links') {
      renderVdocs();
    } else if (vdocsData) {
      if (shouldReveal && revealVdocsNodeInTree(nodeId)) return;
      const container = document.getElementById('vdocs-container');
      const preview = container ? container.querySelector('.vdocs-outline-preview') : null;
      const selectedNode = vdocsNodeById.get(nodeId);
      if (preview && selectedNode) {
        container.querySelectorAll('.vdocs-tree-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.vdocsNodeId === nodeId);
        });
        preview.innerHTML = renderVdocsPreview(selectedNode);
        requestAnimationFrame(() => renderMermaidIn(preview));
      } else {
        renderOutline(vdocsData);
      }
    }
  }

  /**
   * Auto-documented structural element.
   */
  function openVdocsLinks(nodeId) {
    vdocsSelectedId = nodeId;
    setVdocsType('links');
  }

  /**
   * Auto-documented structural element.
   */
  function toggleVdocsFold(nodeId) {
    if (vdocsCollapsed.has(nodeId)) vdocsCollapsed.delete(nodeId);
    else vdocsCollapsed.add(nodeId);
    if (vdocsData && vdocsTypeFilter === 'outline') renderOutline(vdocsData);
  }

  /**
   * Auto-documented structural element.
   */
  function renderSourceArtifact(sourceArtifact) {
    const entries = Object.entries(sourceArtifact || {});
    if (!entries.length) return '';
    return '<div class="panel-section-title">Source Artifact</div>' +
      entries.map(([key, value]) =>
        '<div class="doc-meta-row"><span class="doc-meta-pill"><strong>' + esc(key) + '</strong>: ' + esc(formatArtifactValue(value)) + '</span></div>'
      ).join('');
  }

  /**
   * Auto-documented structural element.
   */
  function formatArtifactValue(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value ?? '');
  }

  /**
   * Auto-documented structural element.
   */
  function vdocsDocLabel(node) {
    const icon = node.type === 'DocFile'
      ? node.groupKind === 'folder'
        ? '📚 '
        : node.groupKind === 'docSource'
          ? '🗂 '
          : node.groupKind === 'flat'
            ? '🧭 '
            : '📁 '
      : node.type === 'EmbeddedDocRegion' ? '📦 ' : '📝 ';
    const limit = node.type === 'DocFile' ? 34 : 28;
    return icon + (node.label.length > limit ? node.label.slice(0, limit) + '…' : node.label);
  }

  /**
   * Auto-documented structural element.
   */
  function fileDisplayName(file) {
    const normalized = String(file || '').replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : normalized || 'Document';
  }

  /**
   * Auto-documented structural element.
   */
  function normalizeSlashes(value) {
    return String(value || '').replace(/\\/g, '/');
  }

  /**
   * Auto-documented structural element.
   */
  function relativeDocPath(file) {
    return normalizeSlashes(file);
  }

  /**
   * Auto-documented structural element.
   */
  function docSourceMatch(file, project) {
    const docSources = project && Array.isArray(project.docSources) ? project.docSources : [];
    let best = null;
    for (const source of docSources) {
      const raw = normalizeSlashes(source.path || '');
      const prefix = raw
        .replace(/\/\*\*.*$/, '')
        .replace(/\*.*$/, '')
        .replace(/\/$/, '');
      if (!prefix) continue;
      const normalizedFile = normalizeSlashes(file);
      if (normalizedFile === prefix || normalizedFile.startsWith(prefix + '/')) {
        if (!best || prefix.length > best.prefix.length) best = { source, prefix };
      }
    }
    return best;
  }

  /**
   * Auto-documented structural element.
   */
  function visualDocsGroupForFile(file, project, config) {
    const relative = relativeDocPath(file, '');
    const segments = relative.split('/').filter(Boolean);
    if (config.structureMode === 'flat') {
      return { id: 'docgroup:flat', label: 'All docs', path: ['All docs'], groupKind: 'flat' };
    }
    if (config.structureMode === 'folder') {
      const dirSegments = segments.slice(0, -1);
      const depth = Math.max(1, Math.min(6, Number(config.folderDepth || 2)));
      const scoped = dirSegments.slice(0, depth);
      const folderLabel = scoped.length ? scoped.join('/') : '(root)';
      return { id: 'docgroup:folder:' + folderLabel, label: folderLabel, path: scoped.length ? scoped : ['(root)'], groupKind: 'folder' };
    }
    if (config.structureMode === 'docSource') {
      const match = docSourceMatch(file, project);
      if (match) {
        const label = match.source.label || match.prefix;
        return {
          id: 'docgroup:source:' + label,
          label,
          path: [label],
          groupKind: 'docSource',
          color: match.source.color || null,
          sourcePath: match.prefix,
        };
      }
      return {
        id: 'docgroup:source:unmatched',
        label: 'Other docs',
        path: ['Other docs'],
        groupKind: 'docSource',
        color: null,
        sourcePath: '',
      };
    }
    return null;
  }

  /**
   * Auto-documented structural element.
   */
  function buildStructuredDocGraph(nodes, treeEdges, project) {
    const config = normalizeVisualDocsConfig(project && project.visualDocs ? project.visualDocs : null);
    const docNodes = nodes.filter(n => n.type === 'DocSection' || n.type === 'Heading' || n.type === 'EmbeddedDocRegion');
    const treeParentById = new Map();
    for (const edge of treeEdges || []) treeParentById.set(edge.target, edge.source);

    const groupNodes = [];
    const fileNodes = [];
    const extraDocNodesById = new Map();
    const docEdges = [];
    const docRoots = new Map();
    const visibleDocIds = new Set(docNodes.map(n => n.id));
    const fileNodeByFile = new Map();
    const groupNodeById = new Map();

    const allFiles = [...new Set(docNodes.map(n => n.file || '').filter(Boolean))].sort((a, b) => a.localeCompare(b));

    for (const file of allFiles) {
      const group = visualDocsGroupForFile(file, project, config);
      const groupId = group ? group.id : null;
      if (group && !groupNodeById.has(groupId)) {
        const groupNode = {
          id: groupId,
          label: group.label,
          type: 'DocFile',
          file: file,
          startLine: 1,
          endLine: 1,
          content: '',
          fullLabel: group.label,
          path: group.path,
          parentHeading: '',
          groupKind: group.groupKind,
          docSetColor: group.color || null,
          sourcePath: group.sourcePath || '',
        };
        groupNodes.push(groupNode);
        groupNodeById.set(groupId, groupNode);
        docRoots.set(groupId, []);
      }

      const useFileNode = config.structureMode !== 'flat';
      if (useFileNode) {
        const relative = relativeDocPath(file, '');
        const fileNodeId = 'docfile:' + file;
        const fileNode = {
          id: fileNodeId,
          label: fileDisplayName(file),
          type: 'DocFile',
          file,
          startLine: 1,
          endLine: 1,
          content: '',
          fullLabel: relative || file,
          path: group ? [...group.path, fileDisplayName(file)] : [fileDisplayName(file)],
          parentHeading: '',
          groupKind: 'file',
        };
        fileNodes.push(fileNode);
        fileNodeByFile.set(file, fileNode);
        if (!groupId) docRoots.set(fileNodeId, []);
        if (groupId) {
          docEdges.push({ source: groupId, target: fileNodeId, type: 'CONTAINS' });
          docRoots.get(groupId).push(fileNodeId);
        }
      }
    }

    const plainDocsByFile = new Map();
    for (const node of docNodes) {
      if (node.type === 'EmbeddedDocRegion') continue;
      if (treeParentById.has(node.id)) continue;
      const file = node.file || '';
      if (!plainDocsByFile.has(file)) plainDocsByFile.set(file, []);
      plainDocsByFile.get(file).push(node);
    }

    for (const [file, docs] of plainDocsByFile.entries()) {
      const sorted = [...docs].sort((a, b) =>
        (a.startLine || 0) - (b.startLine || 0) ||
        (a.headingLevel || 1) - (b.headingLevel || 1) ||
        (a.endLine || 0) - (b.endLine || 0) ||
        a.id.localeCompare(b.id)
      );
      const stack = [];
      const fileNode = fileNodeByFile.get(file) || null;
      const group = visualDocsGroupForFile(file, project, config);
      const topParentId = fileNode ? fileNode.id : (group ? group.id : null);
      const topPath = fileNode ? fileNode.path : (group ? group.path : ['All docs']);
      for (const node of sorted) {
        while (stack.length && (stack[stack.length - 1].headingLevel || 1) >= (node.headingLevel || 1)) stack.pop();
        const parent = stack[stack.length - 1] || null;
        const path = parent ? [...(parent.path || [parent.label]), node.label] : [...topPath, node.label];
        const current = { ...node, path, parentHeading: parent ? parent.label : '' };
        extraDocNodesById.set(node.id, current);
        if (parent) {
          docEdges.push({ source: parent.id, target: node.id, type: 'CONTAINS' });
        } else if (topParentId) {
          docEdges.push({ source: topParentId, target: node.id, type: 'CONTAINS' });
          if (docRoots.has(topParentId)) docRoots.get(topParentId).push(node.id);
        }
        stack.push({ ...node, path, headingLevel: node.headingLevel || 1 });
      }
    }

    for (const node of docNodes) {
      if (node.type !== 'EmbeddedDocRegion') continue;
      const file = node.file || '';
      const fileNode = fileNodeByFile.get(file) || null;
      const group = visualDocsGroupForFile(file, project, config);
      const topParentId = fileNode ? fileNode.id : (group ? group.id : null);
      const topPath = fileNode ? fileNode.path : (group ? group.path : ['All docs']);
      if (topParentId) {
        docEdges.push({ source: topParentId, target: node.id, type: 'CONTAINS' });
        if (docRoots.has(topParentId)) docRoots.get(topParentId).push(node.id);
      }
      const nodePath = [...topPath, node.label];
      extraDocNodesById.set(node.id, { ...node, path: nodePath, parentHeading: '' });
    }

    const regionTreeEdges = (treeEdges || []).filter(edge => visibleDocIds.has(edge.source) && visibleDocIds.has(edge.target));
    const finalDocNodes = [
      ...groupNodes,
      ...fileNodes,
      ...docNodes.map(node =>
        extraDocNodesById.get(node.id) || { ...node, path: [fileDisplayName(node.file || ''), node.label], parentHeading: '' }
      ),
    ];
    const finalDocEdges = [
      ...docEdges,
      ...regionTreeEdges,
    ];
    return { docNodes: finalDocNodes, docEdges: finalDocEdges, docRoots };
  }
  /**
   * Auto-documented structural element.
   */
  function augmentDocNodes(nodes, nodeMeta, regionNodes) {
    return [
      ...nodes.map(n => {
        const meta = nodeMeta.get(n.id) || {};
        return { ...n, ...meta };
      }),
      ...regionNodes,
    ];
  }

  /**
   * Auto-documented structural element.
   */
  function buildEmbeddedDocRegionTree(regions) {
    const nodeMeta = new Map();
    const regionNodes = [];
    const edges = [];

    /**
     * Auto-documented structural element.
     */
    const walk = (node, region, parent) => {
      const current = {
        id: node.id,
        label: node.heading,
        type: 'DocSection',
        file: node.filePath,
        startLine: node.startLine,
        endLine: node.endLine,
        content: node.contentPreview || '',
        slug: node.slug || '',
        headingLevel: node.headingLevel || 1,
        fullLabel: node.heading,
        regionId: region.id,
        regionHeading: region.heading,
        sourceArtifact: node.sourceArtifact || region.sourceArtifact || null,
        path: node.path || [node.heading],
        parentHeading: parent ? parent.heading : '',
      };
      nodeMeta.set(node.id, current);
      edges.push({
        source: parent ? parent.id : region.id,
        target: node.id,
        type: 'CONTAINS',
      });
      for (const child of node.children || []) walk(child, region, current);
    };

    for (const region of regions || []) {
      const regionNode = {
        id: region.id,
        label: region.heading,
        type: 'EmbeddedDocRegion',
        file: region.filePath || '',
        startLine: region.startLine || 1,
        endLine: region.endLine || 1,
        content: region.contentPreview || '',
        slug: region.id,
        headingLevel: 0,
        fullLabel: region.heading,
        regionId: region.id,
        regionHeading: region.heading,
        sourceArtifact: region.sourceArtifact || null,
        path: [region.heading],
        parentHeading: '',
      };
      regionNodes.push(regionNode);
      for (const root of region.roots || []) walk(root, region, null);
    }

    return { nodeMeta, regionNodes, edges };
  }

  window.renderOutline = renderOutline;
  window.scrollToDocSource = scrollToDocSource;
  window.selectVdocsNode = selectVdocsNode;
  window.openVdocsLinks = openVdocsLinks;
  window.toggleVdocsFold = toggleVdocsFold;
