  // ── Impact tab ────────────────────────────────────────────────────────────
  async function fetchFlowJson(path) {
    const hasProjectParam = /(?:\?|&)project=/.test(path);
    const sep = path.includes('?') ? '&' : '?';
    const url = currentProject && !hasProjectParam ? `${path}${sep}project=${currentProject}` : path;
    const response = await fetch(url);
    const data = await response.json().catch(() => null);
    return { response, data };
  }

  async function doImpact() {
    const name = document.getElementById('impact-name').value.trim();
    const depth = document.getElementById('impact-depth').value;
    const el = document.getElementById('impact-results');
    if (!name) return;
    el.innerHTML = loading('Đang phân tích ảnh hưởng…');
    const data = await api('/api/impact?name=' + enc(name) + '&depth=' + depth);
    if (!data) { el.innerHTML = errHTML('Phân tích thất bại'); return; }

    const total = data.directlyAffected.length + data.transitivelyAffected.length;
    if (total === 0 && data.linkedDocs.length === 0) {
      el.innerHTML = '<div class="success-box">Không có phụ thuộc nào bị ảnh hưởng, có thể thay đổi an toàn.</div>'; return;
    }

    let html = '<div class="impact-summary">' +
      '<span class="impact-badge direct">' + data.directlyAffected.length + ' trực tiếp</span>' +
      '<span class="impact-badge transitive">' + data.transitivelyAffected.length + ' gián tiếp</span>' +
      '<span class="impact-badge docs">' + data.linkedDocs.length + ' tài liệu</span>' +
      '</div>';

    if (data.directlyAffected.length) {
      html += '<div class="section-title">Bị ảnh hưởng trực tiếp</div>' + data.directlyAffected.map(s => symbolCard(s)).join('');
    }
    if (data.transitivelyAffected.length) {
      html += '<div class="section-title">Bị ảnh hưởng gián tiếp</div>' + data.transitivelyAffected.map(s => symbolCard(s)).join('');
    }
    if (data.linkedDocs.length) {
      html += '<div class="section-title">Tài liệu liên kết</div>' + data.linkedDocs.map(docCard).join('');
    }
    el.innerHTML = html;
  }

  document.getElementById('impact-name').addEventListener('keydown', e => { if (e.key === 'Enter') doImpact(); });

  // ── Flow tab ──────────────────────────────────────────────────────────────
  async function doFlow() {
    const mode = document.getElementById('flow-mode').value;
    const entry = document.getElementById('flow-entry').value.trim();
    const docDepth = document.getElementById('flow-doc-depth').value;
    const depth = document.getElementById('flow-depth').value;
    const el = document.getElementById('flow-results');
    if (!entry) {
      el.innerHTML = empty(mode === 'doc'
        ? 'Nhập heading, từ khóa, hoặc ID của section để truy dấu từ tài liệu xuống code.'
        : 'Nhập tên hàm hoặc method làm entry point để lần theo CALLS flow.');
      return;
    }
    el.innerHTML = loading('Đang truy dấu luồng…');
    try {
      if (mode === 'doc') {
        const { response, data } = await fetchFlowJson('/api/doc-flow?query=' + enc(entry) + '&docDepth=' + docDepth + '&codeDepth=' + depth);
        if (response.status === 404 || !data) {
          el.innerHTML = empty('Không tìm thấy section tài liệu khớp với "' + esc(entry) + '". Hãy thử heading gần đúng hoặc dùng nút `Truy dấu luồng` từ một section đã mở.');
          return;
        }
        if (!response.ok) {
          el.innerHTML = errHTML(data?.error || ('Truy dấu tài liệu thất bại (HTTP ' + response.status + ').'));
          return;
        }
        if (!data.focusDoc || !Array.isArray(data.beforeDocs) || !Array.isArray(data.afterDocs) || !Array.isArray(data.linkedSymbols) || !Array.isArray(data.codeFlows)) {
          el.innerHTML = errHTML('Dữ liệu truy dấu tài liệu không hợp lệ.');
          return;
        }
        el.innerHTML = renderDocFlowTrace(data);
        return;
      }

      const { response, data } = await fetchFlowJson('/api/flow?entry=' + enc(entry) + '&depth=' + depth);
      if (response.status === 404 || !data) {
        el.innerHTML = empty('Không tìm thấy entry point "' + esc(entry) + '".');
        return;
      }
      if (!response.ok) {
        el.innerHTML = errHTML(data?.error || ('Truy dấu code thất bại (HTTP ' + response.status + ').'));
        return;
      }
      if (!data.entryPoint || !Array.isArray(data.steps)) {
        el.innerHTML = errHTML('Dữ liệu process flow không hợp lệ.');
        return;
      }

      let html = '<div class="flow-entry">' +
        badge(data.entryPoint.type) + ' <strong>' + esc(data.entryPoint.name) + '</strong>' +
        '<span class="file-path">' + esc(shortPath(data.entryPoint.filePath)) + ':' + data.entryPoint.startLine + '</span>' +
        '</div>';

      if (!data.steps.length) { html += empty('Không tìm thấy lời gọi đi ra'); }
      else {
        html += '<div class="flow-steps">' + data.steps.map(step =>
          '<div class="flow-step" style="padding-left:' + (14 + step.callDepth * 20) + 'px">' +
          '<span class="flow-depth">→</span>' + badge(step.symbol.type) +
          ' <span class="flow-name">' + esc(step.symbol.name) + '</span>' +
          '<span class="file-path">' + esc(shortPath(step.symbol.filePath)) + ':' + step.symbol.startLine + '</span>' +
          '</div>'
        ).join('') + '</div>';
      }
      el.innerHTML = html;
    } catch (error) {
      console.error('doFlow failed', error);
      el.innerHTML = errHTML(error instanceof Error ? error.message : 'Truy dấu luồng thất bại.');
    }
  }

  document.getElementById('flow-entry').addEventListener('keydown', e => { if (e.key === 'Enter') doFlow(); });
  document.getElementById('flow-mode').addEventListener('change', () => {
    const mode = document.getElementById('flow-mode').value;
    const input = document.getElementById('flow-entry');
    input.placeholder = mode === 'doc'
      ? 'Heading tài liệu, từ khóa, hoặc ID của section...'
      : 'Hàm entry point...';
  });

  function renderDocFlowTrace(data) {
    const codeFlowCount = Array.isArray(data.codeFlows)
      ? data.codeFlows.filter((flow) => Array.isArray(flow.steps) && flow.steps.length > 0).length
      : 0;
    const renderDocDepthList = (title, items, emptyText) => {
      if (!items.length) return '<div class="section-title">' + title + '</div>' + empty(emptyText);
      return '<div class="section-title">' + title + '</div>' + items.map((item) =>
        '<div>' +
          '<div style="font-size:10px;color:var(--text2);margin:0 0 4px 4px">Độ sâu ' + item.depth + '</div>' +
          docCard(item.doc) +
        '</div>'
      ).join('');
    };

    const renderDocSources = (fromDocs) => fromDocs.map((item) =>
      '<div style="font-size:11px;color:var(--text2);margin-top:4px">' +
        '<span style="color:var(--text);font-family:monospace">' + esc(item.heading) + '</span>' +
        ' · ' + esc(item.edgeType) +
        ' · ' + (item.relationToFocus === 'focus' ? 'tài liệu trọng tâm' : ('sau độ sâu ' + item.docDepth)) +
      '</div>'
    ).join('');

    const renderCodeFlow = (flow) => {
      let html = '<div class="symbol-card">' +
        '<div class="symbol-header">' + badge(flow.entrySymbol.type) +
        ' <span class="symbol-name">' + esc(flow.entrySymbol.name) + '</span></div>' +
        '<div class="symbol-file">' + esc(shortPath(flow.entrySymbol.filePath)) + ':' + flow.entrySymbol.startLine + '</div>' +
      '</div>';
      if (!flow.steps.length) return html + empty('Không tìm thấy lời gọi đi ra cho "' + esc(flow.entrySymbol.name) + '"');
      return html + '<div class="flow-steps">' + flow.steps.map((step) =>
        '<div class="flow-step" style="padding-left:' + (14 + step.callDepth * 20) + 'px">' +
          '<span class="flow-depth">→</span>' + badge(step.symbol.type) +
          ' <span class="flow-name">' + esc(step.symbol.name) + '</span>' +
          '<span class="file-path">' + esc(shortPath(step.symbol.filePath)) + ':' + step.symbol.startLine + '</span>' +
        '</div>'
      ).join('') + '</div>';
    };

    let html = '<div class="impact-summary">' +
      '<span class="impact-badge direct">' + data.summary.beforeDocCount + ' tài liệu trước</span>' +
      '<span class="impact-badge transitive">' + data.summary.afterDocCount + ' tài liệu sau</span>' +
      '<span class="impact-badge docs">' + data.summary.linkedSymbolCount + ' symbol liên kết</span>' +
      '</div>';

    html += '<div class="success-box" style="margin-bottom:14px">' +
      'Luồng tài liệu được dựng theo chuỗi: tài liệu trọng tâm → tài liệu sau → symbol liên kết → CALLS trong code.' +
      '<br>' +
      'Kết quả hiện tại: ' + data.summary.beforeDocCount + ' tài liệu trước, ' + data.summary.afterDocCount + ' tài liệu sau, ' +
      data.summary.linkedSymbolCount + ' symbol liên kết, ' + codeFlowCount + ' symbol có CALLS đi ra.' +
      '</div>';

    html += '<div class="section-title">Tài liệu trọng tâm</div>' + docCard(data.focusDoc);
    html += renderDocDepthList('Tài liệu trước', data.beforeDocs, 'Không có tài liệu upstream.');
    html += renderDocDepthList('Tài liệu sau', data.afterDocs, 'Không có tài liệu downstream.');

    if (!data.linkedSymbols.length) {
      html += '<div class="section-title">Symbol liên kết</div>' + empty('Không tìm thấy liên kết tài liệu -> code từ tài liệu trọng tâm và các tài liệu downstream.');
    } else {
      html += '<div class="section-title">Symbol liên kết</div>' + data.linkedSymbols.map((item) =>
        symbolCard(item.symbol) +
        '<div style="margin:-8px 0 14px 12px;padding:0 0 0 12px;border-left:2px solid var(--border)">' +
          '<div style="font-size:11px;color:var(--text2)">Loại cạnh: ' + esc(item.edgeTypes.join(', ')) + '</div>' +
          '<div style="font-size:11px;color:var(--text2)">Bên gọi trực tiếp: ' + item.directCallers.length + ' · Bên được gọi trực tiếp: ' + item.directCallees.length + ' · Tài liệu liên kết: ' + item.linkedDocs.length + '</div>' +
          (!item.directCallees.length ? '<div style="font-size:11px;color:var(--text2)">Symbol này hiện chưa có CALLS đi ra trong graph.</div>' : '') +
          renderDocSources(item.fromDocs) +
        '</div>'
      ).join('');
    }

    html += '<div class="section-title">Luồng code</div>';
    if (!data.codeFlows.length) {
      html += empty('Chưa có code flow nào được dựng từ section này.');
      return html;
    }
    if (!codeFlowCount) {
      html += empty('Các symbol liên kết đã được tìm thấy, nhưng hiện chưa có CALLS đi ra để dựng flow sâu hơn.');
      return html;
    }
    html += data.codeFlows.map(renderCodeFlow).join('');
    return html;
  }

  // ── Module tab ────────────────────────────────────────────────────────────
  async function doModule() {
    const pattern = document.getElementById('module-pattern').value.trim();
    const el = document.getElementById('module-results');
    if (!pattern) return;
    el.innerHTML = loading();
    const data = await api('/api/module?pattern=' + enc(pattern));
    if (!data || data.symbolCount === 0) { el.innerHTML = empty('Không tìm thấy symbol cho "' + esc(pattern) + '"'); return; }

    let html = '<div class="module-stats">' +
      '<div class="module-stat"><span class="stat-val">' + data.symbolCount + '</span><span class="stat-lbl">symbol</span></div>' +
      '<div class="module-stat"><span class="stat-val">' + data.fileCount + '</span><span class="stat-lbl">file</span></div>' +
      '</div>';

    if (data.topCalledSymbols.length) {
      html += '<div class="section-title">Được gọi nhiều nhất</div>' + data.topCalledSymbols.map(({ symbol: s, callCount }) =>
        '<div class="symbol-card"><div class="symbol-header">' + badge(s.type) + ' <span class="symbol-name">' + esc(s.name) + '</span>' +
        '<span class="call-count">' + callCount + ' lượt gọi</span></div>' +
        '<div class="symbol-file">' + esc(shortPath(s.filePath)) + ':' + s.startLine + '</div></div>'
      ).join('');
    }

    // Symbols grouped by file
    html += '<div class="section-title">Tất cả symbol (' + data.symbolCount + ')</div>';
    const byFile = {};
    for (const s of data.symbols) {
      if (!byFile[s.filePath]) byFile[s.filePath] = [];
      byFile[s.filePath].push(s);
    }
    for (const [file, syms] of Object.entries(byFile)) {
      html += '<div class="file-group"><div class="file-group-header">' + esc(file) +
        ' <span class="file-count">' + syms.length + '</span></div>' +
        syms.map(s => symbolCard(s)).join('') + '</div>';
    }
    el.innerHTML = html;
  }

  document.getElementById('module-pattern').addEventListener('keydown', e => { if (e.key === 'Enter') doModule(); });
