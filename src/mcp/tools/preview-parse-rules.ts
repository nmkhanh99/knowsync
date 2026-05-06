import { createHash } from 'crypto';
import { readFile, stat } from 'fs/promises';
import { isAbsolute } from 'path';
import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import { crawlRepo } from '../../indexer/file-crawler.js';
import { parseCodeFile } from '../../indexer/code-parser.js';
import { applyDocLinkRulesDetailed, dedupeDocSections } from '../../indexer/rules-engine.js';
import type { EmbeddedDocRegion } from '../../types/index.js';
import { createRequire } from 'module';
import type { CodeSourceConfig } from '../../types/index.js';

const require = createRequire(import.meta.url);
type PreviewMatch = { captures: Array<{ name: string }> };

const RuleSchema = z.object({
  name: z.string(),
  ruleType: z.enum(['node', 'edge', 'resolve', 'linking', 'doc_link']),
  query: z.string(),
  packName: z.string().optional(),
  nodeType: z.string().optional(),
  edgeType: z.string().optional(),
  nameCapture: z.string().optional(),
  sourceCapture: z.string().optional(),
  targetCapture: z.string().optional(),
  docCapture: z.string().optional(),
  symbolCapture: z.string().optional(),
  priority: z.number().optional(),
});

const QueryPackSchema = z.object({
  name: z.string(),
  packType: z.enum(['comment_doc_linking']),
  rules: z.array(RuleSchema),
});

const ArtifactSchema = z.discriminatedUnion('artifactType', [
  z.object({
    name: z.string(),
    artifactType: z.literal('injection_query'),
    packName: z.string().optional(),
    content: z.string(),
    targetLanguage: z.string().optional(),
    priority: z.number().optional(),
  }),
  z.object({
    name: z.string(),
    artifactType: z.literal('included_ranges'),
    packName: z.string().optional(),
    query: z.string(),
    rangeCapture: z.string().optional(),
    priority: z.number().optional(),
  }),
]);

export const schema = {
  language: z.string().describe('Target language, e.g. "typescript", "python". Must be a supported Tree-sitter grammar for live preview.'),
  filePaths: z.array(z.string()).optional().describe('Optional list of absolute file paths to preview. If omitted, files are auto-picked only from configured Code Sources.'),
  limit: z.number().int().min(1).max(20).default(3).describe('How many files to preview when filePaths is omitted. Auto-pick only scans configured Code Sources.'),
  onlyRuleMatches: z.boolean().optional().describe('If true, return only doc sections generated from the provided query packs/rules'),
  matchDetails: z.boolean().optional().describe('If true, include raw capture names, line ranges, and matched rule names per file'),
  rules: z.array(RuleSchema).optional().describe('Direct parse rules to preview'),
  queryPacks: z.array(QueryPackSchema).optional().describe('Named query packs to preview'),
  artifacts: z.array(ArtifactSchema).optional().describe('First-class artifacts such as injections.scm content and included range selectors'),
};

export interface PreviewDocSectionNode {
  id: string;
  heading: string;
  headingLevel: number;
  parentHeading?: string;
  path: string[];
  primarySymbolName?: string;
  linkedSymbols: string[];
  linkedRequirements: string[];
  sourceArtifact?: Record<string, unknown>;
  contentPreview: string;
  startLine: number;
  endLine: number;
  children: PreviewDocSectionNode[];
}

export interface PreviewInjectedMarkdownTree {
  regionId: string;
  sourceArtifact: Record<string, unknown>;
  roots: PreviewDocSectionNode[];
}

interface PreviewFileResult {
  filePath: string;
  symbolCount: number;
  docSectionCount: number;
  docSections: Array<Omit<PreviewDocSectionNode, 'children'>>;
  embeddedDocRegions: Array<{
    id: string;
    heading: string;
    contentPreview: string;
    startLine: number;
    endLine: number;
    sourceArtifact?: Record<string, unknown>;
    sections: PreviewDocSectionNode[];
  }>;
  injectedMarkdownTrees: PreviewInjectedMarkdownTree[];
  matchDetails?: Array<{
    ruleName: string;
    packName?: string;
    filePath: string;
    captures: Array<{
      name: string;
      text: string;
      startLine: number;
      endLine: number;
    }>;
  }>;
  queryErrors: Array<{
    ruleName: string;
    packName?: string;
    filePath: string;
    query: string;
    error: string;
    errorType?: string;
    position?: number;
    line?: number;
    column?: number;
    snippet?: string;
    lineSnippet?: string;
  }>;
}

export interface PreviewParseRulesResult {
  ok: true;
  language: string;
  filesPreviewed: number;
  onlyRuleMatches: boolean;
  matchDetails: boolean;
  packs: string[];
  artifacts: Array<Record<string, unknown>>;
  artifactErrors: Array<Record<string, unknown>>;
  previews: PreviewFileResult[];
}

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export async function previewParseRules(
  _db: GraphDB,
  args: {
    codeSources?: CodeSourceConfig[];
    language: string;
    filePaths?: string[];
    limit?: number;
    onlyRuleMatches?: boolean;
    matchDetails?: boolean;
    rules?: z.infer<typeof RuleSchema>[];
    queryPacks?: z.infer<typeof QueryPackSchema>[];
    artifacts?: z.infer<typeof ArtifactSchema>[];
  },
): Promise<PreviewParseRulesResult | { ok: false; error: string }> {
  // Validate grammar is available before crawling
  try { getGrammar(args.language); } catch {
    return { ok: false, error: `Unsupported Tree-sitter grammar for language "${args.language}". Supported: javascript, typescript, python.` };
  }

  const directRules = args.rules ?? [];
  const packedRules = (args.queryPacks ?? []).flatMap((pack) =>
    pack.rules.map((rule) => ({ ...rule, packName: pack.name }))
  );
  const rules = [...directRules, ...packedRules].map((rule) => ({
    id: `preview:${args.language}:${rule.packName ?? 'direct'}:${rule.name}:${rule.ruleType}`,
    language: args.language,
    ...rule,
  }));
  const artifacts = (args.artifacts ?? []).map((artifact) => ({
    id: `preview:${args.language}:${artifact.packName ?? 'direct'}:${artifact.name}:${artifact.artifactType}`,
    language: args.language,
    ...artifact,
  }));

  const files = args.filePaths?.length
    ? args.filePaths
    : await pickPreviewFiles(args.codeSources ?? [], args.language, args.limit ?? 3);

  if (!files.length) {
    return {
      ok: false,
      error: 'No preview files found. Configure Code Sources for the active project or pass explicit filePaths.',
    };
  }
  if (files.some((filePath) => !isAbsolute(filePath))) {
    return {
      ok: false,
      error: 'preview_parse_rules expects absolute filePaths. Auto-picked files come from absolute Code Sources.',
    };
  }

  const artifactPreview = await previewArtifacts('', args.language, files, args.artifacts ?? []);

  const previews: PreviewFileResult[] = [];
  for (const filePath of files) {
    const file = await readFile(filePath);
    const s = await stat(filePath);
    const parsed = await parseCodeFile(
      filePath,
      args.language,
      createHash('sha256').update(file).digest('hex').slice(0, 16),
      s.mtimeMs,
      rules,
      artifacts,
    );
    const docSections = args.onlyRuleMatches
      ? await previewRuleDocsOnly(filePath, args.language, rules)
      : parsed.embeddedDocs;
    const embeddedDocRegions = buildEmbeddedDocRegions(parsed.embeddedDocRegions ?? []);
    const previewDocSections = docSections.map((doc) => ({
      id: doc.id,
      heading: doc.heading,
      headingLevel: doc.headingLevel,
      path: [doc.heading],
      primarySymbolName: doc.primarySymbolName,
      linkedSymbols: doc.linkedSymbols,
      linkedRequirements: doc.linkedRequirements ?? [],
      sourceArtifact: (doc.metadata?.['sourceArtifact'] as Record<string, unknown> | undefined) ?? undefined,
      contentPreview: doc.content.slice(0, 240),
      startLine: doc.startLine,
      endLine: doc.endLine,
    }));
    const matchPreview = await previewRuleMatchDetails(filePath, args.language, rules);
    const matchDetails = args.matchDetails ? matchPreview.matchDetails : undefined;
    const queryErrors = matchPreview.queryErrors;

    previews.push({
      filePath,
      symbolCount: parsed.nodes.length,
      docSectionCount: docSections.length,
      docSections: previewDocSections,
      embeddedDocRegions,
      injectedMarkdownTrees: buildInjectedMarkdownTrees(embeddedDocRegions),
      matchDetails,
      queryErrors,
    });
  }

  return {
    ok: true,
    language: args.language,
    filesPreviewed: previews.length,
    onlyRuleMatches: args.onlyRuleMatches ?? false,
    matchDetails: args.matchDetails ?? false,
    packs: (args.queryPacks ?? []).map((pack) => pack.name),
    artifacts: artifactPreview.artifacts,
    artifactErrors: artifactPreview.errors,
    previews,
  };
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
function buildEmbeddedDocRegions(regions: EmbeddedDocRegion[]) {
  return regions.map((region) => ({
    id: region.id,
    heading: region.heading,
    contentPreview: region.content.slice(0, 240),
    startLine: region.startLine,
    endLine: region.endLine,
    sourceArtifact: (region.metadata?.['sourceArtifact'] as Record<string, unknown> | undefined) ?? undefined,
    sections: buildSectionTree(
      region.sections.map((doc) => ({
        id: doc.id,
        heading: doc.heading,
        headingLevel: doc.headingLevel,
        path: [doc.heading],
        primarySymbolName: doc.primarySymbolName,
        linkedSymbols: doc.linkedSymbols,
        linkedRequirements: doc.linkedRequirements ?? [],
        sourceArtifact: (doc.metadata?.['sourceArtifact'] as Record<string, unknown> | undefined) ?? undefined,
        contentPreview: doc.content.slice(0, 240),
        startLine: doc.startLine,
        endLine: doc.endLine,
      })),
    ),
  }));
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
function buildInjectedMarkdownTrees(regions: Array<{
  id: string;
  sourceArtifact?: Record<string, unknown>;
  sections: PreviewDocSectionNode[];
}>) {
  return regions
    .filter((region) => region.sourceArtifact?.['targetLanguage'] === 'markdown')
    .map((region) => ({
      regionId: String(region.sourceArtifact?.['regionId'] ?? region.id),
      sourceArtifact: region.sourceArtifact ?? {},
      roots: region.sections,
    }));
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
function buildSectionTree(sections: Array<Omit<PreviewDocSectionNode, 'children' | 'parentHeading' | 'path'>>): PreviewDocSectionNode[] {
  const roots: PreviewDocSectionNode[] = [];
  const stack: PreviewDocSectionNode[] = [];
  const sorted = [...sections].sort((a, b) =>
    a.startLine - b.startLine || a.headingLevel - b.headingLevel || a.endLine - b.endLine || a.id.localeCompare(b.id)
  );

  for (const section of sorted) {
    const node: PreviewDocSectionNode = { ...section, children: [], path: [section.heading] };
    while (stack.length > 0 && stack[stack.length - 1].headingLevel >= node.headingLevel) {
      stack.pop();
    }
    const parent = stack.at(-1);
    if (parent) {
      node.parentHeading = parent.heading;
      node.path = [...parent.path, section.heading];
      parent.children.push(node);
    } else {
      node.parentHeading = undefined;
      roots.push(node);
    }
    stack.push(node);
  }

  return roots;
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function pickPreviewFiles(
  codeSources: CodeSourceConfig[],
  language: string,
  limit: number,
): Promise<string[]> {
  if (!codeSources.length) return [];
  const { codeFiles } = await crawlRepo([language], undefined, codeSources);
  return codeFiles.slice(0, limit).map((file) => file.filePath);
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function previewRuleDocsOnly(filePath: string, language: string, rules: Array<z.infer<typeof RuleSchema> & { id: string; language: string }>) {
  const tree = await parseTree(filePath, language);
  return dedupeDocSections(applyDocLinkRulesDetailed(tree, filePath, language, rules).docs);
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function previewRuleMatchDetails(filePath: string, language: string, rules: Array<z.infer<typeof RuleSchema> & { id: string; language: string }>) {
  const tree = await parseTree(filePath, language);
  const { matchDetails, queryErrors } = applyDocLinkRulesDetailed(tree, filePath, language, rules);
  return { matchDetails, queryErrors };
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function parseTree(filePath: string, language: string) {
  const TreeSitter = require('tree-sitter') as new () => { parse(src: string): { rootNode: unknown }; setLanguage(l: unknown): void };
  const parser = new TreeSitter();
  switch (language) {
    case 'javascript':
      parser.setLanguage(require('tree-sitter-javascript'));
      break;
    case 'typescript': {
      const ts = require('tree-sitter-typescript') as { typescript: unknown; tsx: unknown };
      parser.setLanguage(ts.tsx ?? ts.typescript);
      break;
    }
    case 'python':
      parser.setLanguage(require('tree-sitter-python'));
      break;
  }
  const source = await readFile(filePath, 'utf-8');
  return parser.parse(source);
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function previewArtifacts(
  _unusedSourceScope: string,
  language: string,
  filePaths: string[],
  artifacts: z.infer<typeof ArtifactSchema>[],
) {
  const errors: Array<Record<string, unknown>> = [];
  const summaries: Array<Record<string, unknown>> = [];
  const trees = new Map<string, unknown>();

  for (const artifact of artifacts) {
    if (artifact.artifactType === 'injection_query') {
      const compiled = tryCompileQuery(language, artifact.content);
      if (!compiled.ok) {
        errors.push({
          artifactType: artifact.artifactType,
          name: artifact.name,
          packName: artifact.packName,
          error: compiled.error,
        });
        continue;
      }
      summaries.push({
        artifactType: artifact.artifactType,
        name: artifact.name,
        packName: artifact.packName,
        targetLanguage: artifact.targetLanguage,
        status: 'validated',
      });
      continue;
    }

    if (artifact.artifactType === 'included_ranges') {
      const compiled = tryCompileQuery(language, artifact.query);
      if (!compiled.ok) {
        errors.push({
          artifactType: artifact.artifactType,
          name: artifact.name,
          packName: artifact.packName,
          error: compiled.error,
        });
        continue;
      }

      const captureName = artifact.rangeCapture ?? 'range';
      let totalRanges = 0;
      for (const filePath of filePaths) {
        const tree = trees.has(filePath) ? trees.get(filePath)! : await parseTree(filePath, language);
        trees.set(filePath, tree);
        for (const match of compiled.query!.matches((tree as { rootNode: unknown }).rootNode)) {
          totalRanges += match.captures.filter((capture) => capture.name === captureName).length;
        }
      }
      summaries.push({
        artifactType: artifact.artifactType,
        name: artifact.name,
        packName: artifact.packName,
        rangeCapture: captureName,
        matchedRanges: totalRanges,
        status: 'validated',
      });
    }
  }

  return { artifacts: summaries, errors };
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
function tryCompileQuery(language: string, source: string) {
  try {
    const TreeSitter = require('tree-sitter') as { Query: new (language: unknown, source: string) => { matches(root: unknown): PreviewMatch[] } };
    const grammar = getGrammar(language);
    return { ok: true as const, query: new TreeSitter.Query(grammar.language ?? grammar, source) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
function getGrammar(language: string) {
  switch (language) {
    case 'javascript':
      return require('tree-sitter-javascript');
    case 'typescript': {
      const ts = require('tree-sitter-typescript') as { typescript: unknown; tsx: unknown };
      return ts.tsx ?? ts.typescript;
    }
    case 'python':
      return require('tree-sitter-python');
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}
