import express from 'express';
import { join, dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { GraphDB } from '../graph/db.js';
import { registerProject, unregisterProject, updateProject, CENTRAL_DB_PATH } from '../cli/registry.js';
import { runIndex } from '../indexer/index.js';
import type { CodeSourceConfig, DocSourceConfig, VisualDocsConfig } from '../types/index.js';
import { scanDocSources } from '../mcp/tools/scan-doc-sources.js';
import { setVisualDocsConfig } from '../mcp/tools/set-visual-docs-config.js';
import { provideParseRules } from '../mcp/tools/provide-parse-rules.js';
import { previewParseRules } from '../mcp/tools/preview-parse-rules.js';
import { getImpact } from '../mcp/tools/get-impact.js';
import { getProcessFlow } from '../mcp/tools/get-process-flow.js';
import { getDocFlowTrace } from '../mcp/tools/get-doc-flow-trace.js';
import { searchGraph } from '../mcp/tools/search-graph.js';
import { getModuleOverview } from '../mcp/tools/get-module-overview.js';
import { checkDocSync } from '../mcp/tools/check-doc-sync.js';
import { suggestDocLinks } from '../mcp/tools/suggest-doc-links.js';
import { createDocLink } from '../mcp/tools/create-doc-link.js';
import { validateLinks } from '../mcp/tools/validate-links.js';
import type { RegisteredProject } from '../cli/registry.js';
import { resolveArchitectureExportRequest } from './architecture-export.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type ProjectEntry = Pick<RegisteredProject, 'id' | 'code' | 'name' | 'docSources' | 'codeSources' | 'visualDocs'>;

interface ResolvedDocRef {
  rawInput: string;
  normalizedRef: string;
  canonicalRef: string;
  annotationText: string;
  wikiAnnotationText: string;
  targetSectionId: string;
  targetHeading: string;
  targetFilePath: string;
  targetSlug: string;
}

function stripDocRefInput(rawInput: string): string {
  const value = String(rawInput || '').trim();
  if (!value) return '';
  if (value.startsWith('[[doc:') && value.endsWith(']]')) return value.slice(6, -2).trim();
  if (value.startsWith('@doc:')) return value.slice(5).trim();
  if (value.startsWith('doc:')) return value.slice(4).trim();
  return value;
}

function normalizeDocRef(rawRef: string, sourceFilePath: string): { normalizedRef: string; filePath: string; slug: string } | null {
  const value = stripDocRefInput(rawRef);
  if (!value) return null;
  if (value.startsWith('#')) {
    const slug = value.slice(1).trim();
    return slug ? { normalizedRef: `${sourceFilePath}#${slug}`, filePath: sourceFilePath, slug } : null;
  }
  const hashIndex = value.lastIndexOf('#');
  const rawPath = hashIndex >= 0 ? value.slice(0, hashIndex).trim() : value.trim();
  const slug = hashIndex >= 0 ? value.slice(hashIndex + 1).trim() : '';
  const filePath = rawPath.startsWith('/') ? rawPath : resolve(dirname(sourceFilePath), rawPath);
  return { normalizedRef: slug ? `${filePath}#${slug}` : filePath, filePath, slug };
}

function buildCanonicalDocAnnotations(sourceFilePath: string, targetFilePath: string, slug: string): {
  canonicalRef: string;
  annotationText: string;
  wikiAnnotationText: string;
} {
  const canonicalRef = slug
    ? sourceFilePath === targetFilePath
      ? `#${slug}`
      : `${relative(dirname(sourceFilePath), targetFilePath) || '.'}#${slug}`.replace(/\\/g, '/')
    : sourceFilePath === targetFilePath
      ? ''
      : (relative(dirname(sourceFilePath), targetFilePath) || '.').replace(/\\/g, '/');
  return {
    canonicalRef,
    annotationText: canonicalRef ? `@doc:${canonicalRef}` : '',
    wikiAnnotationText: canonicalRef ? `[[doc:${canonicalRef}]]` : '',
  };
}

function toPublicProject(entry: ProjectEntry, extra?: Record<string, unknown>) {
  return {
    id: entry.id,
    code: entry.code,
    name: entry.name,
    docSources: entry.docSources,
    codeSources: entry.codeSources,
    visualDocs: entry.visualDocs,
    ...(extra ?? {}),
  };
}

function resolveDocRefAgainstGraph(db: GraphDB, sourceFilePath: string, rawRef: string): ResolvedDocRef | null {
  const normalized = normalizeDocRef(rawRef, sourceFilePath);
  if (!normalized) return null;
  let section = normalized.slug
    ? db.getDocSectionByPathAndSlug(normalized.filePath, normalized.slug)
    : null;
  if (!section && !normalized.slug) {
    const fileSections = db.searchDocs('', 5000)
      .filter((item) => item.filePath === normalized.filePath)
      .sort((a, b) => a.startLine - b.startLine);
    section = fileSections[0] ?? null;
  }
  if (!section) return null;
  const refs = buildCanonicalDocAnnotations(sourceFilePath, section.filePath, section.slug);
  return {
    rawInput: rawRef,
    normalizedRef: normalized.normalizedRef,
    canonicalRef: refs.canonicalRef,
    annotationText: refs.annotationText,
    wikiAnnotationText: refs.wikiAnnotationText,
    targetSectionId: section.id,
    targetHeading: section.heading,
    targetFilePath: section.filePath,
    targetSlug: section.slug,
  };
}

function findDocSectionByQuery(db: GraphDB, query: string) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return null;
  let section = trimmed.startsWith('doc:') ? db.getDocSectionById(trimmed) : null;
  if (!section) {
    const hits = db.searchDocs(trimmed, 10);
    section = hits.find((item) => item.heading.toLowerCase() === trimmed.toLowerCase()) ?? hits[0] ?? null;
  }
  return section;
}

/**
 * Hosts the primary UI boundary for architecture surfaces, dashboard-style health,
 * and operational freshness entry points.
 * @doc:../../docs/architecture/07-7-viz-server-20-endpoints.md#7-viz-server-43-routes
 * @doc:../../docs/architecture/09-9-web-ui-8-tabs.md#9-web-ui-8-tabs
 * @doc:../../docs/requirements/frd-architecture-surfaces-and-freshness.md#frd-func-010-diagram-generation-va-architecture-surface-delivery
 *
 * FRD-FUNC-010: architecture surface delivery through the Web UI.
 * PRD-OPS-002: knowledge health dashboard surface.
 */
export async function startVizServer(initialProjects: ProjectEntry[], port: number): Promise<void> {
  const projects: ProjectEntry[] = [...initialProjects];
  const dbs = new Map<string, GraphDB>();
  for (const p of projects) {
    const db = new GraphDB(CENTRAL_DB_PATH, p.id);
    await db.init();
    dbs.set(p.id, db);
  }

  /**
   * Auto-documented structural element.
   * @doc:../../docs/architecture/07-7-viz-server-20-endpoints.md#7-viz-server-43-routes
   */
  function resolveDb(req: express.Request): GraphDB | null {
    const id = String(req.query['project'] ?? projects[0]?.id ?? '');
    return dbs.get(id) ?? null;
  }

  /**
   * Auto-documented structural element.
   */
  function err404(res: express.Response) {
    res.status(404).json({ error: 'Project not found. Pass ?project=<id>' });
  }

  const app = express();
  app.use(express.static(join(__dirname, 'public')));

  // ─── Project list ─────────────────────────────────────────────────────────
  app.get('/api/projects', (_req, res) => {
    res.json(projects.map((p) => {
      const db = dbs.get(p.id);
      const stats = db ? db.getStats() : { nodeCount: 0, edgeCount: 0 };
      return toPublicProject(p, stats);
    }));
  });

  // ─── Native folder picker ─────────────────────────────────────────────────
  app.get('/api/browse', (_req, res) => {
    try {
      let picked: string;
      if (process.platform === 'darwin') {
        picked = execSync(`osascript -e 'POSIX path of (choose folder with prompt "Select project folder")'`).toString().trim();
      } else if (process.platform === 'linux') {
        picked = (
          execSync(`zenity --file-selection --directory 2>/dev/null || kdialog --getexistingdirectory 2>/dev/null`).toString().trim()
        );
      } else {
        res.status(501).json({ error: 'Folder picker not supported on this platform' }); return;
      }
      res.json({ path: picked.replace(/\/$/, '') });
    } catch { res.json({ path: null }); }
  });

  // ─── Register project at runtime ─────────────────────────────────────────
  app.post('/api/projects', express.json(), async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const nameOverride = String(body?.name ?? '').trim() || undefined;
    if (!nameOverride) { res.status(400).json({ error: 'name required' }); return; }
    try {
      const rawSources = body?.docSources;
      const rawCodeSources = body?.codeSources;
      const rawVisualDocs = body?.visualDocs;
      const docSources = Array.isArray(rawSources) ? (rawSources as DocSourceConfig[]) : [];
      const codeSources = Array.isArray(rawCodeSources) ? (rawCodeSources as CodeSourceConfig[]) : [];
      const visualDocs = rawVisualDocs && typeof rawVisualDocs === 'object' ? (rawVisualDocs as Partial<VisualDocsConfig>) : undefined;
      const entry = await registerProject('', docSources, visualDocs, nameOverride, codeSources);
      if (!dbs.has(entry.id)) {
        const db = new GraphDB(CENTRAL_DB_PATH, entry.id);
        await db.init();
        dbs.set(entry.id, db);
        projects.push(entry);
      }
      const db = dbs.get(entry.id)!;
      const stats = db.getStats();
      res.json(toPublicProject(entry, stats));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Remove project at runtime ───────────────────────────────────────────
  app.delete('/api/projects/:id', async (req, res) => {
    const id = req.params['id'];
    try {
      await unregisterProject(id);
      const db = dbs.get(id);
      if (db) { db.close(); dbs.delete(id); }
      const idx = projects.findIndex((p) => p.id === id);
      if (idx !== -1) projects.splice(idx, 1);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Update project config ────────────────────────────────────────────────
  app.patch('/api/projects/:id', express.json(), async (req, res) => {
    const id = req.params['id'];
    const body = req.body as { name?: string; code?: string; docSources?: DocSourceConfig[]; codeSources?: CodeSourceConfig[]; visualDocs?: Partial<VisualDocsConfig> };
    try {
      const updated = await updateProject(id, body);
      if (!updated) { res.status(404).json({ error: 'Project not found' }); return; }

      const oldDb = dbs.get(id);
      if (oldDb) { oldDb.close(); dbs.delete(id); }
      const idx = projects.findIndex((p) => p.id === id);
      if (idx !== -1) projects.splice(idx, 1);

      const newDb = new GraphDB(CENTRAL_DB_PATH, updated.id);
      await newDb.init();
      dbs.set(updated.id, newDb);
      projects.push(updated);

      const stats = newDb.getStats();
      res.json(toPublicProject(updated, stats));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Index project ────────────────────────────────────────────────────────
  app.post('/api/index', async (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const id = String(req.query['project'] ?? projects[0]?.id ?? '');
    const proj = projects.find((p) => p.id === id);
    if (!proj) { err404(res); return; }
    const delta = req.query['delta'] === 'true';
    try {
      const summary = await runIndex(db, {
        includeDocs: true,
        delta,
        docSources: proj.docSources?.length ? proj.docSources : undefined,
        codeSources: proj.codeSources?.length ? proj.codeSources : undefined,
      });
      res.json(summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.startsWith('No Code Sources') || msg.startsWith('No Doc Sources') ? 400 : 500).json({ error: msg });
    }
  });

  // ─── Index all projects ───────────────────────────────────────────────────
  app.post('/api/index-all', async (req, res) => {
    const delta = req.query['delta'] === 'true';
    try {
      const results = [];
      for (const proj of projects) {
        const db = dbs.get(proj.id);
        if (!db) continue;
        const summary = await runIndex(db, {
          includeDocs: true,
          delta,
          docSources: proj.docSources?.length ? proj.docSources : undefined,
          codeSources: proj.codeSources?.length ? proj.codeSources : undefined,
        });
        results.push({ id: proj.id, name: proj.name, summary });
      }
      res.json(results);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.startsWith('No Code Sources') || msg.startsWith('No Doc Sources') ? 400 : 500).json({ error: msg });
    }
  });

  // ─── MCP config ───────────────────────────────────────────────────────────
  app.get('/api/mcp-config', (req, res) => {
    const id = String(req.query['project'] ?? projects[0]?.id ?? '');
    const proj = projects.find((p) => p.id === id);
    if (!proj) { err404(res); return; }
    const cliPath = process.argv[1];
    const db = dbs.get(id) ?? null;
    res.json({
      cliPath,
      claudeDesktop: { mcpServers: { knowsync: { command: 'node', args: [cliPath, 'mcp'] } } },
      cursor: { mcpServers: { knowsync: { command: 'node', args: [cliPath, 'mcp'] } } },
      windsurf: { mcpServers: { knowsync: { command: 'node', args: [cliPath, 'mcp'] } } },
      parseRules: db ? db.getParseRules() : [],
      parseArtifacts: db ? db.getParseArtifacts() : [],
    });
  });

  // ─── Provide parse rules (import) ────────────────────────────────────────
  app.post('/api/provide-parse-rules', express.json(), async (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    try {
      const result = provideParseRules(db, req.body);
      res.json(result);
    } catch (e) { res.status(400).json({ error: String(e) }); }
  });

  // ─── Validate parse rules (preview against project files) ────────────────
  app.post('/api/validate-parse-rules', express.json(), async (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const proj = projects.find((p) => p.id === (String(req.query['project'] ?? projects[0]?.id ?? '')));
    if (!proj) { err404(res); return; }
    const { language, filePaths, rules: inlineRules, queryPacks: inlineQueryPacks, artifacts: inlineArtifacts } = req.body as {
      language: string; filePaths?: string[];
      rules?: unknown[]; queryPacks?: unknown[]; artifacts?: unknown[];
    };
    if (!language) { res.status(400).json({ error: 'language required' }); return; }
    try {
      // Use inline rules/artifacts if provided (pre-import validation), otherwise fall back to stored rules
      let rulesForPreview: Parameters<typeof previewParseRules>[1]['rules'];
      let artifactsForPreview: Parameters<typeof previewParseRules>[1]['artifacts'];
      if (inlineRules || inlineQueryPacks) {
        // Flatten queryPacks into rules with packName set
        const flatRules: Parameters<typeof previewParseRules>[1]['rules'] = [];
        for (const r of (inlineRules || []) as Record<string, unknown>[]) {
          flatRules.push({ name: r['name'] as string, ruleType: r['ruleType'] as 'node' | 'edge' | 'resolve' | 'linking' | 'doc_link', query: r['query'] as string, packName: r['packName'] as string | undefined, nodeType: r['nodeType'] as string | undefined, edgeType: r['edgeType'] as string | undefined, nameCapture: r['nameCapture'] as string | undefined, sourceCapture: r['sourceCapture'] as string | undefined, targetCapture: r['targetCapture'] as string | undefined, docCapture: r['docCapture'] as string | undefined, symbolCapture: r['symbolCapture'] as string | undefined, priority: r['priority'] as number | undefined });
        }
        for (const pack of (inlineQueryPacks || []) as Record<string, unknown>[]) {
          for (const r of (pack['rules'] || []) as Record<string, unknown>[]) {
            flatRules.push({ name: r['name'] as string, ruleType: r['ruleType'] as 'node' | 'edge' | 'resolve' | 'linking' | 'doc_link', query: r['query'] as string, packName: pack['name'] as string, nodeType: r['nodeType'] as string | undefined, edgeType: r['edgeType'] as string | undefined, nameCapture: r['nameCapture'] as string | undefined, sourceCapture: r['sourceCapture'] as string | undefined, targetCapture: r['targetCapture'] as string | undefined, docCapture: r['docCapture'] as string | undefined, symbolCapture: r['symbolCapture'] as string | undefined, priority: r['priority'] as number | undefined });
          }
        }
        rulesForPreview = flatRules;
        artifactsForPreview = inlineArtifacts as Parameters<typeof previewParseRules>[1]['artifacts'];
      } else {
        const storedRules = db.getParseRules(language);
        const storedArtifacts = db.getParseArtifacts(language);
        rulesForPreview = storedRules.map((r) => ({
          name: r.name, ruleType: r.ruleType as 'node' | 'edge' | 'resolve' | 'linking' | 'doc_link',
          query: r.query, packName: r.packName, nodeType: r.nodeType, edgeType: r.edgeType,
          nameCapture: r.nameCapture, sourceCapture: r.sourceCapture, targetCapture: r.targetCapture,
          docCapture: r.docCapture, symbolCapture: r.symbolCapture, priority: r.priority,
        }));
        artifactsForPreview = storedArtifacts as Parameters<typeof previewParseRules>[1]['artifacts'];
      }
      const result = await previewParseRules(db, {
        codeSources: proj.codeSources,
        language,
        filePaths,
        limit: 3,
        matchDetails: true,
        rules: rulesForPreview,
        artifacts: artifactsForPreview,
      });
      res.json(result);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── RuleSets CRUD ────────────────────────────────────────────────────────
  app.get('/api/rule-sets', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    try {
      const language = req.query['language'] as string | undefined;
      const sets = db.listAllRuleSets(language ? { language } : undefined);
      res.json(sets);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post('/api/rule-sets', express.json(), (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const body = req.body as Record<string, unknown>;
    const name = String(body?.name ?? '').trim();
    const language = String(body?.language ?? '').trim();
    if (!name || !language) { res.status(400).json({ error: 'name and language required' }); return; }
    try {
      const id = `rs:${db.projectId}:${language}:${name.toLowerCase().replace(/\s+/g, '_')}:${Date.now()}`;
      const rs = db.createRuleSet({
        id, name, language,
        description: String(body?.description ?? ''),
        version: String(body?.version ?? '1.0.0'),
        isGlobal: Boolean(body?.isGlobal),
        parentId: (body?.parentId as string | null | undefined) ?? null,
        grammarWasmUrl: String(body?.grammarWasmUrl ?? ''),
      });
      res.json(rs);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get('/api/rule-sets/:id', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const rs = db.getRuleSet(req.params['id']);
    if (!rs) { err404(res); return; }
    const rules = db.getRuleSetRules(rs.id);
    const artifacts = db.getRuleSetArtifacts(rs.id);
    const links = db.listRuleLinks(rs.id);
    res.json({ ...rs, rules, artifacts, links });
  });

  app.get('/api/rule-sets/:id/resolved', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const resolved = db.getResolvedRuleSet(req.params['id']);
    if (!resolved) { err404(res); return; }
    res.json(resolved);
  });

  app.patch('/api/rule-sets/:id', express.json(), (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const rs = db.getRuleSet(req.params['id']);
    if (!rs) { err404(res); return; }
    const body = req.body as Record<string, unknown>;
    try {
      db.updateRuleSet(req.params['id'], {
        name: body?.name !== undefined ? String(body.name) : undefined,
        description: body?.description !== undefined ? String(body.description) : undefined,
        version: body?.version !== undefined ? String(body.version) : undefined,
        parentId: 'parentId' in body ? (body.parentId as string | null) : undefined,
        grammarWasmUrl: body?.grammarWasmUrl !== undefined ? String(body.grammarWasmUrl) : undefined,
      });
      res.json(db.getRuleSet(req.params['id']));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.delete('/api/rule-sets/:id', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    try { db.deleteRuleSet(req.params['id']); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post('/api/rule-sets/:id/fork', express.json(), (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const body = req.body as Record<string, unknown>;
    const newName = String(body?.name ?? '').trim() || 'Fork';
    try {
      const sourceId = req.params['id'];
      const newId = `rs:${db.projectId}:fork:${newName.toLowerCase().replace(/\s+/g, '_')}:${Date.now()}`;
      const forked = db.forkRuleSet(sourceId, newId, newName);
      if (!forked) { err404(res); return; }
      res.json(forked);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post('/api/rule-sets/:id/assign-rules', express.json(), (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const body = req.body as { ruleIds?: string[]; artifactIds?: string[] };
    try {
      for (const ruleId of (body.ruleIds ?? [])) db.assignRuleToSet(ruleId, req.params['id']);
      for (const artifactId of (body.artifactIds ?? [])) db.assignArtifactToSet(artifactId, req.params['id']);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── RuleLinks CRUD ───────────────────────────────────────────────────────
  app.get('/api/rule-links', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const ruleSetId = req.query['ruleSetId'] as string;
    if (!ruleSetId) { res.status(400).json({ error: 'ruleSetId required' }); return; }
    try { res.json(db.listRuleLinks(ruleSetId)); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.post('/api/rule-links', express.json(), (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const body = req.body as Record<string, unknown>;
    const sourceId = String(body?.sourceId ?? '').trim();
    const targetId = String(body?.targetId ?? '').trim();
    const linkType = String(body?.linkType ?? 'inherit') as 'inherit' | 'override' | 'inject';
    if (!sourceId || !targetId) { res.status(400).json({ error: 'sourceId and targetId required' }); return; }
    try {
      const id = `rl:${sourceId}:${targetId}:${linkType}`;
      const link = db.createRuleLink({ id, sourceId, targetId, linkType });
      res.json(link);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.delete('/api/rule-links/:id', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    try { db.deleteRuleLink(req.params['id']); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Graph data ───────────────────────────────────────────────────────────
  app.get('/api/graph', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    try {
      const nodes = db.getAllNodes();
      const edges = db.getAllEdges();
      res.json({
        nodes: nodes.map((n) => ({
          id: n.id, label: n.name, type: n.type,
          file: n.filePath, cluster: n.clusterId ?? '',
          startLine: n.startLine, endLine: n.endLine,
          signature: n.signature ?? '', docString: n.docString ?? '',
        })),
        edges: edges.map((e) => ({
          id: e.id, source: e.sourceId, target: e.targetId, type: e.type,
        })),
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Search ───────────────────────────────────────────────────────────────
  app.get('/api/search', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const q = String(req.query['q'] ?? '').trim();
    const limit = Math.min(Number(req.query['limit'] ?? 30), 100);
    if (!q) { res.json({ symbols: [], docs: [] }); return; }
    try { res.json(searchGraph(db, { query: q, limit })); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Symbol detail ────────────────────────────────────────────────────────
  app.get('/api/symbol', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const name = String(req.query['name'] ?? '').trim();
    if (!name) { res.json(null); return; }
    try {
      const symbols = db.getSymbolByName(name);
      if (!symbols.length) { res.json(null); return; }
      const sym = symbols[0];
      res.json({
        symbol: sym,
        callers: db.getCallers(sym.id),
        callees: db.getCallees(sym.id, 1).map((c) => c.node),
        linkedDocs: db.getLinkedDocs(sym.id),
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Impact ───────────────────────────────────────────────────────────────
  app.get('/api/impact', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const name = String(req.query['name'] ?? '').trim();
    const depth = Math.min(Number(req.query['depth'] ?? 2), 5);
    if (!name) { res.json({ directlyAffected: [], transitivelyAffected: [], linkedDocs: [] }); return; }
    try { res.json(getImpact(db, { symbolName: name, depth })); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Flow ─────────────────────────────────────────────────────────────────
  app.get('/api/flow', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const entry = String(req.query['entry'] ?? '').trim();
    const depth = Math.min(Number(req.query['depth'] ?? 5), 10);
    if (!entry) { res.json(null); return; }
    try { res.json(getProcessFlow(db, { entryPoint: entry, maxDepth: depth })); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get('/api/doc-flow', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const query = String(req.query['query'] ?? '').trim();
    const maxDocDepth = Math.min(Number(req.query['docDepth'] ?? 3), 6);
    const maxCodeDepth = Math.min(Number(req.query['codeDepth'] ?? 5), 10);
    if (!query) { res.json(null); return; }
    try { res.json(getDocFlowTrace(db, { query, maxDocDepth, maxCodeDepth })); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Module ───────────────────────────────────────────────────────────────
  app.get('/api/module', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const pattern = String(req.query['pattern'] ?? '').trim();
    if (!pattern) { res.json(null); return; }
    try { res.json(getModuleOverview(db, { moduleName: pattern })); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Doc sync ─────────────────────────────────────────────────────────────
  app.get('/api/docsync', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const name = String(req.query['name'] ?? '').trim();
    if (!name) { res.json(null); return; }
    try { res.json(checkDocSync(db, { symbolName: name })); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Doc subgraph ─────────────────────────────────────────────────────────
  app.get('/api/doc-graph', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const id = String(req.query['project'] ?? projects[0]?.id ?? '');
    const proj = projects.find((p) => p.id === id);
    const pattern = String(req.query['pattern'] ?? '').trim();
    const includeAllCode = String(req.query['includeAllCode'] ?? '1') !== '0';
    try {
      // docSources: registry is primary, DB-persisted (from MCP) is fallback
      const registrySources: DocSourceConfig[] = proj?.docSources ?? [];
      const dbSources = db.getProjectConfig<DocSourceConfig[]>('docSources') ?? [];
      const docSources: DocSourceConfig[] = registrySources.length ? registrySources : dbSources;

      const visualDocs = db.getProjectConfig<VisualDocsConfig>('visualDocs');

      // Collect excludeFiles and path prefixes from docSources
      const excludeFileSuffixes = [...new Set(
        docSources.flatMap((ds) => ds.excludeFiles ?? [])
      )];
      // Resolve each docSource path to an absolute prefix for SQL matching.
      // browseFor() returns absolute paths; MCP/manual entry may be relative.
      const includePathPrefixes = docSources.length
        ? docSources.map((ds) => {
          const cleaned = ds.path
            .replace(/\/\*\*.*$/, '')
            .replace(/\*.*$/, '')
            .replace(/\/$/, '')
            .trim();
          if (!cleaned) return '';
          return cleaned;
        }).filter(Boolean)
        : [];

      const { docSections, symbols, edges } = db.getDocSubgraph(
        pattern || undefined,
        { includeAllCode, excludeFileSuffixes, includePathPrefixes },
      );

      // Sort docSources longest-path-first so most specific label wins
      const sortedSources = [...docSources].sort((a, b) => b.path.length - a.path.length);
      /**
       * Auto-documented structural element.
       */
      function resolveDocSource(filePath: string): DocSourceConfig | null {
        for (const ds of sortedSources) {
          if (filePath.includes(`/${ds.path}/`) || filePath.includes(`/${ds.path}`)) return ds;
        }
        return null;
      }

      const orderedDocSources = [...docSources].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

      const embeddedDocRegions = buildEmbeddedDocRegions(docSections);
      res.json({
        nodes: [
          ...docSections.map((d) => {
            const ds = resolveDocSource(d.filePath);
            return {
              id: d.id, label: d.heading, type: 'DocSection',
              file: d.filePath, startLine: d.startLine, endLine: d.endLine,
              content: d.content, slug: d.slug ?? '', headingLevel: d.headingLevel ?? 1,
              sourceArtifact: d.metadata?.['sourceArtifact'] ?? null,
              docSetLabel: ds?.label ?? null,
              docSetColor: ds?.color ?? null,
            };
          }),
          ...symbols.map((s) => ({
            id: s.id, label: s.name, type: s.type,
            file: s.filePath, startLine: s.startLine, endLine: s.endLine,
            signature: s.signature ?? '', docString: s.docString ?? '',
            cluster: s.clusterId ?? '', content: '',
            docSetLabel: null, docSetColor: null,
          })),
        ],
        embeddedDocRegions,
        edges: edges.map((e) => ({ id: e.id, source: e.sourceId, target: e.targetId, type: e.type })),
        docSources: orderedDocSources,
        visualDocsConfig: visualDocs ?? null,
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get('/api/doc-neighborhood', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const docSectionId = String(req.query['docSectionId'] ?? '').trim();
    const docSectionIdsRaw = String(req.query['docSectionIds'] ?? '').trim();
    const focusDocId = String(req.query['focusDocId'] ?? '').trim() || null;
    const includeCodeContext = String(req.query['includeCodeContext'] ?? '0') === '1';
    if (!docSectionId && !docSectionIdsRaw) { res.status(400).json({ error: 'docSectionId or docSectionIds required' }); return; }
    try {
      const data = docSectionIdsRaw
        ? db.getDocNeighborhoodForIds(
            docSectionIdsRaw.split(',').map((id) => id.trim()).filter(Boolean),
            { includeCodeContext, focusDocId },
          )
        : db.getDocNeighborhood(docSectionId, { includeCodeContext });
      const { docSections, focusDocId: resolvedFocusDocId, symbols, edges } = data;
      if (!docSections.length || !resolvedFocusDocId) { res.status(404).json({ error: 'Doc section not found' }); return; }
      res.json({
        focusDocId: resolvedFocusDocId,
        nodes: [
          ...docSections.map((docSection) => ({
            id: docSection.id,
            label: docSection.heading,
            type: 'DocSection',
            file: docSection.filePath,
            startLine: docSection.startLine,
            endLine: docSection.endLine,
            content: docSection.content,
            slug: docSection.slug ?? '',
            headingLevel: docSection.headingLevel ?? 1,
            sourceArtifact: docSection.metadata?.['sourceArtifact'] ?? null,
          })),
          ...symbols.map((s) => ({
            id: s.id,
            label: s.name,
            type: s.type,
            file: s.filePath,
            startLine: s.startLine,
            endLine: s.endLine,
            signature: s.signature ?? '',
            docString: s.docString ?? '',
            cluster: s.clusterId ?? '',
            content: '',
          })),
        ],
        edges: edges.map((e) => ({ id: e.id, source: e.sourceId, target: e.targetId, type: e.type })),
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get('/api/architecture-export', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    try {
      const result = resolveArchitectureExportRequest(db, {
        format: String(req.query['format'] ?? 'mermaid'),
        viewType: String(req.query['viewType'] ?? 'component'),
        docSectionId: String(req.query['docSectionId'] ?? '').trim() || undefined,
        docSectionIds: String(req.query['docSectionIds'] ?? '').trim() || undefined,
        focusDocId: String(req.query['focusDocId'] ?? '').trim() || undefined,
        includeCodeContext: String(req.query['includeCodeContext'] ?? '0'),
      });
      res.status(result.status).json(result.body);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Scan doc sources ─────────────────────────────────────────────────────
  app.get('/api/doc-sources/scan', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const id = String(req.query['project'] ?? projects[0]?.id ?? '');
    const proj = projects.find((p) => p.id === id);
    if (!proj) { err404(res); return; }
    try {
      const result = scanDocSources(db, {
        seedPaths: [...(proj.docSources ?? []), ...(proj.codeSources ?? [])].map((source) => source.path.trim()).filter(Boolean),
      });
      res.json(result);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Set visual docs config (no re-index) ─────────────────────────────────
  app.patch('/api/visual-docs-config', express.json(), (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const id = String(req.query['project'] ?? projects[0]?.id ?? '');
    const proj = projects.find((p) => p.id === id);
    if (!proj) { err404(res); return; }
    const body = req.body as { docSources?: DocSourceConfig[]; visualDocs?: Partial<VisualDocsConfig> };
    try {
      const result = setVisualDocsConfig(db, body);
      res.json(result);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Validate ─────────────────────────────────────────────────────────────
  app.get('/api/validate', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    try {
      const undocumented = db.searchSymbols('', 5000).filter((s) => {
        if (!['Function', 'Class', 'Method'].includes(s.type)) return false;
        if (s.docString) return false;
        return db.getLinkedDocs(s.id).length === 0;
      });
      res.json({ total: undocumented.length, undocumented });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get('/api/health-dashboard', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    try {
      res.json(db.getHealthDashboard());
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  /**
   * Auto-documented structural element.
   */
  function buildEmbeddedDocRegions(docSections: Array<{
    id: string;
    filePath: string;
    heading: string;
    headingLevel: number;
    content: string;
    startLine: number;
    endLine: number;
    metadata?: Record<string, unknown>;
  }>) {
    const grouped = new Map<string, {
      sourceArtifact: Record<string, unknown>; sections: Array<{
        id: string;
        heading: string;
        headingLevel: number;
        filePath: string;
        startLine: number;
        endLine: number;
        contentPreview: string;
        sourceArtifact?: Record<string, unknown>;
        parentHeading?: string;
        path: string[];
        children: Array<unknown>;
      }>
    }>();

    for (const doc of docSections) {
      const sourceArtifact = doc.metadata?.['sourceArtifact'] as Record<string, unknown> | undefined;
      if (!sourceArtifact || sourceArtifact['targetLanguage'] !== 'markdown') continue;
      const regionId = String(sourceArtifact['regionId'] ?? '');
      if (!regionId) continue;
      const section = {
        id: doc.id,
        heading: doc.heading,
        headingLevel: doc.headingLevel,
        filePath: doc.filePath,
        startLine: doc.startLine,
        endLine: doc.endLine,
        contentPreview: doc.content.slice(0, 240),
        sourceArtifact,
        path: [doc.heading],
        children: [] as Array<unknown>,
      };
      const current = grouped.get(regionId);
      if (current) {
        current.sections.push(section);
      } else {
        grouped.set(regionId, { sourceArtifact, sections: [section] });
      }
    }

    return Array.from(grouped.entries()).map(([regionId, group]) => ({
      id: regionId,
      heading: String(group.sourceArtifact['name'] ?? 'Embedded Markdown Region'),
      sourceArtifact: group.sourceArtifact,
      roots: buildTree(group.sections),
    }));
  }

  /**
   * Auto-documented structural element.
   */
  function buildTree(nodes: Array<{
    id: string;
    heading: string;
    headingLevel: number;
    filePath: string;
    startLine: number;
    endLine: number;
    contentPreview: string;
    sourceArtifact?: Record<string, unknown>;
    parentHeading?: string;
    path: string[];
    children: Array<unknown>;
  }>) {
    const roots: Array<unknown> = [];
    const stack: Array<{
      id: string;
      heading: string;
      headingLevel: number;
      filePath: string;
      startLine: number;
      endLine: number;
      contentPreview: string;
      sourceArtifact?: Record<string, unknown>;
      parentHeading?: string;
      path: string[];
      children: Array<unknown>;
    }> = [];
    const sorted = [...nodes].sort((a, b) =>
      a.startLine - b.startLine || a.headingLevel - b.headingLevel || a.endLine - b.endLine || a.id.localeCompare(b.id)
    );

    for (const node of sorted) {
      const current = { ...node, children: [] as Array<unknown>, path: [node.heading] };
      while (stack.length > 0 && stack[stack.length - 1].headingLevel >= current.headingLevel) {
        stack.pop();
      }
      const parent = stack.at(-1);
      if (parent) {
        current.parentHeading = parent.heading;
        current.path = [...parent.path, node.heading];
        parent.children.push(current);
      } else {
        current.parentHeading = undefined;
        roots.push(current);
      }
      stack.push(current);
    }

    return roots;
  }

  // ─── Suggest doc links ────────────────────────────────────────────────────
  app.get('/api/suggest-links', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const name = String(req.query['name'] ?? '').trim();
    const docSectionId = String(req.query['docSectionId'] ?? '').trim();
    if (!name && !docSectionId) { res.json([]); return; }
    try { res.json(suggestDocLinks(db, { symbolName: name || undefined, docSectionId: docSectionId || undefined }) ?? []); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Create doc link (+ mark) ─────────────────────────────────────────────
  app.post('/api/create-doc-link', express.json(), (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const { docSectionId, symbolName } = req.body as { docSectionId: string; symbolName: string };
    if (!docSectionId || !symbolName) { res.status(400).json({ error: 'docSectionId and symbolName required' }); return; }
    try {
      const result = createDocLink(db, { docSectionId, symbolName });
      let markId: string | undefined;
      if (result.ok && !result.error?.includes('already exists')) {
        const section = db.getDocSectionById(docSectionId);
        const symbols = db.getSymbolByName(symbolName);
        if (section && symbols.length) {
          const sym = symbols[0];
          markId = db.addDocLinkMark({
            docSectionId: section.id, docHeading: section.heading, docFilePath: section.filePath,
            symbolId: sym.id, symbolName: sym.name, symbolFilePath: sym.filePath,
            action: 'link',
          });
        }
      }
      res.json({ ...result, markId });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Validate doc -> doc annotation ──────────────────────────────────────
  app.post('/api/validate-doc-ref', express.json(), (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const { docSectionQuery, docRef } = req.body as { docSectionQuery: string; docRef: string };
    if (!docSectionQuery || !docRef) { res.status(400).json({ error: 'docSectionQuery and docRef required' }); return; }
    try {
      const source = findDocSectionByQuery(db, docSectionQuery);
      if (!source) { res.status(404).json({ error: 'Source DocSection not found' }); return; }
      const resolved = resolveDocRefAgainstGraph(db, source.filePath, docRef);
      if (!resolved) { res.status(400).json({ error: 'Doc ref is invalid or target DocSection was not found' }); return; }
      res.json({
        ok: true,
        source: {
          id: source.id,
          heading: source.heading,
          filePath: source.filePath,
          slug: source.slug,
        },
        target: {
          id: resolved.targetSectionId,
          heading: resolved.targetHeading,
          filePath: resolved.targetFilePath,
          slug: resolved.targetSlug,
        },
        normalizedRef: resolved.normalizedRef,
        canonicalRef: resolved.canonicalRef,
        annotationText: resolved.annotationText,
        wikiAnnotationText: resolved.wikiAnnotationText,
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Create doc -> doc mark (+ manual REFERENCES_DOC edge) ──────────────
  app.post('/api/create-doc-ref-mark', express.json(), (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const { docSectionId, docRef } = req.body as { docSectionId: string; docRef: string };
    if (!docSectionId || !docRef) { res.status(400).json({ error: 'docSectionId and docRef required' }); return; }
    try {
      const source = db.getDocSectionById(docSectionId);
      if (!source) { res.status(404).json({ error: 'Source DocSection not found' }); return; }
      const resolved = resolveDocRefAgainstGraph(db, source.filePath, docRef);
      if (!resolved) { res.status(400).json({ error: 'Doc ref is invalid or target DocSection was not found' }); return; }
      const edgeId = `${source.id}->REFERENCES_DOC->${resolved.targetSectionId}`;
      if (!db.hasEdge(source.id, resolved.targetSectionId)) {
        db.createManualEdge({
          id: edgeId,
          type: 'REFERENCES_DOC',
          sourceId: source.id,
          targetId: resolved.targetSectionId,
        });
      }
      const markId = db.addDocDocLinkMark({
        docSectionId: source.id,
        docHeading: source.heading,
        docFilePath: source.filePath,
        targetDocSectionId: resolved.targetSectionId,
        targetDocHeading: resolved.targetHeading,
        targetDocFilePath: resolved.targetFilePath,
        targetDocSlug: resolved.targetSlug,
        annotationText: resolved.annotationText,
        wikiAnnotationText: resolved.wikiAnnotationText,
        action: 'link',
      });
      res.json({
        ok: true,
        edgeId,
        markId,
        source: {
          id: source.id,
          heading: source.heading,
          filePath: source.filePath,
          slug: source.slug,
        },
        target: {
          id: resolved.targetSectionId,
          heading: resolved.targetHeading,
          filePath: resolved.targetFilePath,
          slug: resolved.targetSlug,
        },
        annotationText: resolved.annotationText,
        wikiAnnotationText: resolved.wikiAnnotationText,
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Unlink doc ───────────────────────────────────────────────────────────
  app.post('/api/unlink-doc', express.json(), (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const { docSectionId, symbolId } = req.body as { docSectionId: string; symbolId: string };
    if (!docSectionId || !symbolId) { res.status(400).json({ error: 'docSectionId and symbolId required' }); return; }
    try {
      const edgeId = `${docSectionId}->REFERENCES->${symbolId}`;
      db.deleteEdgeById(edgeId);
      // Also try DOCUMENTED_BY and EXPLAINS_FLOW variants
      db.deleteEdgeById(`${docSectionId}->DOCUMENTED_BY->${symbolId}`);
      db.deleteEdgeById(`${docSectionId}->EXPLAINS_FLOW->${symbolId}`);
      const section = db.getDocSectionById(docSectionId);
      const sym = db.getSymbolById(symbolId);
      let markId: string | undefined;
      if (section && sym) {
        markId = db.addDocLinkMark({
          docSectionId: section.id, docHeading: section.heading, docFilePath: section.filePath,
          symbolId: sym.id, symbolName: sym.name, symbolFilePath: sym.filePath,
          action: 'unlink',
        });
      }
      res.json({ ok: true, markId });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Doc link marks ───────────────────────────────────────────────────────
  app.get('/api/doc-link-marks', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const onlyUnresolved = String(req.query['resolved'] ?? '0') !== '1';
    try { res.json(db.getDocLinkMarks(onlyUnresolved)); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.patch('/api/doc-link-marks/:id/resolve', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const markId = decodeURIComponent(req.params['id']);
    try { res.json({ resolved: db.resolveDocLinkMark(markId) }); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Symbol by ID ─────────────────────────────────────────────────────────
  app.get('/api/symbol-by-id', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const id = String(req.query['id'] ?? '').trim();
    if (!id) { res.json(null); return; }
    try {
      const sym = db.getSymbolById(id);
      if (!sym) { res.json(null); return; }
      res.json({
        symbol: sym,
        callers: db.getCallers(sym.id),
        callees: db.getCallees(sym.id, 1).map((c) => c.node),
        linkedDocs: db.getLinkedDocs(sym.id),
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── All doc links ────────────────────────────────────────────────────────
  app.get('/api/all-links', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    try { res.json(db.getAllDocLinks()); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Doc section detail / layers ─────────────────────────────────────────
  app.get('/api/doc-section', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    const query = String(req.query['query'] ?? '').trim();
    if (!query) { res.status(400).json({ error: 'query required' }); return; }
    try {
      const section = findDocSectionByQuery(db, query);
      if (!section) { res.status(404).json({ error: 'Doc section not found' }); return; }

      const relatedDocs = db.getRelatedDocs(section.id);
      const beforeDocs = relatedDocs
        .filter((item) => item.direction === 'outgoing')
        .map((item) => item.doc);
      const afterDocs = relatedDocs
        .filter((item) => item.direction === 'incoming')
        .map((item) => item.doc);

      res.json({
        section: {
          id: section.id,
          filePath: section.filePath,
          heading: section.heading,
          slug: section.slug,
          startLine: section.startLine,
          endLine: section.endLine,
          linkedDocTargets: section.linkedDocTargets ?? [],
        },
        beforeDocs: beforeDocs.map((item) => ({
          id: item.id,
          heading: item.heading,
          filePath: item.filePath,
          slug: item.slug,
          startLine: item.startLine,
          endLine: item.endLine,
        })),
        afterDocs: afterDocs.map((item) => ({
          id: item.id,
          heading: item.heading,
          filePath: item.filePath,
          slug: item.slug,
          startLine: item.startLine,
          endLine: item.endLine,
        })),
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Pending forward refs ─────────────────────────────────────────────────
  app.get('/api/forward-refs', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    try { res.json(db.getPendingForwardRefs()); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // ─── Validate links ───────────────────────────────────────────────────────
  app.get('/api/validate-links', (req, res) => {
    const db = resolveDb(req);
    if (!db) { err404(res); return; }
    try { res.json(validateLinks(db, {})); }
    catch (e) { res.status(500).json({ error: String(e) }); }
  });

  app.get('*', (_req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  });

  const host = '127.0.0.1';
  const server = app.listen(port, host);
  server.once('listening', () => {
    const url = `http://localhost:${port}`;
    console.log(`  KnowSync UI → ${url}`);
    console.log(`  Projects: ${projects.map((p) => p.name).join(', ')}`);
    try { execSync(`open "${url}"`); } catch { /* non-macOS */ }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('close', resolve);
    server.once('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      reject(new Error(`Failed to start KnowSync UI on ${host}:${port}: ${message}`));
    });
  });
}
