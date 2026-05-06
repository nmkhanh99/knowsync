import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { GraphDB } from '../graph/db.js';
import { GraphDB as GraphDBImpl } from '../graph/db.js';
import { getSymbol, schema as getSymbolSchema } from './tools/get-symbol.js';
import { getCallers, schema as getCallersSchema } from './tools/get-callers.js';
import { getLinkedDocs, schema as getLinkedDocsSchema } from './tools/get-linked-docs.js';
import { getImpact, schema as getImpactSchema } from './tools/get-impact.js';
import { getProcessFlow, schema as getProcessFlowSchema } from './tools/get-process-flow.js';
import { searchGraph, schema as searchGraphSchema } from './tools/search-graph.js';
import { checkDocSync, schema as checkDocSyncSchema } from './tools/check-doc-sync.js';
import { getModuleOverview, schema as getModuleOverviewSchema } from './tools/get-module-overview.js';
import { suggestDocLinks, schema as suggestDocLinksSchema } from './tools/suggest-doc-links.js';
import { createDocLink, schema as createDocLinkSchema } from './tools/create-doc-link.js';
import { validateLinks, schema as validateLinksSchema } from './tools/validate-links.js';
import { getDocSection, schema as getDocSectionSchema } from './tools/get-doc-section.js';
import { provideParseRules, schema as provideParseRulesSchema } from './tools/provide-parse-rules.js';
import { buildGraph, schema as buildGraphSchema } from './tools/build-graph.js';
import { getFullContext, schema as getFullContextSchema } from './tools/get-full-context.js';
import { regenerateDoc, schema as regenerateDocSchema } from './tools/regenerate-doc.js';
import { getDocVisualization, schema as getDocVisualizationSchema } from './tools/get-doc-visualization.js';
import { getRequirementTrace, schema as getRequirementTraceSchema } from './tools/get-requirement-trace.js';
import { getDocFlowTrace, schema as getDocFlowTraceSchema } from './tools/get-doc-flow-trace.js';
import { getGraphStats, schema as getGraphStatsSchema } from './tools/get-graph-stats.js';
import { previewParseRules, schema as previewParseRulesSchema } from './tools/preview-parse-rules.js';
import { previewApplyParseRules, schema as previewApplyParseRulesSchema } from './tools/preview-apply-parse-rules.js';
import { scanDocSources, schema as scanDocSourcesSchema } from './tools/scan-doc-sources.js';
import { setVisualDocsConfig, schema as setVisualDocsConfigSchema } from './tools/set-visual-docs-config.js';
import { getDocLinkMarks, schema as getDocLinkMarksSchema } from './tools/get-doc-link-marks.js';
import { resolveDocLinkMark, schema as resolveDocLinkMarkSchema } from './tools/resolve-doc-link-mark.js';
import { ruleSets, schema as ruleSetsSchema } from './tools/rule-sets.js';
import { ruleLinks, schema as ruleLinksSchema } from './tools/rule-links.js';
import { describeSetActiveProjectResult, schema as setActiveProjectSchema } from './tools/set-active-project.js';
import type { RegisteredProject } from '../cli/registry.js';

/**
 * Synchronous runtime payload wrapper intercepting Tool logic to map outputs 
 * or uncaught exception errors safely directly into MCP JSON responses.
 * @doc:../../docs/architecture/08-8-mcp-server-17-tools-3-groups.md#8-mcp-server-26-tools
 */
function wrap<T>(fn: () => T): { content: Array<{ type: 'text'; text: string }>; isError?: true } {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(fn(), null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
}

/**
 * Asynchronous execution payload wrapper parsing resolved Promises and converting 
 * rejection errors safely directly into MCP stringified JSON responses.
 * @doc:../../docs/architecture/08-8-mcp-server-17-tools-3-groups.md#error-handling
 */
async function asyncWrap<T>(fn: () => Promise<T>): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: true }> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
}

/**
 * Registers all MCP tools for one loaded project graph.
 *
 * @doc:../../docs/architecture/08-8-mcp-server-17-tools-3-groups.md#8-mcp-server-26-tools
 * @doc:../../docs/guide/19-9-huong-dan-ra-lenh-cho-ai-agent-qua-mcp.md#9-huong-dan-ra-lenh-cho-ai-agent-qua-mcp
 */
export async function startMcpServer(
  dbPath: string,
  projects: RegisteredProject[],
  initialProjectId?: string,
): Promise<void> {
  const dbs = new Map<string, GraphDB>();
  for (const project of projects) {
    const db = new GraphDBImpl(dbPath, project.id);
    await db.init();
    dbs.set(project.id, db);
  }

  let activeProjectId = initialProjectId && dbs.has(initialProjectId)
    ? initialProjectId
    : (projects.find((project) => dbs.has(project.id))?.id ?? '');

  function getActiveProject(): RegisteredProject {
    const project = projects.find((item) => item.id === activeProjectId);
    if (!project) throw new Error('No active project selected in this MCP session');
    return project;
  }

  function getActiveDb(): GraphDB {
    const db = dbs.get(activeProjectId);
    if (!db) throw new Error('No active project database selected in this MCP session');
    return db;
  }

  const serverName = getActiveProject().code ? `knowsync_${getActiveProject().code}` : 'knowsync';
  const server = new McpServer({ name: serverName, version: '0.1.0' });

  server.tool('knowsync_get_project_info',
    'Get currently loaded project context (name, unique code, root path) to determine which project graph is actively loaded in this MCP server.',
    {},
    async () => wrap(() => ({
      activeProject: {
        id: getActiveProject().id,
        name: getActiveProject().name,
        code: getActiveProject().code ?? null,
        docSources: getActiveProject().docSources ?? [],
        codeSources: getActiveProject().codeSources ?? [],
      },
      availableProjects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        code: project.code ?? null,
        docSourceCount: project.docSources?.length ?? 0,
        codeSourceCount: project.codeSources?.length ?? 0,
      })),
    }))
  );

  server.tool('knowsync_set_active_project',
    'Switch the active project context used by all KnowSync MCP tools in this session using the unique project code from the registry.',
    setActiveProjectSchema,
    async (args) => wrap(() => {
      const project = projects.find((item) => item.code === args.projectCode);
      if (!project) throw new Error(`Project code "${args.projectCode}" not found in registry`);
      if (!dbs.has(project.id)) throw new Error(`Project code "${args.projectCode}" is registered but its graph database is not available`);
      activeProjectId = project.id;
      return describeSetActiveProjectResult({
        id: project.id,
        name: project.name,
        code: project.code,
      });
    })
  );

  server.tool('knowsync_get_symbol',
    'Get symbol information (function, class, type, variable) from the knowledge graph',
    getSymbolSchema,
    async (args) => wrap(() => getSymbol(getActiveDb(), args))
  );

  server.tool('knowsync_get_callers',
    'Find all symbols that call a given function',
    getCallersSchema,
    async (args) => wrap(() => getCallers(getActiveDb(), args))
  );

  server.tool('knowsync_get_linked_docs',
    'Find documentation linked to a symbol or flow',
    getLinkedDocsSchema,
    async (args) => wrap(() => getLinkedDocs(getActiveDb(), args))
  );

  server.tool('knowsync_get_impact',
    'Analyze impact of changing a symbol — direct and transitive callers, linked docs',
    getImpactSchema,
    async (args) => wrap(() => getImpact(getActiveDb(), args))
  );

  server.tool('knowsync_get_process_flow',
    'Trace the call flow from an entry point function',
    getProcessFlowSchema,
    async (args) => wrap(() => getProcessFlow(getActiveDb(), args))
  );

  server.tool('knowsync_get_graph_stats',
    'Get baseline graph and parse-rule runtime counts for the active project.',
    getGraphStatsSchema,
    async () => wrap(() => getGraphStats(getActiveDb()))
  );

  server.tool('knowsync_get_doc_flow_trace',
    'Trace one documentation flow into code: doc layers before/after, linked symbols, then CALLS flow from those symbols.',
    getDocFlowTraceSchema,
    async (args) => wrap(() => getDocFlowTrace(getActiveDb(), args))
  );

  server.tool('knowsync_search_graph',
    'Search the knowledge graph by symbol name, keyword, or partial name',
    searchGraphSchema,
    async (args) => wrap(() => searchGraph(getActiveDb(), args))
  );

  server.tool('knowsync_check_doc_sync',
    'Check if a symbol has up-to-date documentation',
    checkDocSyncSchema,
    async (args) => wrap(() => checkDocSync(getActiveDb(), args))
  );

  server.tool('knowsync_get_module_overview',
    'Get an overview of a module: all symbols, file list, top-called symbols',
    getModuleOverviewSchema,
    async (args) => wrap(() => getModuleOverview(getActiveDb(), args))
  );

  server.tool('knowsync_suggest_doc_links',
    'Find symbols mentioned in a doc section that are not yet linked, or find doc sections that mention a symbol. Returns link suggestions for AI-assisted linking.',
    suggestDocLinksSchema,
    async (args) => wrap(() => suggestDocLinks(getActiveDb(), args))
  );

  server.tool('knowsync_create_doc_link',
    'Create a manual REFERENCES edge between a DocSection and a Symbol. This link persists across re-indexing.',
    createDocLinkSchema,
    async (args) => wrap(() => createDocLink(getActiveDb(), args))
  );

  server.tool('knowsync_validate_links',
    'Find stale doc links (pointing to symbols that no longer exist) and report link coverage.',
    validateLinksSchema,
    async (_args) => wrap(() => validateLinks(getActiveDb(), {}))
  );

  server.tool('knowsync_get_doc_section_content',
    'Get full content of a doc section including slug anchor and heading level. Use to retrieve Markdown content for rendering.',
    getDocSectionSchema,
    async (args) => wrap(() => getDocSection(getActiveDb(), args))
  );

  server.tool('knowsync_provide_parse_rules',
    'Store AI-provided Tree-sitter S-expression parse rules for any language. language is a free string (e.g. "typescript", "go", "rust"). These rules define how KnowSync extracts nodes and edges from code.',
    provideParseRulesSchema,
    async (args) => wrap(() => provideParseRules(getActiveDb(), args))
  );

  server.tool('knowsync_build_graph',
    'Trigger full or delta graph build. Indexes code + docs and persists to the knowledge graph. ' +
    'Only Code Sources are scanned for code, and only Doc Sources are scanned for docs.',
    buildGraphSchema,
    async (args) => asyncWrap(() => buildGraph(getActiveDb(), {
      ...args,
      fallbackCodeSources: getActiveProject().codeSources,
      fallbackDocSources: getActiveProject().docSources,
    }))
  );

  server.tool('knowsync_get_full_context',
    'Get rich context for a symbol: direct/transitive callers, callees, linked docs, and sibling symbols in the same module.',
    getFullContextSchema,
    async (args) => wrap(() => getFullContext(getActiveDb(), args))
  );

  server.tool('knowsync_regenerate_doc',
    'Create or update a Markdown doc section for a symbol with AI-generated content. Creates a DOCUMENTED_BY edge that survives re-indexing.',
    regenerateDocSchema,
    async (args) => wrap(() => regenerateDoc(getActiveDb(), args))
  );

  server.tool('knowsync_get_doc_visualization',
    'Get the doc-centric subgraph (DocSections + linked symbols + edges) for visualization or AI context.',
    getDocVisualizationSchema,
    async (args) => wrap(() => getDocVisualization(getActiveDb(), args))
  );

  server.tool('knowsync_get_requirement_trace',
    'Trace BRD/PRD/FRD requirement IDs to code symbols and linked docs, or inspect requirement links for a symbol.',
    getRequirementTraceSchema,
    async (args) => wrap(() => getRequirementTrace(getActiveDb(), args))
  );

  server.tool('knowsync_preview_parse_rules',
    'Preview parse rules or query packs against a few files without writing to the graph database.',
    previewParseRulesSchema,
    async (args) => asyncWrap(() => previewParseRules(getActiveDb(), {
      ...args,
      codeSources: getActiveProject().codeSources,
    }))
  );

  server.tool('knowsync_preview_apply_parse_rules',
    'Preview parse rules on a few files, then optionally persist them when query validation looks clean.',
    previewApplyParseRulesSchema,
    async (args) => asyncWrap(() => previewApplyParseRules(getActiveDb(), {
      ...args,
      codeSources: getActiveProject().codeSources,
    }))
  );

  server.tool('knowsync_scan_doc_sources',
    'Scan the project filesystem for Markdown directories and files. Use this to discover candidate doc sources before calling knowsync_set_visual_docs_config.',
    scanDocSourcesSchema,
    async (args) => wrap(() => scanDocSources(getActiveDb(), {
      ...args,
      seedPaths: [...(getActiveProject().docSources ?? []), ...(getActiveProject().codeSources ?? [])]
        .map((source) => source.path.trim())
        .filter(Boolean),
    }))
  );

  server.tool('knowsync_set_visual_docs_config',
    'Save codeSources, docSources and visualDocs config to the knowledge graph without triggering re-indexing. ' +
    'AI agents use this after analyzing project structure to configure code scanning paths, Visual Docs display (labels, colors, order, grouping mode).',
    setVisualDocsConfigSchema,
    async (args) => wrap(() => setVisualDocsConfig(getActiveDb(), args))
  );

  server.tool('knowsync_get_doc_link_marks',
    'Get pending doc-link marks — actions (link/unlink) performed manually in the UI that need to be reflected in source markdown files. Use this to find what docs/symbols or doc/doc annotations need to be updated so @symbolName, [[symbolName]], @doc:..., or [[doc:...]] stay in sync.',
    getDocLinkMarksSchema,
    async (args) => wrap(() => getDocLinkMarks(getActiveDb(), args))
  );

  server.tool('knowsync_resolve_doc_link_mark',
    'Mark a doc-link mark as resolved after the corresponding source file has been updated.',
    resolveDocLinkMarkSchema,
    async (args) => wrap(() => resolveDocLinkMark(getActiveDb(), args))
  );

  server.tool('knowsync_rule_sets',
    'Manage Parse RuleSets — groups of Tree-sitter queries with 3-level inheritance (Global → Project → override). ' +
    'Actions: list (see all RuleSets), create (new RuleSet for a language), update (rename/change parent/version), ' +
    'delete (remove without deleting rules), fork (clone as child with parentId set), ' +
    'get (full detail with rules+artifacts+links), get_resolved (merge full inheritance chain). ' +
    'Use ruleSetId in knowsync_provide_parse_rules to assign imported rules directly to a RuleSet.',
    ruleSetsSchema,
    async (args) => wrap(() => ruleSets(getActiveDb(), args))
  );

  server.tool('knowsync_rule_links',
    'Manage dependency links between RuleSets. ' +
    'inherit: target rules applied first, source overrides. ' +
    'override: source completely replaces target. ' +
    'inject: cross-language injection (e.g. JS RuleSet injects into HTML RuleSet). ' +
    'Actions: list (links for a RuleSet), create (add link), delete (remove link by ID).',
    ruleLinksSchema,
    async (args) => wrap(() => ruleLinks(getActiveDb(), args))
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`KnowSync MCP server representing [${getActiveProject().code || getActiveProject().name || 'global'}] running on stdio\n`);
}
