  /**
   * Auto-documented structural element.
   */
  async function loadDocNeighborhood() {
    if (!vdocsSelectedId) return;
    const selectedNode = vdocsNodeById.get(vdocsSelectedId) || null;
    const includeCodeContext = document.getElementById('vdocs-expand-code').checked;
    const query = [];
    if (selectedNode && selectedNode.type !== 'DocSection' && typeof resolveVdocsScopeSections === 'function') {
      const sectionIds = resolveVdocsScopeSections(vdocsSelectedId).map((item) => item.id);
      if (!sectionIds.length) return;
      vdocsLinkScopeDocIds = sectionIds;
      query.push('docSectionIds=' + enc(sectionIds.join(',')));
      query.push('focusDocId=' + enc(sectionIds[0]));
    } else {
      vdocsLinkScopeDocIds = [vdocsSelectedId];
      query.push('docSectionId=' + enc(vdocsSelectedId));
    }
    if (currentProject) query.push('project=' + currentProject);
    if (includeCodeContext) query.push('includeCodeContext=1');
    vdocsLinksData = await fetch('/api/doc-neighborhood?' + query.join('&')).then(r => r.json()).catch(() => null);
  }

  /**
   * Auto-documented structural element.
   */
  function renderLinksGraph(data) {
    const el = document.getElementById('vdocs-container');
    const stats = document.getElementById('vdocs-stats');
    if (vdocsRenderer) { vdocsRenderer.kill(); vdocsRenderer = null; }
    el.innerHTML = '';
    if (!data || !data.nodes || !data.nodes.length) {
      el.innerHTML = '<div class="vdocs-links-empty"><div style="font-size:30px">↔</div><div>Select a DocSection in Outline to inspect links.</div></div>';
      stats.textContent = 'links · 0 symbols · 0 edges';
      return;
    }

    const focusDocId = data.focusDocId;
    const nodes = data.nodes;
    const edges = data.edges || [];
    const g = new graphology.Graph({ type: 'directed', multi: true });
    const docNodes = nodes.filter((node) => node.type === 'DocSection');
    const focusDocNode = docNodes.find((node) => node.id === focusDocId) || docNodes[0] || null;
    const childDocNodes = docNodes.filter((node) => node.id !== focusDocId);
    const symbolNodes = nodes.filter((node) => node.type !== 'DocSection');
    const codeEdges = edges.filter((edge) => edge.type !== 'REFERENCES' && edge.type !== 'REFERENCES_DOC' && edge.type !== 'DOCUMENTED_BY' && edge.type !== 'EXPLAINS_FLOW');
    const docEdges = edges.filter((edge) => edge.type === 'REFERENCES' || edge.type === 'REFERENCES_DOC' || edge.type === 'DOCUMENTED_BY' || edge.type === 'EXPLAINS_FLOW');
    const scopeDocIds = new Set(vdocsLinkScopeDocIds && vdocsLinkScopeDocIds.length ? vdocsLinkScopeDocIds : [focusDocId]);
    const beforeDocIds = new Set(
      edges
        .filter((edge) => edge.type === 'REFERENCES_DOC' && scopeDocIds.has(edge.source) && !scopeDocIds.has(edge.target))
        .map((edge) => edge.target)
    );
    const afterDocIds = new Set(
      edges
        .filter((edge) => edge.type === 'REFERENCES_DOC' && scopeDocIds.has(edge.target) && !scopeDocIds.has(edge.source))
        .map((edge) => edge.source)
    );

    if (focusDocNode) {
      g.addNode(focusDocNode.id, {
        label: '📝 ' + focusDocNode.label,
        x: 0, y: 0,
        size: 18,
        color: '#f43f5e',
        originalColor: '#f43f5e',
        nodeType: focusDocNode.type, file: focusDocNode.file, startLine: focusDocNode.startLine, endLine: focusDocNode.endLine,
        content: focusDocNode.content || '', signature: '', docString: '',
        slug: focusDocNode.slug || '', headingLevel: focusDocNode.headingLevel || 1,
        fullLabel: focusDocNode.label, path: [focusDocNode.label], sourceArtifact: focusDocNode.sourceArtifact || null,
        isFocusDoc: true,
      });
    }

    const childDocRadius = Math.max(5, childDocNodes.length * 1.8);
    childDocNodes.forEach((node, index) => {
      const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / Math.max(childDocNodes.length, 1);
      const isBefore = beforeDocIds.has(node.id);
      const isAfter = afterDocIds.has(node.id);
      const relationLabel = isBefore && isAfter ? 'Before/After' : isBefore ? 'Before' : isAfter ? 'After' : '';
      const labelPrefix = relationLabel ? relationLabel + ' · ' : '';
      g.addNode(node.id, {
        label: '📝 ' + labelPrefix + node.label,
        x: Math.cos(angle) * childDocRadius,
        y: Math.sin(angle) * childDocRadius - 7,
        size: 11,
        color: '#fb7185',
        originalColor: '#fb7185',
        nodeType: node.type, file: node.file, startLine: node.startLine, endLine: node.endLine,
        content: node.content || '', signature: '', docString: '',
        slug: node.slug || '', headingLevel: node.headingLevel || 1,
        fullLabel: node.label, path: [node.label], sourceArtifact: node.sourceArtifact || null,
        isFocusDoc: false, relationLabel,
      });
    });

    const radius = Math.max(10, symbolNodes.length * 1.6);
    symbolNodes.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(symbolNodes.length, 1);
      g.addNode(node.id, {
        label: node.label,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius + 2,
        size: 7,
        color: NODE_COLORS[node.type] || '#94a3b8',
        originalColor: NODE_COLORS[node.type] || '#94a3b8',
        nodeType: node.type, file: node.file, startLine: node.startLine, endLine: node.endLine,
        content: '', signature: node.signature || '', docString: node.docString || '',
        slug: '', headingLevel: 1, fullLabel: node.label, path: [], sourceArtifact: null,
        isFocusDoc: false,
      });
    });

    edges.forEach((edge) => {
      if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
        try { g.addEdge(edge.source, edge.target, { color: EDGE_COLORS[edge.type] || '#30363d', size: edge.type.startsWith('DOC') ? 1.2 : 0.8 }); } catch (_) {}
      }
    });

    vdocsRenderer = new Sigma(g, el, {
      renderEdgeLabels: false,
      defaultEdgeColor: '#30363d',
      labelColor: { color: '#7d8590' },
      labelSize: 10,
      labelRenderedSizeThreshold: 2,
      allowInvalidContainer: true,
    });
    vdocsRenderer.on('clickNode', ({ node }) => handleVdocsGraphNodeClick(g.getNodeAttributes(node)));
    vdocsRenderer.on('clickStage', closeVdocsPanel);

    stats.textContent = 'links · ' + docNodes.length + ' docs · ' + beforeDocIds.size + ' before · ' + afterDocIds.size + ' after · ' + symbolNodes.length + ' symbols';
  }

  /**
   * Auto-documented structural element.
   */
  function showVdocsOverlay(attrs) {
    let panel = document.getElementById('vdocs-panel');
    if (!panel) {
      const wrap = document.getElementById('vdocs-wrap');
      panel = document.createElement('div');
      panel.id = 'vdocs-panel';
      panel.innerHTML = '<div class="panel-header"><span class="panel-title" id="vdocs-panel-name"></span><button class="panel-close" onclick="closeVdocsPanel()">×</button></div><div id="vdocs-panel-content"></div>';
      wrap.appendChild(panel);
    }
    document.getElementById('vdocs-panel-name').textContent = attrs.fullLabel || attrs.label;
    let html = '<div class="panel-row"><span class="pl">Type</span><span class="pv">' + badge(attrs.nodeType) + '</span></div>' +
      '<div class="panel-row"><span class="pl">File</span><span class="pv pv-file">' + esc(shortPath(attrs.file || '')) + '</span></div>' +
      '<div class="panel-row"><span class="pl">Lines</span><span class="pv">' + (attrs.startLine || 1) + '–' + (attrs.endLine || 1) + '</span></div>';
    if (attrs.relationLabel) {
      html += '<div class="panel-row"><span class="pl">Layer</span><span class="pv">' + esc(attrs.relationLabel) + '</span></div>';
    }
    if (attrs.content) html += '<div class="panel-section-title">Content</div><div class="vdocs-content">' + ((typeof marked !== 'undefined') ? marked.parse(attrs.content) : '<pre>' + esc(attrs.content) + '</pre>') + '</div>';
    if (attrs.signature) html += '<div class="panel-sig"><code>' + esc(attrs.signature) + '</code></div>';
    if (attrs.docString) html += '<div class="panel-doc">' + esc(attrs.docString.slice(0, 180)) + '</div>';
    document.getElementById('vdocs-panel-content').innerHTML = html;
    panel.classList.add('open');
  }

  /**
   * Auto-documented structural element.
   */
  function handleVdocsGraphNodeClick(attrs) {
    if (attrs?.nodeType === 'DocSection' && attrs?.id) {
      vdocsSelectedId = attrs.id;
      setVdocsType('outline');
      selectVdocsNode(attrs.id, true);
      return;
    }
    showVdocsOverlay(attrs);
  }

  /**
   * Auto-documented structural element.
   */
  function closeVdocsPanel() {
    const panel = document.getElementById('vdocs-panel');
    if (panel) panel.classList.remove('open');
  }
