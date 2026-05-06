import Database from 'better-sqlite3';
import { createRequire } from 'module';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { GraphNode, GraphEdge, DocSection, ParseArtifact, ParseRule, RuleSet, ResolvedRuleSet, RuleLink } from '../types/index.js';

const require = createRequire(import.meta.url);

/**
 * @GraphDB persists the KnowSync knowledge graph in SQLite, including symbols,
 * docs, edges, parse rules, parse artifacts, and file-cache state.
 *
 * @doc:../../docs/architecture/06-6-graphdb-schema-ay-u.md#6-graphdb-schema-ay-u
 * @doc:../../docs/architecture/02-2-pipeline-tong-the.md#2-pipeline-tong-the
 *
 * BRD-REQ-001: index code and docs into one local graph.
 * FRD-TRACE-003: preserve stable linking metadata across re-index cycles.
 */
export class GraphDB {
  private dbPath: string;
  private db!: Database.Database;
  readonly projectId: string;

  /**
   * Auto-documented structural element.
   */
  constructor(dbPath: string, projectId: string) {
    this.dbPath = dbPath;
    this.projectId = projectId;
  }

  /**
   * Initializes the SQLite better-sqlite3 database connection and triggers schema deployments.
   * @doc:../../docs/architecture/06-6-graphdb-schema-ay-u.md#wal-mode
   */
  async init(): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true });
    const BetterSqlite3 = require('better-sqlite3') as typeof Database;
    this.db = new BetterSqlite3(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    const hadFts = (this.db.prepare(
      `SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name='symbols_fts'`
    ).get() as { n: number }).n > 0;
    this.createSchema();
    this.migrate(hadFts);
  }

  /**
   * Creates core internal graph structures (tables, indexes, triggers for BM25 FTS5).
   * @doc:../../docs/architecture/06-6-graphdb-schema-ay-u.md#cac-bang-chinh
   */
  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS symbols (
        project_id TEXT NOT NULL,
        id TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        signature TEXT DEFAULT '',
        doc_string TEXT DEFAULT '',
        cluster_id TEXT DEFAULT '',
        metadata_json TEXT DEFAULT '{}',
        PRIMARY KEY (project_id, id)
      );

      CREATE TABLE IF NOT EXISTS doc_sections (
        project_id TEXT NOT NULL,
        id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        heading TEXT NOT NULL,
        slug TEXT DEFAULT '',
        heading_level INTEGER DEFAULT 1,
        content TEXT NOT NULL,
        metadata_json TEXT DEFAULT '{}',
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        PRIMARY KEY (project_id, id)
      );

      CREATE TABLE IF NOT EXISTS edges (
        project_id TEXT NOT NULL,
        id TEXT NOT NULL,
        type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        is_manual INTEGER DEFAULT 0,
        PRIMARY KEY (project_id, id)
      );

      CREATE INDEX IF NOT EXISTS idx_sym_proj_name    ON symbols(project_id, name);
      CREATE INDEX IF NOT EXISTS idx_sym_proj_file    ON symbols(project_id, file_path);
      CREATE INDEX IF NOT EXISTS idx_sym_proj_cluster ON symbols(project_id, cluster_id);
      CREATE INDEX IF NOT EXISTS idx_edge_proj_src    ON edges(project_id, source_id);
      CREATE INDEX IF NOT EXISTS idx_edge_proj_tgt    ON edges(project_id, target_id);
      CREATE INDEX IF NOT EXISTS idx_edge_proj_type   ON edges(project_id, type);
      CREATE INDEX IF NOT EXISTS idx_doc_proj_file    ON doc_sections(project_id, file_path);

      CREATE TABLE IF NOT EXISTS doc_link_marks (
        id           TEXT NOT NULL,
        project_id   TEXT NOT NULL,
        mark_type    TEXT NOT NULL DEFAULT 'doc_symbol',
        doc_section_id   TEXT NOT NULL,
        doc_heading      TEXT NOT NULL DEFAULT '',
        doc_file_path    TEXT NOT NULL DEFAULT '',
        symbol_id        TEXT NOT NULL,
        symbol_name      TEXT NOT NULL DEFAULT '',
        symbol_file_path TEXT NOT NULL DEFAULT '',
        target_doc_section_id TEXT NOT NULL DEFAULT '',
        target_doc_heading    TEXT NOT NULL DEFAULT '',
        target_doc_file_path  TEXT NOT NULL DEFAULT '',
        target_doc_slug       TEXT NOT NULL DEFAULT '',
        annotation_text       TEXT NOT NULL DEFAULT '',
        wiki_annotation_text  TEXT NOT NULL DEFAULT '',
        action       TEXT NOT NULL,
        resolved     INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL,
        PRIMARY KEY (id)
      );
      CREATE INDEX IF NOT EXISTS idx_marks_proj ON doc_link_marks(project_id, resolved);

      CREATE TABLE IF NOT EXISTS file_cache (
        project_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        indexed_at REAL NOT NULL,
        PRIMARY KEY (project_id, file_path)
      );

      CREATE TABLE IF NOT EXISTS parse_rules (
        project_id TEXT NOT NULL,
        id TEXT NOT NULL,
        language TEXT NOT NULL,
        rule_type TEXT NOT NULL,
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        pack_name TEXT DEFAULT '',
        node_type TEXT DEFAULT '',
        edge_type TEXT DEFAULT '',
        name_capture TEXT DEFAULT 'name',
        source_capture TEXT DEFAULT 'source',
        target_capture TEXT DEFAULT 'target',
        doc_capture TEXT DEFAULT 'doc',
        symbol_capture TEXT DEFAULT 'symbol',
        priority INTEGER DEFAULT 0,
        created_at REAL NOT NULL,
        PRIMARY KEY (project_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_rules_proj_lang ON parse_rules(project_id, language);

      CREATE TABLE IF NOT EXISTS parse_artifacts (
        project_id TEXT NOT NULL,
        id TEXT NOT NULL,
        language TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        name TEXT NOT NULL,
        pack_name TEXT DEFAULT '',
        content TEXT DEFAULT '',
        query TEXT DEFAULT '',
        target_language TEXT DEFAULT '',
        range_capture TEXT DEFAULT 'range',
        priority INTEGER DEFAULT 0,
        created_at REAL NOT NULL,
        PRIMARY KEY (project_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_proj_lang ON parse_artifacts(project_id, language);

      CREATE TABLE IF NOT EXISTS rule_sets (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        language TEXT NOT NULL,
        version TEXT DEFAULT '1.0.0',
        is_global INTEGER DEFAULT 0,
        parent_id TEXT REFERENCES rule_sets(id) ON DELETE SET NULL,
        grammar_wasm_url TEXT DEFAULT '',
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rule_sets_proj ON rule_sets(project_id);
      CREATE INDEX IF NOT EXISTS idx_rule_sets_lang ON rule_sets(language);

      CREATE TABLE IF NOT EXISTS rule_links (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES rule_sets(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES rule_sets(id) ON DELETE CASCADE,
        link_type TEXT NOT NULL,
        created_at REAL NOT NULL,
        UNIQUE(source_id, target_id, link_type)
      );

      CREATE TABLE IF NOT EXISTS project_config (
        project_id TEXT NOT NULL,
        key        TEXT NOT NULL,
        value      TEXT NOT NULL,
        PRIMARY KEY (project_id, key)
      );

      CREATE TABLE IF NOT EXISTS parse_rule_refine_sessions (
        project_id TEXT NOT NULL,
        token TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        rounds_remaining INTEGER NOT NULL,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL,
        PRIMARY KEY (project_id, token)
      );
      CREATE INDEX IF NOT EXISTS idx_rule_refine_sessions_proj ON parse_rule_refine_sessions(project_id);

      -- ── FTS5: symbols ────────────────────────────────────────────────────
      CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
        name, signature, doc_string,
        content='symbols', content_rowid='rowid'
      );
      CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
        INSERT INTO symbols_fts(rowid, name, signature, doc_string)
        VALUES (new.rowid, new.name, new.signature, new.doc_string);
      END;
      CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
        INSERT INTO symbols_fts(symbols_fts, rowid, name, signature, doc_string)
        VALUES ('delete', old.rowid, old.name, old.signature, old.doc_string);
      END;
      CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
        INSERT INTO symbols_fts(symbols_fts, rowid, name, signature, doc_string)
        VALUES ('delete', old.rowid, old.name, old.signature, old.doc_string);
        INSERT INTO symbols_fts(rowid, name, signature, doc_string)
        VALUES (new.rowid, new.name, new.signature, new.doc_string);
      END;

      -- ── FTS5: doc_sections ───────────────────────────────────────────────
      CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
        heading, content,
        content='doc_sections', content_rowid='rowid'
      );
      CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON doc_sections BEGIN
        INSERT INTO docs_fts(rowid, heading, content)
        VALUES (new.rowid, new.heading, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON doc_sections BEGIN
        INSERT INTO docs_fts(docs_fts, rowid, heading, content)
        VALUES ('delete', old.rowid, old.heading, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS docs_au AFTER UPDATE ON doc_sections BEGIN
        INSERT INTO docs_fts(docs_fts, rowid, heading, content)
        VALUES ('delete', old.rowid, old.heading, old.content);
        INSERT INTO docs_fts(rowid, heading, content)
        VALUES (new.rowid, new.heading, new.content);
      END;
    `);
  }

  /**
   * Evaluates earlier SQLite table schemas and triggers non-destructive ALTER transformations.
   */
  private migrate(hadFts: boolean): void {
    // project_id column migrations (old per-project DBs or old central DB)
    for (const tbl of ['symbols', 'doc_sections', 'edges', 'parse_rules', 'parse_artifacts'] as const) {
      const cols = (this.db.prepare(`PRAGMA table_info(${tbl})`).all() as Array<{ name: string }>).map((c) => c.name);
      if (!cols.includes('project_id')) {
        this.db.exec(`ALTER TABLE ${tbl} ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
      }
    }
    // file_cache needs composite PK — recreate if missing project_id (loses delta cache)
    const fcCols = (this.db.prepare(`PRAGMA table_info(file_cache)`).all() as Array<{ name: string }>).map((c) => c.name);
    if (!fcCols.includes('project_id')) {
      this.db.exec(`DROP TABLE IF EXISTS file_cache`);
      this.db.exec(`
        CREATE TABLE file_cache (
          project_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          indexed_at REAL NOT NULL,
          PRIMARY KEY (project_id, file_path)
        )
      `);
    }
    // Column additions for older schemas
    const docCols = (this.db.prepare(`PRAGMA table_info(doc_sections)`).all() as Array<{ name: string }>).map((c) => c.name);
    if (!docCols.includes('slug')) this.db.exec(`ALTER TABLE doc_sections ADD COLUMN slug TEXT DEFAULT ''`);
    if (!docCols.includes('heading_level')) this.db.exec(`ALTER TABLE doc_sections ADD COLUMN heading_level INTEGER DEFAULT 1`);
    if (!docCols.includes('metadata_json')) this.db.exec(`ALTER TABLE doc_sections ADD COLUMN metadata_json TEXT DEFAULT '{}'`);
    const symbolCols = (this.db.prepare(`PRAGMA table_info(symbols)`).all() as Array<{ name: string }>).map((c) => c.name);
    if (!symbolCols.includes('metadata_json')) this.db.exec(`ALTER TABLE symbols ADD COLUMN metadata_json TEXT DEFAULT '{}'`);
    const edgeCols = (this.db.prepare(`PRAGMA table_info(edges)`).all() as Array<{ name: string }>).map((c) => c.name);
    if (!edgeCols.includes('is_manual')) this.db.exec(`ALTER TABLE edges ADD COLUMN is_manual INTEGER DEFAULT 0`);
    const ruleCols = (this.db.prepare(`PRAGMA table_info(parse_rules)`).all() as Array<{ name: string }>).map((c) => c.name);
    if (!ruleCols.includes('pack_name')) this.db.exec(`ALTER TABLE parse_rules ADD COLUMN pack_name TEXT DEFAULT ''`);
    if (!ruleCols.includes('doc_capture')) this.db.exec(`ALTER TABLE parse_rules ADD COLUMN doc_capture TEXT DEFAULT 'doc'`);
    if (!ruleCols.includes('symbol_capture')) this.db.exec(`ALTER TABLE parse_rules ADD COLUMN symbol_capture TEXT DEFAULT 'symbol'`);
    if (!ruleCols.includes('rule_set_id')) this.db.exec(`ALTER TABLE parse_rules ADD COLUMN rule_set_id TEXT DEFAULT ''`);
    const artifactCols = (this.db.prepare(`PRAGMA table_info(parse_artifacts)`).all() as Array<{ name: string }>).map((c) => c.name);
    if (!artifactCols.includes('pack_name')) this.db.exec(`ALTER TABLE parse_artifacts ADD COLUMN pack_name TEXT DEFAULT ''`);
    if (!artifactCols.includes('target_language')) this.db.exec(`ALTER TABLE parse_artifacts ADD COLUMN target_language TEXT DEFAULT ''`);
    if (!artifactCols.includes('range_capture')) this.db.exec(`ALTER TABLE parse_artifacts ADD COLUMN range_capture TEXT DEFAULT 'range'`);
    if (!artifactCols.includes('rule_set_id')) this.db.exec(`ALTER TABLE parse_artifacts ADD COLUMN rule_set_id TEXT DEFAULT ''`);
    // rule_sets + rule_links tables (older DBs)
    const hasRuleSets = (this.db.prepare(`SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name='rule_sets'`).get() as { n: number }).n > 0;
    if (!hasRuleSets) {
      this.db.exec(`
        CREATE TABLE rule_sets (
          id TEXT PRIMARY KEY, project_id TEXT, name TEXT NOT NULL, description TEXT DEFAULT '',
          language TEXT NOT NULL, version TEXT DEFAULT '1.0.0', is_global INTEGER DEFAULT 0,
          parent_id TEXT, grammar_wasm_url TEXT DEFAULT '', created_at REAL NOT NULL, updated_at REAL NOT NULL
        );
        CREATE INDEX idx_rule_sets_proj ON rule_sets(project_id);
        CREATE INDEX idx_rule_sets_lang ON rule_sets(language);
        CREATE TABLE rule_links (
          id TEXT PRIMARY KEY, source_id TEXT NOT NULL, target_id TEXT NOT NULL,
          link_type TEXT NOT NULL, created_at REAL NOT NULL,
          UNIQUE(source_id, target_id, link_type)
        );
      `);
    }
    const ruleSetCols = (this.db.prepare(`PRAGMA table_info(rule_sets)`).all() as Array<{ name: string }>).map((c) => c.name);
    if (ruleSetCols.length) {
      if (!ruleSetCols.includes('description')) this.db.exec(`ALTER TABLE rule_sets ADD COLUMN description TEXT DEFAULT ''`);
      if (!ruleSetCols.includes('version')) this.db.exec(`ALTER TABLE rule_sets ADD COLUMN version TEXT DEFAULT '1.0.0'`);
      if (!ruleSetCols.includes('is_global')) this.db.exec(`ALTER TABLE rule_sets ADD COLUMN is_global INTEGER DEFAULT 0`);
      if (!ruleSetCols.includes('parent_id')) this.db.exec(`ALTER TABLE rule_sets ADD COLUMN parent_id TEXT REFERENCES rule_sets(id) ON DELETE SET NULL`);
      if (!ruleSetCols.includes('grammar_wasm_url')) this.db.exec(`ALTER TABLE rule_sets ADD COLUMN grammar_wasm_url TEXT DEFAULT ''`);
      if (!ruleSetCols.includes('updated_at')) this.db.exec(`ALTER TABLE rule_sets ADD COLUMN updated_at REAL NOT NULL DEFAULT 0`);
    }
    const ruleLinkCols = (this.db.prepare(`PRAGMA table_info(rule_links)`).all() as Array<{ name: string }>).map((c) => c.name);
    if (ruleLinkCols.length) {
      if (!ruleLinkCols.includes('created_at')) this.db.exec(`ALTER TABLE rule_links ADD COLUMN created_at REAL NOT NULL DEFAULT 0`);
    }
    // project_config table (older DBs won't have it — createSchema handles IF NOT EXISTS)
    const hasProjConfig = (this.db.prepare(
      `SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name='project_config'`
    ).get() as { n: number }).n > 0;
    if (!hasProjConfig) {
      this.db.exec(`
        CREATE TABLE project_config (
          project_id TEXT NOT NULL,
          key        TEXT NOT NULL,
          value      TEXT NOT NULL,
          PRIMARY KEY (project_id, key)
        )
      `);
    }
    if (!hadFts) {
      this.db.exec(`
        INSERT INTO symbols_fts(rowid, name, signature, doc_string)
        SELECT rowid, name, signature, doc_string FROM symbols;
        INSERT INTO docs_fts(rowid, heading, content)
        SELECT rowid, heading, content FROM doc_sections;
      `);
    }
    // doc_link_marks table (older DBs won't have it)
    const hasMarks = (this.db.prepare(
      `SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name='doc_link_marks'`
    ).get() as { n: number }).n > 0;
    if (!hasMarks) {
      this.db.exec(`
        CREATE TABLE doc_link_marks (
          id TEXT NOT NULL, project_id TEXT NOT NULL,
          mark_type TEXT NOT NULL DEFAULT 'doc_symbol',
          doc_section_id TEXT NOT NULL, doc_heading TEXT NOT NULL DEFAULT '',
          doc_file_path TEXT NOT NULL DEFAULT '',
          symbol_id TEXT NOT NULL, symbol_name TEXT NOT NULL DEFAULT '',
          symbol_file_path TEXT NOT NULL DEFAULT '',
          target_doc_section_id TEXT NOT NULL DEFAULT '',
          target_doc_heading TEXT NOT NULL DEFAULT '',
          target_doc_file_path TEXT NOT NULL DEFAULT '',
          target_doc_slug TEXT NOT NULL DEFAULT '',
          annotation_text TEXT NOT NULL DEFAULT '',
          wiki_annotation_text TEXT NOT NULL DEFAULT '',
          action TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL, PRIMARY KEY (id)
        );
        CREATE INDEX IF NOT EXISTS idx_marks_proj ON doc_link_marks(project_id, resolved);
      `);
    } else {
      const markCols = (this.db.prepare(`PRAGMA table_info(doc_link_marks)`).all() as Array<{ name: string }>).map((c) => c.name);
      if (!markCols.includes('mark_type')) this.db.exec(`ALTER TABLE doc_link_marks ADD COLUMN mark_type TEXT NOT NULL DEFAULT 'doc_symbol'`);
      if (!markCols.includes('target_doc_section_id')) this.db.exec(`ALTER TABLE doc_link_marks ADD COLUMN target_doc_section_id TEXT NOT NULL DEFAULT ''`);
      if (!markCols.includes('target_doc_heading')) this.db.exec(`ALTER TABLE doc_link_marks ADD COLUMN target_doc_heading TEXT NOT NULL DEFAULT ''`);
      if (!markCols.includes('target_doc_file_path')) this.db.exec(`ALTER TABLE doc_link_marks ADD COLUMN target_doc_file_path TEXT NOT NULL DEFAULT ''`);
      if (!markCols.includes('target_doc_slug')) this.db.exec(`ALTER TABLE doc_link_marks ADD COLUMN target_doc_slug TEXT NOT NULL DEFAULT ''`);
      if (!markCols.includes('annotation_text')) this.db.exec(`ALTER TABLE doc_link_marks ADD COLUMN annotation_text TEXT NOT NULL DEFAULT ''`);
      if (!markCols.includes('wiki_annotation_text')) this.db.exec(`ALTER TABLE doc_link_marks ADD COLUMN wiki_annotation_text TEXT NOT NULL DEFAULT ''`);
    }
  }

  /**
   * Upserts a single GraphNode symbol into the 'symbols' table and updates FTS.
   * Node representation contains parsing details like start/end lines and types.
   */
  upsertNode(node: GraphNode): void {
    this.db.prepare(`
      INSERT INTO symbols (project_id, id, type, name, file_path, start_line, end_line, signature, doc_string, cluster_id, metadata_json)
      VALUES (@projectId, @id, @type, @name, @filePath, @startLine, @endLine, @signature, @docString, @clusterId, @metadataJson)
      ON CONFLICT(project_id, id) DO UPDATE SET
        type = excluded.type, name = excluded.name, file_path = excluded.file_path,
        start_line = excluded.start_line, end_line = excluded.end_line,
        signature = excluded.signature, doc_string = excluded.doc_string,
        cluster_id = excluded.cluster_id, metadata_json = excluded.metadata_json
    `).run({
      projectId: this.projectId,
      id: node.id,
      type: node.type,
      name: node.name,
      filePath: node.filePath,
      startLine: node.startLine,
      endLine: node.endLine,
      signature: node.signature ?? '',
      docString: node.docString ?? '',
      clusterId: node.clusterId ?? '',
      metadataJson: JSON.stringify(node.metadata ?? {}),
    });
  }

  /**
   * Upserts an extracted markdown or comment section into the 'doc_sections' table.
   * This also populates the docs FTS5 virtual table for keyword searching.
   * @doc:../../docs/architecture/06-6-graphdb-schema-ay-u.md#doc_sections
   */
  upsertDocSection(section: DocSection): void {
    const metadata = {
      ...(section.metadata ?? {}),
      primarySymbolName: section.primarySymbolName ?? null,
      linkedSymbols: section.linkedSymbols ?? [],
      linkedDocTargets: section.linkedDocTargets ?? [],
      linkedRequirements: section.linkedRequirements ?? [],
    };
    this.db.prepare(`
      INSERT INTO doc_sections (project_id, id, file_path, heading, slug, heading_level, content, metadata_json, start_line, end_line)
      VALUES (@projectId, @id, @filePath, @heading, @slug, @headingLevel, @content, @metadataJson, @startLine, @endLine)
      ON CONFLICT(project_id, id) DO UPDATE SET
        file_path = excluded.file_path, heading = excluded.heading,
        slug = excluded.slug, heading_level = excluded.heading_level,
        content = excluded.content, metadata_json = excluded.metadata_json,
        start_line = excluded.start_line, end_line = excluded.end_line
    `).run({
      projectId: this.projectId,
      id: section.id,
      filePath: section.filePath,
      heading: section.heading,
      slug: section.slug ?? '',
      headingLevel: section.headingLevel ?? 1,
      content: section.content,
      metadataJson: JSON.stringify(metadata),
      startLine: section.startLine,
      endLine: section.endLine,
    });
  }

  /**
   * Creates an automated edge between two graph nodes mapped by parse rules.
   * Automated edges (is_manual=0) are erased during re-indexing of related files.
   */
  upsertEdge(edge: GraphEdge): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO edges (project_id, id, type, source_id, target_id, is_manual)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(this.projectId, edge.id, edge.type, edge.sourceId, edge.targetId);
  }

  /**
   * Creates a manual, human-approved edge representing hard references.
   * Manual edges (is_manual=1) persist across routine re-index cycles.
   */
  createManualEdge(edge: GraphEdge): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO edges (project_id, id, type, source_id, target_id, is_manual)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(this.projectId, edge.id, edge.type, edge.sourceId, edge.targetId);
  }

  /**
   * Purges all symbols, doc sections, and non-manual edges originating from 
   * a specific file path prior to a fresh parse-phase update.
   */
  deleteByFilePath(filePath: string): void {
    const ids = (this.db.prepare(`SELECT id FROM symbols WHERE project_id = ? AND file_path = ?`).all(this.projectId, filePath) as Array<{ id: string }>).map((r) => r.id);
    for (const id of ids) {
      this.db.prepare(`DELETE FROM edges WHERE project_id = ? AND (source_id = ? OR target_id = ?) AND is_manual = 0`).run(this.projectId, id, id);
    }
    this.db.prepare(`DELETE FROM symbols WHERE project_id = ? AND file_path = ?`).run(this.projectId, filePath);

    const docIds = (this.db.prepare(`SELECT id FROM doc_sections WHERE project_id = ? AND file_path = ?`).all(this.projectId, filePath) as Array<{ id: string }>).map((r) => r.id);
    for (const id of docIds) {
      this.db.prepare(`DELETE FROM edges WHERE project_id = ? AND (source_id = ? OR target_id = ?) AND is_manual = 0`).run(this.projectId, id, id);
    }
    this.db.prepare(`DELETE FROM doc_sections WHERE project_id = ? AND file_path = ?`).run(this.projectId, filePath);
  }

  /**
   * Assigns a Louvain community cluster ID to the specified graph node.
   */
  setClusterId(nodeId: string, clusterId: string): void {
    this.db.prepare(`UPDATE symbols SET cluster_id = ? WHERE project_id = ? AND id = ?`).run(clusterId, this.projectId, nodeId);
  }

  /**
   * Fetches symbols strictly matching a provided alphanumeric identifier/name.
   * Optionally filtered by filePath to reduce cross-module ambiguity.
   */
  getSymbolByName(name: string, filePath?: string): GraphNode[] {
    if (filePath) {
      return (this.db.prepare(`SELECT * FROM symbols WHERE project_id = ? AND name = ? AND file_path = ?`).all(this.projectId, name, filePath) as Record<string, unknown>[]).map(rowToNode);
    }
    return (this.db.prepare(`SELECT * FROM symbols WHERE project_id = ? AND name = ?`).all(this.projectId, name) as Record<string, unknown>[]).map(rowToNode);
  }

  /**
   * Looks up an exact symbol by its universal Graph UUID or structural ID.
   */
  getSymbolById(id: string): GraphNode | null {
    const row = this.db.prepare(`SELECT * FROM symbols WHERE project_id = ? AND id = ?`).get(this.projectId, id) as Record<string, unknown> | undefined;
    return row ? rowToNode(row) : null;
  }

  /**
   * Retrieves immediate parent/caller nodes for a given graph symbol (CALLS edges).
   */
  getCallers(targetId: string): GraphNode[] {
    return (this.db.prepare(`
      SELECT s.* FROM symbols s
      JOIN edges e ON e.source_id = s.id
      WHERE e.target_id = ? AND e.type = 'CALLS' AND e.project_id = ? AND s.project_id = ?
    `).all(targetId, this.projectId, this.projectId) as Record<string, unknown>[]).map(rowToNode);
  }

  /**
   * Retrieves all document sections explicitly referencing or documenting a symbol.
   * Based on DOCUMENTED_BY, REFERENCES, or EXPLAINS_FLOW edge types.
   * @doc:../../docs/architecture/16-16-code-doc-link-map.md#docs-code-sau-khi-index
   */
  getLinkedDocs(symbolId: string): DocSection[] {
    return (this.db.prepare(`
      SELECT d.* FROM doc_sections d
      JOIN edges e ON e.source_id = d.id
      WHERE e.target_id = ? AND e.type IN ('DOCUMENTED_BY', 'REFERENCES', 'EXPLAINS_FLOW')
        AND e.project_id = ? AND d.project_id = ?
    `).all(symbolId, this.projectId, this.projectId) as Record<string, unknown>[]).map(rowToDoc);
  }

  /**
   * Retrieves document sections linked to/from a doc section via REFERENCES_DOC.
   * @doc:../../docs/architecture/06-6-graphdb-schema-ay-u.md#node-types-va-edge-types-ang-dung
   */
  getRelatedDocs(docSectionId: string): Array<{
    edgeType: 'REFERENCES_DOC';
    direction: 'outgoing' | 'incoming';
    doc: DocSection;
  }> {
    const outgoingRows = this.db.prepare(`
      SELECT d.*, e.type as edge_type
      FROM edges e
      JOIN doc_sections d ON d.id = e.target_id AND d.project_id = e.project_id
      WHERE e.project_id = ? AND e.source_id = ? AND e.type = 'REFERENCES_DOC'
      ORDER BY d.file_path, d.start_line
    `).all(this.projectId, docSectionId) as Record<string, unknown>[];

    const incomingRows = this.db.prepare(`
      SELECT d.*, e.type as edge_type
      FROM edges e
      JOIN doc_sections d ON d.id = e.source_id AND d.project_id = e.project_id
      WHERE e.project_id = ? AND e.target_id = ? AND e.type = 'REFERENCES_DOC'
      ORDER BY d.file_path, d.start_line
    `).all(this.projectId, docSectionId) as Record<string, unknown>[];

    return [
      ...outgoingRows.map((row) => ({
        edgeType: 'REFERENCES_DOC' as const,
        direction: 'outgoing' as const,
        doc: rowToDoc(row),
      })),
      ...incomingRows.map((row) => ({
        edgeType: 'REFERENCES_DOC' as const,
        direction: 'incoming' as const,
        doc: rowToDoc(row),
      })),
    ];
  }

  /**
   * Traces multi-level doc layering from one section through REFERENCES_DOC edges.
   * direction=outgoing means "before/upstream docs referenced by this section".
   * direction=incoming means "after/downstream docs that reference this section".
   */
  getTransitiveRelatedDocs(
    docSectionId: string,
    maxDepth: number,
    direction: 'outgoing' | 'incoming',
  ): Array<{ depth: number; doc: DocSection }> {
    const seen = new Set<string>([docSectionId]);
    const result: Array<{ depth: number; doc: DocSection }> = [];
    let frontier = [docSectionId];

    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
      const nextFrontier: string[] = [];
      for (const currentId of frontier) {
        for (const item of this.getRelatedDocs(currentId)) {
          if (item.direction !== direction) continue;
          if (seen.has(item.doc.id)) continue;
          seen.add(item.doc.id);
          result.push({ depth, doc: item.doc });
          nextFrontier.push(item.doc.id);
        }
      }
      frontier = nextFrontier;
    }

    return result;
  }

  /**
   * Resolves doc -> code edges for one or more DocSections.
   */
  getDocLinkedSymbols(docSectionIds: string[]): Array<{
    docSectionId: string;
    edgeType: 'REFERENCES' | 'DOCUMENTED_BY' | 'EXPLAINS_FLOW';
    symbol: GraphNode;
  }> {
    const ids = [...new Set(docSectionIds.filter(Boolean))];
    if (!ids.length) return [];
    const ph = ids.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT e.source_id as doc_id, e.type as edge_type, s.*
      FROM edges e
      JOIN symbols s ON s.id = e.target_id AND s.project_id = e.project_id
      WHERE e.project_id = ?
        AND e.source_id IN (${ph})
        AND e.type IN ('REFERENCES','DOCUMENTED_BY','EXPLAINS_FLOW')
      ORDER BY s.file_path, s.start_line
    `).all(this.projectId, ...ids) as Record<string, unknown>[];

    return rows.map((row) => ({
      docSectionId: row['doc_id'] as string,
      edgeType: row['edge_type'] as 'REFERENCES' | 'DOCUMENTED_BY' | 'EXPLAINS_FLOW',
      symbol: rowToNode(row),
    }));
  }

  /**
   * Resolves Requirement nodes satisfied by the target symbol (SATISFIES edges).
   */
  getRequirementsForSymbol(symbolId: string): GraphNode[] {
    return (this.db.prepare(`
      SELECT s.* FROM symbols s
      JOIN edges e ON e.target_id = s.id
      WHERE e.source_id = ? AND e.type = 'SATISFIES' AND e.project_id = ? AND s.project_id = ?
    `).all(symbolId, this.projectId, this.projectId) as Record<string, unknown>[]).map(rowToNode);
  }

  /**
   * Discovers all code symbols built specifically to satisfy a Business/Product Requirement.
   */
  getSymbolsForRequirement(requirementId: string): GraphNode[] {
    return (this.db.prepare(`
      SELECT s.* FROM symbols s
      JOIN edges e ON e.source_id = s.id
      WHERE e.target_id = ? AND e.type = 'SATISFIES' AND e.project_id = ? AND s.project_id = ?
    `).all(requirementId, this.projectId, this.projectId) as Record<string, unknown>[]).map(rowToNode);
  }

  /**
   * Recursively walks up the CALLS edges to gather transitive callers up to a configured max depth.
   */
  getTransitiveCallers(symbolId: string, maxDepth: number): GraphNode[] {
    const seen = new Set<string>([symbolId]);
    const result: GraphNode[] = [];
    let frontier = [symbolId];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const ph = frontier.map(() => '?').join(',');
      const rows = this.db.prepare(`
        SELECT s.* FROM symbols s
        JOIN edges e ON e.source_id = s.id
        WHERE e.target_id IN (${ph}) AND e.type = 'CALLS' AND e.project_id = ? AND s.project_id = ?
      `).all(...frontier, this.projectId, this.projectId) as Record<string, unknown>[];

      frontier = [];
      for (const row of rows) {
        const node = rowToNode(row);
        if (!seen.has(node.id)) {
          seen.add(node.id);
          result.push(node);
          frontier.push(node.id);
        }
      }
    }
    return result;
  }

  /**
   * Recursively discovers all outgoing CALLS made by a symbol, up to maxDepth.
   * Returns pairs of nodes and their calculated depth relative to the origin.
   */
  getCallees(symbolId: string, maxDepth: number): Array<{ node: GraphNode; depth: number }> {
    const seen = new Set<string>([symbolId]);
    const result: Array<{ node: GraphNode; depth: number }> = [];
    let frontier = [symbolId];

    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
      const ph = frontier.map(() => '?').join(',');
      const rows = this.db.prepare(`
        SELECT s.* FROM symbols s
        JOIN edges e ON e.target_id = s.id
        WHERE e.source_id IN (${ph}) AND e.type = 'CALLS' AND e.project_id = ? AND s.project_id = ?
      `).all(...frontier, this.projectId, this.projectId) as Record<string, unknown>[];

      frontier = [];
      for (const row of rows) {
        const node = rowToNode(row);
        if (!seen.has(node.id)) {
          seen.add(node.id);
          result.push({ node, depth });
          frontier.push(node.id);
        }
      }
    }
    return result;
  }

  /**
   * Executes a BM25 or raw string matching across the symbols virtual FTS5 index.
   */
  searchSymbols(query: string, limit = 20): GraphNode[] {
    if (!query.trim()) {
      return (this.db.prepare(`SELECT * FROM symbols WHERE project_id = ? LIMIT ?`).all(this.projectId, limit) as Record<string, unknown>[]).map(rowToNode);
    }
    return (this.db.prepare(`
      SELECT s.* FROM symbols s
      JOIN (SELECT rowid, rank FROM symbols_fts WHERE symbols_fts MATCH ? ORDER BY rank LIMIT ?) fts
      ON s.rowid = fts.rowid
      WHERE s.project_id = ?
      ORDER BY fts.rank
    `).all(toFtsQuery(query), limit, this.projectId) as Record<string, unknown>[]).map(rowToNode);
  }

  /**
   * Queries documentation contents and headings using full-text search (BM25).
   */
  searchDocs(query: string, limit = 20): DocSection[] {
    if (!query.trim()) {
      return (this.db.prepare(`SELECT * FROM doc_sections WHERE project_id = ? LIMIT ?`).all(this.projectId, limit) as Record<string, unknown>[]).map(rowToDoc);
    }
    return (this.db.prepare(`
      SELECT d.* FROM doc_sections d
      JOIN (SELECT rowid, rank FROM docs_fts WHERE docs_fts MATCH ? ORDER BY rank LIMIT ?) fts
      ON d.rowid = fts.rowid
      WHERE d.project_id = ?
      ORDER BY fts.rank
    `).all(toFtsQuery(query), limit, this.projectId) as Record<string, unknown>[]).map(rowToDoc);
  }

  /**
   * Filters and retrieves symbols belonging strictly to a given file path pattern or cluster.
   */
  getSymbolsByModule(modulePattern: string): GraphNode[] {
    return (this.db.prepare(`
      SELECT * FROM symbols WHERE project_id = ? AND (file_path LIKE ? OR cluster_id = ?)
    `).all(this.projectId, `%${modulePattern}%`, modulePattern) as Record<string, unknown>[]).map(rowToNode);
  }

  /**
   * Returns symbols heavily called by other components within the same module/cluster.
   */
  getTopCalledInModule(modulePattern: string, limit = 10): Array<{ node: GraphNode; callCount: number }> {
    return (this.db.prepare(`
      SELECT s.*, COUNT(e.source_id) AS call_count
      FROM symbols s
      JOIN edges e ON e.target_id = s.id
      WHERE (s.file_path LIKE ? OR s.cluster_id = ?) AND e.type = 'CALLS'
        AND s.project_id = ? AND e.project_id = ?
      GROUP BY s.id
      ORDER BY call_count DESC
      LIMIT ?
    `).all(`%${modulePattern}%`, modulePattern, this.projectId, this.projectId, limit) as Record<string, unknown>[]).map((row) => ({
      node: rowToNode(row),
      callCount: row['call_count'] as number,
    }));
  }

  /**
   * Debugging / Dev utility: Returns an oversized raw list of persisted generic Graph nodes.
   */
  getAllNodes(limit = 5000): GraphNode[] {
    return (this.db.prepare(`SELECT * FROM symbols WHERE project_id = ? LIMIT ?`).all(this.projectId, limit) as Record<string, unknown>[]).map(rowToNode);
  }

  /**
   * Debugging / Dev utility: Returns raw structural edge definitions for complete memory dumps.
   */
  getAllEdges(limit = 20000): GraphEdge[] {
    return (this.db.prepare(`SELECT * FROM edges WHERE project_id = ? LIMIT ?`).all(this.projectId, limit) as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      type: row['type'] as GraphEdge['type'],
      sourceId: row['source_id'] as string,
      targetId: row['target_id'] as string,
    }));
  }

  /**
   * Executes a synchronous grouping of SQLite queries wrapped strictly inside a single commit block.
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)() as T;
  }

  // ─── Delta / file cache ──────────────────────────────────────────────────

  isFileCached(filePath: string, contentHash: string): boolean {
    const row = this.db
      .prepare(`SELECT content_hash FROM file_cache WHERE project_id = ? AND file_path = ?`)
      .get(this.projectId, filePath) as { content_hash: string } | undefined;
    return row?.content_hash === contentHash;
  }

  /**
   * Upserts the indexing completion state and MD5 hashing bounds per-file to short-circuit later redundant parsing.
   */
  updateFileCache(filePath: string, contentHash: string): void {
    this.db
      .prepare(`
        INSERT INTO file_cache (project_id, file_path, content_hash, indexed_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(project_id, file_path) DO UPDATE SET
          content_hash = excluded.content_hash,
          indexed_at   = excluded.indexed_at
      `)
      .run(this.projectId, filePath, contentHash, Date.now());
  }

  /**
   * Auto-documented structural element.
   */
  getDocSectionById(id: string): DocSection | null {
    const row = this.db.prepare(`SELECT * FROM doc_sections WHERE project_id = ? AND id = ?`).get(this.projectId, id) as Record<string, unknown> | undefined;
    return row ? rowToDoc(row) : null;
  }

  /**
   * Auto-documented structural element.
   * @doc:../../docs/architecture/06-6-graphdb-schema-ay-u.md#6-graphdb-schema-ay-u
   */
  getDocSectionByPathAndSlug(filePath: string, slug: string): DocSection | null {
    const row = this.db.prepare(
      `SELECT * FROM doc_sections WHERE project_id = ? AND file_path = ? AND slug = ? LIMIT 1`
    ).get(this.projectId, filePath, slug) as Record<string, unknown> | undefined;
    return row ? rowToDoc(row) : null;
  }

  /**
   * Auto-documented structural element.
   */
  hasEdge(sourceId: string, targetId: string): boolean {
    const row = this.db.prepare(`SELECT id FROM edges WHERE project_id = ? AND source_id = ? AND target_id = ? LIMIT 1`).get(this.projectId, sourceId, targetId);
    return !!row;
  }

  /**
   * Auto-documented structural element.
   */
  getStaleDocLinks(): Array<{ edgeId: string; docSection: DocSection; missingSymbolId: string }> {
    const rows = this.db.prepare(`
      SELECT e.id as edge_id, d.*, e.target_id as missing_symbol_id
      FROM edges e
      JOIN doc_sections d ON d.id = e.source_id AND d.project_id = e.project_id
      WHERE e.type IN ('REFERENCES','DOCUMENTED_BY','EXPLAINS_FLOW')
        AND e.project_id = ?
        AND NOT EXISTS (SELECT 1 FROM symbols WHERE project_id = e.project_id AND id = e.target_id)
    `).all(this.projectId) as Record<string, unknown>[];
    return rows.map((r) => ({
      edgeId: r['edge_id'] as string,
      docSection: rowToDoc(r),
      missingSymbolId: r['missing_symbol_id'] as string,
    }));
  }

  /**
   * Auto-documented structural element.
   */
  deleteEdgeById(edgeId: string): void {
    this.db.prepare(`DELETE FROM edges WHERE project_id = ? AND id = ?`).run(this.projectId, edgeId);
  }

  /**
   * Auto-documented structural element.
   */
  addDocLinkMark(params: {
    docSectionId: string; docHeading: string; docFilePath: string;
    symbolId: string; symbolName: string; symbolFilePath: string;
    action: 'link' | 'unlink';
  }): string {
    const id = `mark:${params.action}:${params.docSectionId}:${params.symbolId}:${Date.now()}`;
    this.db.prepare(`
      INSERT OR REPLACE INTO doc_link_marks
        (id, project_id, mark_type, doc_section_id, doc_heading, doc_file_path, symbol_id, symbol_name, symbol_file_path, action, resolved, created_at)
      VALUES (?, ?, 'doc_symbol', ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, this.projectId, params.docSectionId, params.docHeading, params.docFilePath,
      params.symbolId, params.symbolName, params.symbolFilePath, params.action, Date.now());
    return id;
  }

  addDocDocLinkMark(params: {
    docSectionId: string; docHeading: string; docFilePath: string;
    targetDocSectionId: string; targetDocHeading: string; targetDocFilePath: string; targetDocSlug: string;
    annotationText: string; wikiAnnotationText: string;
    action: 'link' | 'unlink';
  }): string {
    const id = `mark:${params.action}:${params.docSectionId}:${params.targetDocSectionId}:${Date.now()}`;
    this.db.prepare(`
      INSERT OR REPLACE INTO doc_link_marks
        (id, project_id, mark_type, doc_section_id, doc_heading, doc_file_path,
         symbol_id, symbol_name, symbol_file_path,
         target_doc_section_id, target_doc_heading, target_doc_file_path, target_doc_slug,
         annotation_text, wiki_annotation_text, action, resolved, created_at)
      VALUES (?, ?, 'doc_doc', ?, ?, ?,
         '', '', '',
         ?, ?, ?, ?,
         ?, ?, ?, 0, ?)
    `).run(
      id,
      this.projectId,
      params.docSectionId,
      params.docHeading,
      params.docFilePath,
      params.targetDocSectionId,
      params.targetDocHeading,
      params.targetDocFilePath,
      params.targetDocSlug,
      params.annotationText,
      params.wikiAnnotationText,
      params.action,
      Date.now(),
    );
    return id;
  }

  getDocLinkMarks(onlyUnresolved = true): Array<{
    id: string; docSectionId: string; docHeading: string; docFilePath: string;
    markType: 'doc_symbol' | 'doc_doc';
    symbolId: string; symbolName: string; symbolFilePath: string;
    targetDocSectionId: string; targetDocHeading: string; targetDocFilePath: string; targetDocSlug: string;
    annotationText: string; wikiAnnotationText: string;
    action: string; resolved: boolean; createdAt: number;
  }> {
    const rows = (onlyUnresolved
      ? this.db.prepare(`SELECT * FROM doc_link_marks WHERE project_id = ? AND resolved = 0 ORDER BY created_at DESC`).all(this.projectId)
      : this.db.prepare(`SELECT * FROM doc_link_marks WHERE project_id = ? ORDER BY created_at DESC`).all(this.projectId)
    ) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r['id'] as string,
      docSectionId: r['doc_section_id'] as string,
      docHeading: r['doc_heading'] as string,
      docFilePath: r['doc_file_path'] as string,
      markType: ((r['mark_type'] as string) || 'doc_symbol') as 'doc_symbol' | 'doc_doc',
      symbolId: r['symbol_id'] as string,
      symbolName: r['symbol_name'] as string,
      symbolFilePath: r['symbol_file_path'] as string,
      targetDocSectionId: (r['target_doc_section_id'] as string) || '',
      targetDocHeading: (r['target_doc_heading'] as string) || '',
      targetDocFilePath: (r['target_doc_file_path'] as string) || '',
      targetDocSlug: (r['target_doc_slug'] as string) || '',
      annotationText: (r['annotation_text'] as string) || '',
      wikiAnnotationText: (r['wiki_annotation_text'] as string) || '',
      action: r['action'] as string,
      resolved: Boolean(r['resolved']),
      createdAt: r['created_at'] as number,
    }));
  }

  resolveDocLinkMark(markId: string): boolean {
    const result = this.db.prepare(
      `UPDATE doc_link_marks SET resolved = 1 WHERE project_id = ? AND id = ?`
    ).run(this.projectId, markId);
    return result.changes > 0;
  }


  /**
   * Auto-documented structural element.
   */
  getAllDocLinks(): Array<{
    edgeId: string; edgeType: string; isManual: boolean;
    docSectionId: string; docHeading: string; docFilePath: string; docStartLine: number;
    symbolId: string; symbolName: string; symbolFilePath: string; symbolType: string;
  }> {
    const rows = this.db.prepare(`
      SELECT e.id as edge_id, e.type as edge_type, e.is_manual,
             d.id as doc_id, d.heading as doc_heading, d.file_path as doc_file, d.start_line as doc_line,
             s.id as sym_id, s.name as sym_name, s.file_path as sym_file, s.type as sym_type
      FROM edges e
      JOIN doc_sections d ON d.id = e.source_id AND d.project_id = e.project_id
      JOIN symbols s ON s.id = e.target_id AND s.project_id = e.project_id
      WHERE e.type IN ('REFERENCES','DOCUMENTED_BY','EXPLAINS_FLOW') AND e.project_id = ?
      ORDER BY d.file_path, d.start_line
    `).all(this.projectId) as Record<string, unknown>[];
    return rows.map((r) => ({
      edgeId: r['edge_id'] as string,
      edgeType: r['edge_type'] as string,
      isManual: Boolean(r['is_manual']),
      docSectionId: r['doc_id'] as string,
      docHeading: r['doc_heading'] as string,
      docFilePath: r['doc_file'] as string,
      docStartLine: Number(r['doc_line']),
      symbolId: r['sym_id'] as string,
      symbolName: r['sym_name'] as string,
      symbolFilePath: r['sym_file'] as string,
      symbolType: r['sym_type'] as string,
    }));
  }

  /**
   * Auto-documented structural element.
   */
  getPendingForwardRefs(): Array<{
    docSectionId: string; docHeading: string; docFilePath: string; docStartLine: number;
    symbolName: string;
  }> {
    const sections = this.db.prepare(
      `SELECT id, heading, file_path, start_line, content FROM doc_sections WHERE project_id = ?`
    ).all(this.projectId) as Array<{ id: string; heading: string; file_path: string; start_line: number; content: string }>;

    const symbolNames = new Set(
      (this.db.prepare(`SELECT DISTINCT name FROM symbols WHERE project_id = ?`).all(this.projectId) as Array<{ name: string }>).map((r) => r.name)
    );

    const seen = new Set<string>();
    const pending: Array<{ docSectionId: string; docHeading: string; docFilePath: string; docStartLine: number; symbolName: string }> = [];

    for (const sec of sections) {
      if (!sec.content) continue;
      const matches = sec.content.matchAll(/\[\[(\w[\w.]*)\]\]/g);
      for (const m of matches) {
        const name = m[1];
        if (symbolNames.has(name)) continue; // symbol exists — already linked or linkable via suggest
        const key = sec.id + '::' + name;
        if (seen.has(key)) continue;
        seen.add(key);
        pending.push({ docSectionId: sec.id, docHeading: sec.heading, docFilePath: sec.file_path, docStartLine: sec.start_line, symbolName: name });
      }
    }
    return pending;
  }

  /**
   * Auto-documented structural element.
   */
  getDocLinkCount(): number {
    return (this.db.prepare(
      `SELECT count(*) as n FROM edges WHERE project_id = ? AND type IN ('REFERENCES','DOCUMENTED_BY','EXPLAINS_FLOW')`
    ).get(this.projectId) as { n: number }).n;
  }

  /**
   * Auto-documented structural element.
   */
  getDocSubgraph(
    pattern?: string,
    options: {
      includeAllCode?: boolean;
      excludeFileSuffixes?: string[];
      includePathPrefixes?: string[];   // If set, only docs under these relative path prefixes
    } = {},
  ): { docSections: DocSection[]; symbols: GraphNode[]; edges: GraphEdge[] } {
    const excludeSuffixes = options.excludeFileSuffixes?.filter(Boolean) ?? [];
    const pathPrefixes = options.includePathPrefixes?.filter(Boolean) ?? [];

    // Build exclude clause
    const excludeClause = excludeSuffixes.length
      ? ' AND ' + excludeSuffixes.map(() => `file_path NOT LIKE ?`).join(' AND ')
      : '';
    const excludeArgs = excludeSuffixes.map((s) => `%/${s}`);

    // Build include-path clause: file_path LIKE '/abs/path/docs/%' OR file_path = '/abs/path/docs'
    // Paths are resolved to absolute in the server before being passed here.
    const includeClause = pathPrefixes.length
      ? ' AND (' + pathPrefixes.map(() => `file_path LIKE ? OR file_path = ?`).join(' OR ') + ')'
      : '';
    const includeArgs = pathPrefixes.flatMap((p) => [`${p}/%`, p]);

    const baseArgs = [...excludeArgs, ...includeArgs];

    const docRows = pattern && pattern.trim()
      ? this.db.prepare(
        `SELECT * FROM doc_sections WHERE project_id = ? AND (heading LIKE ? OR file_path LIKE ?)${excludeClause}${includeClause} LIMIT 500`
      ).all(this.projectId, `%${pattern}%`, `%${pattern}%`, ...baseArgs)
      : this.db.prepare(
        `SELECT * FROM doc_sections WHERE project_id = ?${excludeClause}${includeClause} LIMIT 500`
      ).all(this.projectId, ...baseArgs);

    const docSections = (docRows as Record<string, unknown>[]).map(rowToDoc);
    if (!docSections.length) return { docSections: [], symbols: [], edges: [] };

    const docIds = docSections.map((d) => d.id);
    const docPh = docIds.map(() => '?').join(',');

    const symbolRows = options.includeAllCode
      ? (pattern && pattern.trim()
        ? this.db.prepare(`
              SELECT DISTINCT s.* FROM symbols s
              WHERE s.project_id = ?
                AND s.type IN ('Function','Class','Method','Interface','Type')
                AND (s.name LIKE ? OR s.file_path LIKE ?)
              LIMIT 1200
            `).all(this.projectId, `%${pattern}%`, `%${pattern}%`)
        : this.db.prepare(`
              SELECT * FROM symbols
              WHERE project_id = ?
                AND type IN ('Function','Class','Method','Interface','Type')
              LIMIT 1200
            `).all(this.projectId)
      ) as Record<string, unknown>[]
      : (this.db.prepare(`
          SELECT DISTINCT s.* FROM symbols s
          JOIN edges e ON e.target_id = s.id
          WHERE e.source_id IN (${docPh}) AND e.type IN ('REFERENCES','DOCUMENTED_BY','EXPLAINS_FLOW')
            AND e.project_id = ? AND s.project_id = ?
        `).all(...docIds, this.projectId, this.projectId) as Record<string, unknown>[]).slice(0, 300);

    const symbols = symbolRows.map(rowToNode);
    if (!symbols.length) return { docSections, symbols: [], edges: [] };

    const symIds = symbols.map((s) => s.id);
    const symPh = symIds.map(() => '?').join(',');

    const docSymEdges = this.db.prepare(`
      SELECT * FROM edges WHERE project_id = ? AND source_id IN (${docPh}) AND target_id IN (${symPh})
    `).all(this.projectId, ...docIds, ...symIds) as Record<string, unknown>[];

    const docDocEdges = this.db.prepare(`
      SELECT * FROM edges
      WHERE project_id = ?
        AND type IN ('REFERENCES_DOC')
        AND source_id IN (${docPh})
        AND target_id IN (${docPh})
    `).all(this.projectId, ...docIds, ...docIds) as Record<string, unknown>[];

    const codeEdges = this.db.prepare(`
      SELECT * FROM edges
      WHERE project_id = ?
        AND type IN ('CALLS','IMPORTS','EXPORTS','INHERITS','IMPLEMENTS')
        AND source_id IN (${symPh}) AND target_id IN (${symPh})
    `).all(this.projectId, ...symIds, ...symIds) as Record<string, unknown>[];

    const edges = [...docSymEdges, ...docDocEdges, ...codeEdges].map((row) => ({
      id: row['id'] as string,
      type: row['type'] as GraphEdge['type'],
      sourceId: row['source_id'] as string,
      targetId: row['target_id'] as string,
    }));

    return { docSections, symbols, edges };
  }

  /**
   * Auto-documented structural element.
   */
  getDocNeighborhood(
    docSectionId: string,
    options: { includeCodeContext?: boolean } = {},
  ): { docSections: DocSection[]; focusDocId: string | null; symbols: GraphNode[]; edges: GraphEdge[] } {
    const docSection = this.getDocSectionById(docSectionId);
    if (!docSection) return { docSections: [], focusDocId: null, symbols: [], edges: [] };

    const descendantRows = this.db.prepare(`
      SELECT * FROM doc_sections
      WHERE project_id = ?
        AND file_path = ?
        AND start_line > ?
        AND end_line <= ?
        AND heading_level > ?
      ORDER BY start_line ASC, heading_level ASC, id ASC
    `).all(
      this.projectId,
      docSection.filePath,
      docSection.startLine,
      docSection.endLine,
      docSection.headingLevel,
    ) as Record<string, unknown>[];

    return this.getDocNeighborhoodByIds(
      [docSection, ...descendantRows.map(rowToDoc)],
      docSection.id,
      options,
    );
  }

  /**
   * Auto-documented structural element.
   */
  getDocNeighborhoodForIds(
    docSectionIds: string[],
    options: { includeCodeContext?: boolean; focusDocId?: string | null } = {},
  ): { docSections: DocSection[]; focusDocId: string | null; symbols: GraphNode[]; edges: GraphEdge[] } {
    const docs = [...new Set(docSectionIds)]
      .map((id) => this.getDocSectionById(id))
      .filter((doc): doc is DocSection => !!doc);
    return this.getDocNeighborhoodByIds(docs, options.focusDocId ?? docs[0]?.id ?? null, options);
  }

  /**
   * Auto-documented structural element.
   */
  private getDocNeighborhoodByIds(
    baseDocSections: DocSection[],
    focusDocId: string | null,
    options: { includeCodeContext?: boolean } = {},
  ): { docSections: DocSection[]; focusDocId: string | null; symbols: GraphNode[]; edges: GraphEdge[] } {
    const uniqueBaseDocs = [...new Map(baseDocSections.map((section) => [section.id, section])).values()];
    if (!uniqueBaseDocs.length) return { docSections: [], focusDocId: null, symbols: [], edges: [] };

    const docSectionIds = uniqueBaseDocs.map((section) => section.id);
    const docPh = docSectionIds.map(() => '?').join(',');

    const linkedEdgeRows = this.db.prepare(`
      SELECT * FROM edges
      WHERE project_id = ?
        AND source_id IN (${docPh})
        AND type IN ('REFERENCES','DOCUMENTED_BY','EXPLAINS_FLOW')
    `).all(this.projectId, ...docSectionIds) as Record<string, unknown>[];

    const docDocEdgeRows = this.db.prepare(`
      SELECT * FROM edges
      WHERE project_id = ?
        AND type IN ('REFERENCES_DOC')
        AND (source_id IN (${docPh}) OR target_id IN (${docPh}))
    `).all(this.projectId, ...docSectionIds, ...docSectionIds) as Record<string, unknown>[];

    const extraDocIds = [...new Set(
      docDocEdgeRows.flatMap((row) => [
        row['source_id'] as string,
        row['target_id'] as string,
      ]).filter((id) => !docSectionIds.includes(id))
    )];
    const extraDocs = extraDocIds.length
      ? (() => {
          const extraPh = extraDocIds.map(() => '?').join(',');
          return (this.db.prepare(`
            SELECT * FROM doc_sections
            WHERE project_id = ?
              AND id IN (${extraPh})
          `).all(this.projectId, ...extraDocIds) as Record<string, unknown>[]).map(rowToDoc);
        })()
      : [];
    const docSections = [...uniqueBaseDocs, ...extraDocs];

    const linkedSymbolIds = [...new Set(linkedEdgeRows.map((row) => row['target_id'] as string))];
    if (!linkedSymbolIds.length) {
      return {
        docSections,
        focusDocId,
        symbols: [],
        edges: [...linkedEdgeRows, ...docDocEdgeRows].map((row) => ({
          id: row['id'] as string,
          type: row['type'] as GraphEdge['type'],
          sourceId: row['source_id'] as string,
          targetId: row['target_id'] as string,
        })),
      };
    }

    const linkedPh = linkedSymbolIds.map(() => '?').join(',');
    const symbolRows = this.db.prepare(`
      SELECT * FROM symbols
      WHERE project_id = ?
        AND id IN (${linkedPh})
    `).all(this.projectId, ...linkedSymbolIds) as Record<string, unknown>[];

    let includedSymbolIds = [...linkedSymbolIds];
    let codeEdgeRows: Record<string, unknown>[] = [];

    if (options.includeCodeContext) {
      const contextEdgeRows = this.db.prepare(`
        SELECT * FROM edges
        WHERE project_id = ?
          AND type IN ('CALLS','IMPORTS','EXPORTS','INHERITS','IMPLEMENTS')
          AND (source_id IN (${linkedPh}) OR target_id IN (${linkedPh}))
        LIMIT 600
      `).all(this.projectId, ...linkedSymbolIds, ...linkedSymbolIds) as Record<string, unknown>[];

      const neighborIds = new Set<string>(linkedSymbolIds);
      for (const row of contextEdgeRows) {
        neighborIds.add(row['source_id'] as string);
        neighborIds.add(row['target_id'] as string);
      }
      includedSymbolIds = [...neighborIds];
      const allPh = includedSymbolIds.map(() => '?').join(',');
      codeEdgeRows = this.db.prepare(`
        SELECT * FROM edges
        WHERE project_id = ?
          AND type IN ('CALLS','IMPORTS','EXPORTS','INHERITS','IMPLEMENTS')
          AND source_id IN (${allPh})
          AND target_id IN (${allPh})
      `).all(this.projectId, ...includedSymbolIds, ...includedSymbolIds) as Record<string, unknown>[];
    }

    const allPh = includedSymbolIds.map(() => '?').join(',');
    const allSymbolRows = this.db.prepare(`
      SELECT * FROM symbols
      WHERE project_id = ?
        AND id IN (${allPh})
    `).all(this.projectId, ...includedSymbolIds) as Record<string, unknown>[];

    return {
      docSections,
      focusDocId,
      symbols: allSymbolRows.map(rowToNode),
      edges: [...linkedEdgeRows, ...docDocEdgeRows, ...codeEdgeRows].map((row) => ({
        id: row['id'] as string,
        type: row['type'] as GraphEdge['type'],
        sourceId: row['source_id'] as string,
        targetId: row['target_id'] as string,
      })),
    };
  }

  // ─── Parse rules ─────────────────────────────────────────────────────────

  upsertParseRule(rule: {
    id: string; language: string; ruleType: string; name: string; query: string;
    packName?: string; nodeType?: string; edgeType?: string; nameCapture?: string;
    sourceCapture?: string; targetCapture?: string; docCapture?: string; symbolCapture?: string; priority?: number;
  }): void {
    this.db.prepare(`
      INSERT INTO parse_rules (project_id, id, language, rule_type, name, query, pack_name, node_type, edge_type,
        name_capture, source_capture, target_capture, doc_capture, symbol_capture, priority, created_at)
      VALUES (@projectId, @id, @language, @ruleType, @name, @query, @packName, @nodeType, @edgeType,
        @nameCapture, @sourceCapture, @targetCapture, @docCapture, @symbolCapture, @priority, @createdAt)
      ON CONFLICT(project_id, id) DO UPDATE SET
        language=excluded.language, rule_type=excluded.rule_type, name=excluded.name,
        query=excluded.query, pack_name=excluded.pack_name, node_type=excluded.node_type, edge_type=excluded.edge_type,
        name_capture=excluded.name_capture, source_capture=excluded.source_capture,
        target_capture=excluded.target_capture, doc_capture=excluded.doc_capture,
        symbol_capture=excluded.symbol_capture, priority=excluded.priority
    `).run({
      projectId: this.projectId,
      id: rule.id, language: rule.language, ruleType: rule.ruleType,
      name: rule.name, query: rule.query, packName: rule.packName ?? '',
      nodeType: rule.nodeType ?? '', edgeType: rule.edgeType ?? '',
      nameCapture: rule.nameCapture ?? 'name', sourceCapture: rule.sourceCapture ?? 'source',
      targetCapture: rule.targetCapture ?? 'target',
      docCapture: rule.docCapture ?? 'doc',
      symbolCapture: rule.symbolCapture ?? 'symbol',
      priority: rule.priority ?? 0,
      createdAt: Date.now(),
    });
  }

  /**
   * Auto-documented structural element.
   */
  getParseRules(language?: string): ParseRule[] {
    const rows = language
      ? this.db.prepare(`SELECT * FROM parse_rules WHERE project_id = ? AND language = ? ORDER BY priority DESC`).all(this.projectId, language)
      : this.db.prepare(`SELECT * FROM parse_rules WHERE project_id = ? ORDER BY language, priority DESC`).all(this.projectId);
    return (rows as Record<string, unknown>[]).map(rowToParseRule);
  }

  /**
   * Auto-documented structural element.
   */
  deleteParseRule(id: string): void {
    this.db.prepare(`DELETE FROM parse_rules WHERE project_id = ? AND id = ?`).run(this.projectId, id);
  }

  /**
   * Auto-documented structural element.
   */
  clearParseRules(language?: string): void {
    if (language) {
      this.db.prepare(`DELETE FROM parse_rules WHERE project_id = ? AND language = ?`).run(this.projectId, language);
      this.db.prepare(`DELETE FROM parse_artifacts WHERE project_id = ? AND language = ?`).run(this.projectId, language);
    } else {
      this.db.prepare(`DELETE FROM parse_rules WHERE project_id = ?`).run(this.projectId);
      this.db.prepare(`DELETE FROM parse_artifacts WHERE project_id = ?`).run(this.projectId);
    }
  }

  /**
   * Auto-documented structural element.
   */
  upsertParseArtifact(artifact: {
    id: string; language: string; artifactType: string; name: string; packName?: string;
    content?: string; query?: string; targetLanguage?: string; rangeCapture?: string; priority?: number;
  }): void {
    this.db.prepare(`
      INSERT INTO parse_artifacts (project_id, id, language, artifact_type, name, pack_name, content, query, target_language, range_capture, priority, created_at)
      VALUES (@projectId, @id, @language, @artifactType, @name, @packName, @content, @query, @targetLanguage, @rangeCapture, @priority, @createdAt)
      ON CONFLICT(project_id, id) DO UPDATE SET
        language=excluded.language, artifact_type=excluded.artifact_type, name=excluded.name,
        pack_name=excluded.pack_name, content=excluded.content, query=excluded.query,
        target_language=excluded.target_language, range_capture=excluded.range_capture,
        priority=excluded.priority
    `).run({
      projectId: this.projectId,
      id: artifact.id,
      language: artifact.language,
      artifactType: artifact.artifactType,
      name: artifact.name,
      packName: artifact.packName ?? '',
      content: artifact.content ?? '',
      query: artifact.query ?? '',
      targetLanguage: artifact.targetLanguage ?? '',
      rangeCapture: artifact.rangeCapture ?? 'range',
      priority: artifact.priority ?? 0,
      createdAt: Date.now(),
    });
  }

  /**
   * Retrieves all Parse Artifacts (injection templates, range queries) configured 
   * for an optionally specified target language.
   */
  getParseArtifacts(language?: string): ParseArtifact[] {
    const rows = language
      ? this.db.prepare(`SELECT * FROM parse_artifacts WHERE project_id = ? AND language = ? ORDER BY priority DESC`).all(this.projectId, language)
      : this.db.prepare(`SELECT * FROM parse_artifacts WHERE project_id = ? ORDER BY language, priority DESC`).all(this.projectId);
    return (rows as Record<string, unknown>[]).map(rowToParseArtifact);
  }

  // ─── RuleSets ─────────────────────────────────────────────────────────────

  /**
   * Instantiates a new RuleSet definition for grouping grammar strategies and parse rules.
   */
  createRuleSet(data: {
    id: string; name: string; description?: string; language: string; version?: string;
    isGlobal?: boolean; parentId?: string | null; grammarWasmUrl?: string;
  }): RuleSet {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO rule_sets (id, project_id, name, description, language, version, is_global, parent_id, grammar_wasm_url, created_at, updated_at)
      VALUES (@id, @projectId, @name, @description, @language, @version, @isGlobal, @parentId, @grammarWasmUrl, @createdAt, @updatedAt)
    `).run({
      id: data.id,
      projectId: data.isGlobal ? null : this.projectId,
      name: data.name,
      description: data.description ?? '',
      language: data.language,
      version: data.version ?? '1.0.0',
      isGlobal: data.isGlobal ? 1 : 0,
      parentId: data.parentId ?? null,
      grammarWasmUrl: data.grammarWasmUrl ?? '',
      createdAt: now,
      updatedAt: now,
    });
    return this.getRuleSet(data.id)!;
  }

  /**
   * Applies partial updates to an existing RuleSet's name, description, version, parent hierarchy, or WASM URL.
   */
  updateRuleSet(id: string, updates: Partial<Pick<RuleSet, 'name' | 'description' | 'version' | 'parentId' | 'grammarWasmUrl'>>): void {
    const fields: string[] = [];
    const params: Record<string, unknown> = { id, updatedAt: Date.now() };
    if (updates.name !== undefined) { fields.push('name=@name'); params['name'] = updates.name; }
    if (updates.description !== undefined) { fields.push('description=@description'); params['description'] = updates.description; }
    if (updates.version !== undefined) { fields.push('version=@version'); params['version'] = updates.version; }
    if ('parentId' in updates) { fields.push('parent_id=@parentId'); params['parentId'] = updates.parentId ?? null; }
    if (updates.grammarWasmUrl !== undefined) { fields.push('grammar_wasm_url=@grammarWasmUrl'); params['grammarWasmUrl'] = updates.grammarWasmUrl; }
    if (!fields.length) return;
    fields.push('updated_at=@updatedAt');
    this.db.prepare(`UPDATE rule_sets SET ${fields.join(', ')} WHERE id=@id`).run(params);
  }

  /**
   * Deletes a RuleSet explicitly by ID and detaches any rules or artifacts bound to it.
   */
  deleteRuleSet(id: string): void {
    // Cascade: rules with this rule_set_id stay but lose the association
    this.db.prepare(`UPDATE parse_rules SET rule_set_id='' WHERE rule_set_id=?`).run(id);
    this.db.prepare(`UPDATE parse_artifacts SET rule_set_id='' WHERE rule_set_id=?`).run(id);
    this.db.prepare(`DELETE FROM rule_sets WHERE id=?`).run(id);
  }

  /**
   * Retrieves a single RuleSet's metadata independently without resolving parent/inheritance chains.
   */
  getRuleSet(id: string): RuleSet | null {
    const row = this.db.prepare(`SELECT * FROM rule_sets WHERE id=?`).get(id) as Record<string, unknown> | undefined;
    return row ? rowToRuleSet(row) : null;
  }

  /**
   * Lists RuleSets selectively prioritizing project-scoped rule configurations.
   */
  listRuleSets(opts?: { language?: string; includeGlobal?: boolean }): RuleSet[] {
    let sql = `SELECT * FROM rule_sets WHERE (project_id=? OR project_id IS NULL)`;
    const params: unknown[] = [this.projectId];
    if (!opts?.includeGlobal) { sql = `SELECT * FROM rule_sets WHERE project_id=?`; }
    if (opts?.language) { sql += ` AND language=?`; params.push(opts.language); }
    sql += ` ORDER BY is_global DESC, language, name`;
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToRuleSet);
  }

  /**
   * Collects all applicable RuleSets globally including project-local overrides.
   */
  listAllRuleSets(opts?: { language?: string }): RuleSet[] {
    let sql = `SELECT * FROM rule_sets WHERE (project_id=? OR project_id IS NULL OR is_global=1)`;
    const params: unknown[] = [this.projectId];
    if (opts?.language) { sql += ` AND language=?`; params.push(opts.language); }
    sql += ` ORDER BY is_global DESC, language, name`;
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToRuleSet);
  }

  /**
   * Recursively resolves a RuleSet through its hierarchy, composing a final
   * unified chain of inherited rules and artifacts with child overriding parent boundaries.
   */
  getResolvedRuleSet(id: string): ResolvedRuleSet | null {
    const root = this.getRuleSet(id);
    if (!root) return null;
    // Walk ancestor chain (max 10 levels to prevent cycles)
    const chain: RuleSet[] = [];
    let cur: RuleSet | null = root;
    const visited = new Set<string>();
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      chain.unshift(cur); // oldest ancestor first
      cur = cur.parentId ? this.getRuleSet(cur.parentId) : null;
    }
    // Merge rules and artifacts: parent first, child overrides by name
    const mergedRulesMap = new Map<string, ParseRule>();
    const mergedArtifactsMap = new Map<string, ParseArtifact>();
    for (const rs of chain) {
      const rulesBySetId = this.db.prepare(`SELECT * FROM parse_rules WHERE rule_set_id=? ORDER BY priority DESC`).all(rs.id) as Record<string, unknown>[];
      for (const row of rulesBySetId) {
        const rule = rowToParseRule(row);
        mergedRulesMap.set(rule.name, rule);
      }
      const artifactsBySetId = this.db.prepare(`SELECT * FROM parse_artifacts WHERE rule_set_id=? ORDER BY priority DESC`).all(rs.id) as Record<string, unknown>[];
      for (const row of artifactsBySetId) {
        const artifact = rowToParseArtifact(row);
        mergedArtifactsMap.set(artifact.name, artifact);
      }
    }
    return {
      ...root,
      chain,
      rules: Array.from(mergedRulesMap.values()),
      artifacts: Array.from(mergedArtifactsMap.values()),
    };
  }

  /**
   * Extracts raw ParseRules specifically belonging to the given rule set.
   */
  getRuleSetRules(ruleSetId: string): ParseRule[] {
    const rows = this.db.prepare(`SELECT * FROM parse_rules WHERE rule_set_id=? ORDER BY priority DESC`).all(ruleSetId) as Record<string, unknown>[];
    return rows.map(rowToParseRule);
  }

  /**
   * Extracts mapped ParseArtifacts bound exclusively to the provided RuleSet.
   */
  getRuleSetArtifacts(ruleSetId: string): ParseArtifact[] {
    const rows = this.db.prepare(`SELECT * FROM parse_artifacts WHERE rule_set_id=? ORDER BY priority DESC`).all(ruleSetId) as Record<string, unknown>[];
    return rows.map(rowToParseArtifact);
  }

  /**
   * Associates an orphaned ParseRule directly into the tracking scope of a unified RuleSet.
   */
  assignRuleToSet(ruleId: string, ruleSetId: string): void {
    this.db.prepare(`UPDATE parse_rules SET rule_set_id=? WHERE project_id=? AND id=?`).run(ruleSetId, this.projectId, ruleId);
  }

  /**
   * Associates an artifact template with a parent configuration RuleSet container.
   */
  assignArtifactToSet(artifactId: string, ruleSetId: string): void {
    this.db.prepare(`UPDATE parse_artifacts SET rule_set_id=? WHERE project_id=? AND id=?`).run(ruleSetId, this.projectId, artifactId);
  }

  /**
   * Safely duplicates an existing RuleSet preserving logic paths but assigning a new local ID.
   */
  forkRuleSet(sourceId: string, newId: string, newName: string): RuleSet | null {
    const source = this.getRuleSet(sourceId);
    if (!source) return null;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO rule_sets (id, project_id, name, description, language, version, is_global, parent_id, grammar_wasm_url, created_at, updated_at)
      VALUES (@id, @projectId, @name, @description, @language, @version, 0, @parentId, @grammarWasmUrl, @createdAt, @updatedAt)
    `).run({
      id: newId, projectId: this.projectId,
      name: newName, description: source.description,
      language: source.language, version: source.version,
      parentId: sourceId,
      grammarWasmUrl: source.grammarWasmUrl,
      createdAt: now, updatedAt: now,
    });
    // Copy rules from source into new ruleset
    const sourceRules = this.db.prepare(`SELECT * FROM parse_rules WHERE rule_set_id=?`).all(sourceId) as Record<string, unknown>[];
    for (const row of sourceRules) {
      const newRuleId = `${newId}:${row['name'] as string}:${row['rule_type'] as string}`;
      this.db.prepare(`
        INSERT OR IGNORE INTO parse_rules (project_id, id, language, rule_type, name, query, pack_name, node_type, edge_type,
          name_capture, source_capture, target_capture, doc_capture, symbol_capture, priority, rule_set_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        this.projectId, newRuleId,
        row['language'], row['rule_type'], row['name'], row['query'],
        row['pack_name'], row['node_type'], row['edge_type'],
        row['name_capture'], row['source_capture'], row['target_capture'],
        row['doc_capture'], row['symbol_capture'],
        row['priority'], newId, Date.now()
      );
    }
    return this.getRuleSet(newId);
  }

  // ─── RuleLinks ────────────────────────────────────────────────────────────

  /**
   * Sets up an inheritance, override, or dependency link between two independent RuleSets.
   */
  createRuleLink(data: { id: string; sourceId: string; targetId: string; linkType: 'inherit' | 'override' | 'inject' }): RuleLink {
    this.db.prepare(`
      INSERT OR REPLACE INTO rule_links (id, source_id, target_id, link_type, created_at)
      VALUES (@id, @sourceId, @targetId, @linkType, @createdAt)
    `).run({ id: data.id, sourceId: data.sourceId, targetId: data.targetId, linkType: data.linkType, createdAt: Date.now() });
    return this.getRuleLink(data.id)!;
  }

  /**
   * Identifies an established logic link connecting two RuleSets using a strict ID.
   */
  getRuleLink(id: string): RuleLink | null {
    const row = this.db.prepare(`SELECT * FROM rule_links WHERE id=?`).get(id) as Record<string, unknown> | undefined;
    return row ? rowToRuleLink(row) : null;
  }

  /**
   * Retrieves all ruleset relationship edges bound to a single RuleSet.
   */
  listRuleLinks(ruleSetId: string): RuleLink[] {
    const rows = this.db.prepare(`SELECT * FROM rule_links WHERE source_id=? OR target_id=? ORDER BY created_at`).all(ruleSetId, ruleSetId) as Record<string, unknown>[];
    return rows.map(rowToRuleLink);
  }

  /**
   * Clears a particular rule link mapping configuration bridging two sets.
   */
  deleteRuleLink(id: string): void {
    this.db.prepare(`DELETE FROM rule_links WHERE id=?`).run(id);
  }

  /**
   * Tallies and reports the current aggregate sizes of nodes and edges held in the database.
   */
  getStats(): { nodeCount: number; edgeCount: number } {
    const nodeCount = (this.db.prepare(`SELECT COUNT(*) as n FROM symbols WHERE project_id = ?`).get(this.projectId) as { n: number }).n;
    const edgeCount = (this.db.prepare(`SELECT COUNT(*) as n FROM edges WHERE project_id = ?`).get(this.projectId) as { n: number }).n;
    return { nodeCount, edgeCount };
  }

  /**
   * Returns a baseline summary of the active project graph and parse-rule runtime state.
   */
  getGraphStats(): {
    symbolCount: number;
    edgeCount: number;
    docSectionCount: number;
    parseRuleCount: number;
    parseArtifactCount: number;
    codeSourceCount: number;
    docSourceCount: number;
  } {
    const symbolCount = (this.db.prepare(`SELECT COUNT(*) as n FROM symbols WHERE project_id = ?`).get(this.projectId) as { n: number }).n;
    const edgeCount = (this.db.prepare(`SELECT COUNT(*) as n FROM edges WHERE project_id = ?`).get(this.projectId) as { n: number }).n;
    const docSectionCount = (this.db.prepare(`SELECT COUNT(*) as n FROM doc_sections WHERE project_id = ?`).get(this.projectId) as { n: number }).n;
    const parseRuleCount = (this.db.prepare(`SELECT COUNT(*) as n FROM parse_rules WHERE project_id = ?`).get(this.projectId) as { n: number }).n;
    const parseArtifactCount = (this.db.prepare(`SELECT COUNT(*) as n FROM parse_artifacts WHERE project_id = ?`).get(this.projectId) as { n: number }).n;
    const codeSourceCount = (this.getProjectConfig<Array<{ path: string }>>('codeSources') ?? []).length;
    const docSourceCount = (this.getProjectConfig<Array<{ path: string }>>('docSources') ?? []).length;
    return { symbolCount, edgeCount, docSectionCount, parseRuleCount, parseArtifactCount, codeSourceCount, docSourceCount };
  }

  /**
   * Clears out any stale Requirement metadata nodes devoid of SATISFIES or DOCUMENTED_BY edges.
   */
  deleteOrphanRequirements(): number {
    const result = this.db.prepare(`
      DELETE FROM symbols
      WHERE project_id = ? AND type = 'Requirement'
        AND NOT EXISTS (
          SELECT 1 FROM edges
          WHERE project_id = symbols.project_id
            AND (source_id = symbols.id OR target_id = symbols.id)
        )
    `).run(this.projectId);
    return result.changes;
  }

  /**
   * Shuts down the thread-safe connection pool preventing further SQLite interactions.
   */
  close(): void {
    this.db.close();
  }

  // ─── Project config ───────────────────────────────────────────────────────
  /**
   * Safely decodes stringified local project configuration settings from SQLite memory.
   */
  getProjectConfig<T = unknown>(key: string): T | null {
    const row = this.db.prepare(
      `SELECT value FROM project_config WHERE project_id = ? AND key = ?`
    ).get(this.projectId, key) as { value: string } | undefined;
    if (!row) return null;
    try { return JSON.parse(row.value) as T; } catch { return null; }
  }

  /**
   * Stores JSON-serializable custom configuration structures mapping to KnowSync project boundaries.
   */
  setProjectConfig(key: string, value: unknown): void {
    this.db.prepare(`
      INSERT INTO project_config (project_id, key, value)
      VALUES (?, ?, ?)
      ON CONFLICT(project_id, key) DO UPDATE SET value = excluded.value
    `).run(this.projectId, key, JSON.stringify(value));
  }

  /**
   * Manages pending session lifecycles for Agentic Parse Rule evaluations.
   */
  upsertRefineSession(token: string, payload: Record<string, unknown>, roundsRemaining: number): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO parse_rule_refine_sessions (project_id, token, payload_json, rounds_remaining, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, token) DO UPDATE SET
        payload_json = excluded.payload_json,
        rounds_remaining = excluded.rounds_remaining,
        updated_at = excluded.updated_at
    `).run(this.projectId, token, JSON.stringify(payload), roundsRemaining, now, now);
  }

  /**
   * Resumes Agent rule-refine capabilities using standard serialized tracking tokens.
   */
  getRefineSession(token: string): { token: string; payload: Record<string, unknown>; roundsRemaining: number } | null {
    const row = this.db.prepare(`
      SELECT token, payload_json, rounds_remaining
      FROM parse_rule_refine_sessions
      WHERE project_id = ? AND token = ?
    `).get(this.projectId, token) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      token: row['token'] as string,
      payload: safeParseMetadata((row['payload_json'] as string) || '{}') ?? {},
      roundsRemaining: row['rounds_remaining'] as number,
    };
  }

  /**
   * Forgets tracking token metadata finalizing an existing refine-session flow.
   */
  deleteRefineSession(token: string): void {
    this.db.prepare(`DELETE FROM parse_rule_refine_sessions WHERE project_id = ? AND token = ?`).run(this.projectId, token);
  }
}

/**
 * Cleans string queries translating special phrases into viable FTS5 formatted glob lookups.
 */
function toFtsQuery(q: string): string {
  const terms = q.trim().replace(/[^\w\s$]/g, ' ').split(/\s+/).filter(Boolean);
  return terms.map(t => `"${t}"*`).join(' ');
}

/**
 * Maps raw database projection rows into structured GraphNode entities.
 */
function rowToNode(row: Record<string, unknown>): GraphNode {
  const metadataRaw = row['metadata_json'];
  return {
    id: row['id'] as string,
    type: row['type'] as GraphNode['type'],
    name: row['name'] as string,
    filePath: row['file_path'] as string,
    startLine: row['start_line'] as number,
    endLine: row['end_line'] as number,
    signature: row['signature'] as string | undefined,
    docString: row['doc_string'] as string | undefined,
    clusterId: row['cluster_id'] as string | undefined,
    metadata: typeof metadataRaw === 'string' && metadataRaw
      ? safeParseMetadata(metadataRaw)
      : undefined,
  };
}

/**
 * Recasts raw document records matching schema bounds to standardized DocSection models.
 */
function rowToDoc(row: Record<string, unknown>): DocSection {
  const metadataRaw = row['metadata_json'];
  const metadata = typeof metadataRaw === 'string' && metadataRaw
    ? safeParseMetadata(metadataRaw)
    : undefined;
  return {
    id: row['id'] as string,
    filePath: row['file_path'] as string,
    heading: row['heading'] as string,
    slug: (row['slug'] as string) ?? '',
    headingLevel: (row['heading_level'] as number) ?? 1,
    content: row['content'] as string,
    primarySymbolName: typeof metadata?.['primarySymbolName'] === 'string'
      ? metadata['primarySymbolName'] as string
      : undefined,
    linkedSymbols: Array.isArray(metadata?.['linkedSymbols'])
      ? (metadata['linkedSymbols'] as string[])
      : [],
    linkedDocTargets: Array.isArray(metadata?.['linkedDocTargets'])
      ? (metadata['linkedDocTargets'] as string[])
      : [],
    linkedRequirements: Array.isArray(metadata?.['linkedRequirements'])
      ? (metadata['linkedRequirements'] as string[])
      : [],
    metadata,
    startLine: row['start_line'] as number,
    endLine: row['end_line'] as number,
  };
}

/**
 * Decodes row boundaries transforming internal rules schema representations to actionable ParseRules.
 */
function rowToParseRule(row: Record<string, unknown>): ParseRule {
  return {
    id: row['id'] as string,
    language: row['language'] as string,
    ruleType: row['rule_type'] as string,
    name: row['name'] as string,
    query: row['query'] as string,
    packName: (row['pack_name'] as string) || undefined,
    nodeType: (row['node_type'] as string) || undefined,
    edgeType: (row['edge_type'] as string) || undefined,
    nameCapture: (row['name_capture'] as string) || 'name',
    sourceCapture: (row['source_capture'] as string) || 'source',
    targetCapture: (row['target_capture'] as string) || 'target',
    docCapture: (row['doc_capture'] as string) || 'doc',
    symbolCapture: (row['symbol_capture'] as string) || 'symbol',
    priority: row['priority'] as number,
  };
}

/**
 * Flattens artifact string logic templates read directly down from the relational artifact rows.
 */
function rowToParseArtifact(row: Record<string, unknown>): ParseArtifact {
  return {
    id: row['id'] as string,
    language: row['language'] as string,
    artifactType: row['artifact_type'] as ParseArtifact['artifactType'],
    name: row['name'] as string,
    packName: (row['pack_name'] as string) || undefined,
    content: (row['content'] as string) || undefined,
    query: (row['query'] as string) || undefined,
    targetLanguage: (row['target_language'] as string) || undefined,
    rangeCapture: (row['range_capture'] as string) || 'range',
    priority: row['priority'] as number,
  };
}

/**
 * Auto-documented structural element.
 */
function rowToRuleSet(row: Record<string, unknown>): RuleSet {
  return {
    id: row['id'] as string,
    projectId: (row['project_id'] as string | null) ?? null,
    name: row['name'] as string,
    description: (row['description'] as string) ?? '',
    language: row['language'] as string,
    version: (row['version'] as string) ?? '1.0.0',
    isGlobal: Boolean(row['is_global']),
    parentId: (row['parent_id'] as string | null) ?? null,
    grammarWasmUrl: (row['grammar_wasm_url'] as string) ?? '',
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  };
}

/**
 * Auto-documented structural element.
 */
function rowToRuleLink(row: Record<string, unknown>): RuleLink {
  return {
    id: row['id'] as string,
    sourceId: row['source_id'] as string,
    targetId: row['target_id'] as string,
    linkType: row['link_type'] as RuleLink['linkType'],
    createdAt: row['created_at'] as number,
  };
}

/**
 * Auto-documented structural element.
 */
function safeParseMetadata(raw: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return Object.keys(value).length ? value : undefined;
  } catch {
    return undefined;
  }
}
