import { createRequire } from 'module';
import { parseMarkdownSectionsFromText } from './docs-parser.js';
import { makeDocId, makeNodeId } from '../graph/builder.js';
import type { DocSection, EmbeddedDocRegion, GraphNode, GraphEdge, ParseArtifact, ParseRule } from '../types/index.js';

const require = createRequire(import.meta.url);
const TreeSitter = require('tree-sitter') as {
  Query: new (language: unknown, source: string) => {
    matches(root: unknown): TSMatch[];
  };
};

interface TSCapture { name: string; node: { text: string; startPosition: { row: number }; endPosition: { row: number } } }
interface TSMatch { captures: TSCapture[] }
interface TSLanguage { language?: unknown }

type SupportedLang = 'javascript' | 'typescript' | 'python';

const langCache = new Map<SupportedLang, TSLanguage>();
const RE_DOC_WIKI_LINK = /\[\[doc:([^\]]+)\]\]/g;
const RE_DOC_AT_REF = /@doc:([^\s)]+)/g;

/**
 * Auto-documented structural element.
 */
function getLanguageObj(lang: SupportedLang): TSLanguage | null {
  if (langCache.has(lang)) return langCache.get(lang)!;
  try {
    let langObj: TSLanguage;
    switch (lang) {
      case 'javascript':
        langObj = require('tree-sitter-javascript') as TSLanguage;
        break;
      case 'typescript': {
        const ts = require('tree-sitter-typescript') as { typescript: TSLanguage; tsx: TSLanguage };
        langObj = ts.tsx ?? ts.typescript;
        break;
      }
      case 'python':
        langObj = require('tree-sitter-python') as TSLanguage;
        break;
      default:
        return null;
    }
    langCache.set(lang, langObj);
    return langObj;
  } catch { return null; }
}

export function applyParseRules(
  tree: { rootNode: unknown },
  filePath: string,
  language: string,
  rules: ParseRule[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const langObj = getLanguageObj(language as SupportedLang);
  if (!langObj) return { nodes, edges };

  const nodeRules = rules.filter(r => r.ruleType === 'node' && r.language === language);
  const edgeRules = rules.filter(r => r.ruleType === 'edge' && r.language === language);

  for (const rule of nodeRules) {
    if (!rule.nodeType || !rule.query) continue;
    let tsQuery: { matches(root: unknown): TSMatch[] };
    try { tsQuery = compileQuery(langObj, rule.query); } catch { continue; }

    const nameCapture = rule.nameCapture ?? 'name';
    for (const match of tsQuery.matches(tree.rootNode)) {
      const nc = match.captures.find(c => c.name === nameCapture);
      if (!nc) continue;
      const name = nc.node.text;
      const startLine = nc.node.startPosition.row + 1;
      const endLine = nc.node.endPosition.row + 1;
      const id = makeNodeId(filePath, name, startLine);
      const nodeType = rule.nodeType as GraphNode['type'];
      nodes.push({ id, type: nodeType, name, filePath, startLine, endLine });
    }
  }

  for (const rule of edgeRules) {
    if (!rule.edgeType || !rule.query) continue;
    let tsQuery: { matches(root: unknown): TSMatch[] };
    try { tsQuery = compileQuery(langObj, rule.query); } catch { continue; }

    const srcCap = rule.sourceCapture ?? 'source';
    const tgtCap = rule.targetCapture ?? 'target';
    for (const match of tsQuery.matches(tree.rootNode)) {
      const sc = match.captures.find(c => c.name === srcCap);
      const tc = match.captures.find(c => c.name === tgtCap);
      if (!sc || !tc) continue;
      const srcLine = sc.node.startPosition.row + 1;
      const srcId = makeNodeId(filePath, sc.node.text, srcLine);
      const edgeId = `${srcId}->${rule.edgeType}->${tc.node.text}:rules`;
      edges.push({
        id: edgeId,
        type: rule.edgeType as GraphEdge['type'],
        sourceId: srcId,
        targetId: tc.node.text,
      });
    }
  }

  return { nodes, edges };
}

/**
 * Creates comment-doc sections from `doc_link` rules.
 *
 * @doc:../../docs/architecture/04-4-codeparser-rulesengine.md#rulesengine-hien-ho-tro-gi
 * @doc:../../docs/guide/16-8-ai-parse-rules.md#8-ai-parse-rules
 */
export function applyDocLinkRules(
  tree: { rootNode: unknown },
  filePath: string,
  language: string,
  rules: ParseRule[],
): DocSection[] {
  return applyDocLinkRulesDetailed(tree, filePath, language, rules).docs;
}

export function applyDocLinkRulesDetailed(
  tree: { rootNode: unknown },
  filePath: string,
  language: string,
  rules: ParseRule[],
): {
  docs: DocSection[];
  matchDetails: Array<{
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
} {
  const docs: DocSection[] = [];
  const matchDetails: Array<{
    ruleName: string;
    packName?: string;
    filePath: string;
    captures: Array<{
      name: string;
      text: string;
      startLine: number;
      endLine: number;
    }>;
  }> = [];
  const queryErrors: Array<{
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
  }> = [];
  const langObj = getLanguageObj(language as SupportedLang);
  if (!langObj) return { docs, matchDetails, queryErrors };

  const docRules = rules.filter((r) => r.ruleType === 'doc_link' && r.language === language);
  for (const rule of docRules) {
    let tsQuery: { matches(root: unknown): TSMatch[] };
    try {
      tsQuery = compileQuery(langObj, rule.query);
    } catch (error) {
      const normalized = normalizeQueryError(rule.query, error);
      queryErrors.push({
        ruleName: rule.name,
        packName: rule.packName,
        filePath,
        query: rule.query,
        error: normalized.error,
        errorType: normalized.errorType,
        position: normalized.position,
        line: normalized.line,
        column: normalized.column,
        snippet: normalized.snippet,
        lineSnippet: normalized.lineSnippet,
      });
      continue;
    }

    const docCapture = rule.docCapture ?? 'doc';
    const symbolCapture = rule.symbolCapture ?? rule.nameCapture ?? 'symbol';
    for (const match of tsQuery.matches(tree.rootNode)) {
      matchDetails.push({
        ruleName: rule.name,
        packName: rule.packName,
        filePath,
        captures: match.captures.map((capture) => ({
          name: capture.name,
          text: capture.node.text,
          startLine: capture.node.startPosition.row + 1,
          endLine: capture.node.endPosition.row + 1,
        })),
      });

      const dc = match.captures.find((c) => c.name === docCapture);
      const sc = match.captures.find((c) => c.name === symbolCapture);
      if (!dc || !sc) continue;

      const symbolName = sc.node.text.trim();
      const content = normalizeCommentText(dc.node.text);
      if (!symbolName || !content) continue;

      const startLine = dc.node.startPosition.row + 1;
      const linkedSymbols = Array.from(new Set([symbolName, ...extractSymbolRefs(content)]));
      const linkedRequirements = extractRequirementIds(content);
      const linkedDocTargets = extractDocRefs(content);
      docs.push({
        id: makeDocId(filePath, `${rule.name}:${symbolName}`, startLine),
        filePath,
        heading: `${symbolName} Comment Doc`,
        slug: `${slugify(symbolName)}-comment-doc`,
        headingLevel: 6,
        content,
        primarySymbolName: symbolName,
        linkedSymbols,
        linkedDocTargets,
        linkedRequirements,
        metadata: {
          primarySymbolName: symbolName,
          linkedSymbols,
          linkedDocTargets,
          linkedRequirements,
        },
        startLine,
        endLine: dc.node.endPosition.row + 1,
      });
    }
  }

  return { docs: dedupeDocs(docs), matchDetails, queryErrors };
}

/**
 * Auto-documented structural element.
 */
export function dedupeDocSections(docs: DocSection[]): DocSection[] {
  return dedupeDocs(docs);
}

export function applyParseArtifacts(
  tree: { rootNode: unknown },
  filePath: string,
  language: string,
  artifacts: ParseArtifact[],
): {
  docs: DocSection[];
  regions: EmbeddedDocRegion[];
  artifactSummaries: Array<Record<string, unknown>>;
  artifactErrors: Array<Record<string, unknown>>;
} {
  const docs: DocSection[] = [];
  const regions: EmbeddedDocRegion[] = [];
  const artifactSummaries: Array<Record<string, unknown>> = [];
  const artifactErrors: Array<Record<string, unknown>> = [];
  const langObj = getLanguageObj(language as SupportedLang);
  if (!langObj) return { docs, regions, artifactSummaries, artifactErrors };

  const langArtifacts = artifacts.filter((artifact) => artifact.language === language);
  for (const artifact of langArtifacts) {
    if (artifact.artifactType === 'injection_query') {
      if (!artifact.content) continue;
      let query: { matches(root: unknown): TSMatch[] };
      try {
        query = compileQuery(langObj, artifact.content);
      } catch (error) {
        artifactErrors.push({
          artifactType: artifact.artifactType,
          name: artifact.name,
          packName: artifact.packName,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      let matchCount = 0;
      for (const match of query.matches(tree.rootNode)) {
        const contentCapture = match.captures.find((capture) => capture.name === 'injection.content' || capture.name === 'content');
        if (!contentCapture) continue;
        const content = normalizeCommentText(contentCapture.node.text);
        if (!content) continue;
        matchCount++;
        if (artifact.targetLanguage === 'markdown') {
          const regionId = makeArtifactRegionId(filePath, artifact, contentCapture.node.startPosition.row + 1, contentCapture.node.endPosition.row + 1);
          const regionSections = parseMarkdownSectionsFromText(content, filePath, {
            lineOffset: contentCapture.node.startPosition.row,
            metadata: makeSourceArtifactMetadata(artifact, {
              regionId,
              regionStartLine: contentCapture.node.startPosition.row + 1,
              regionEndLine: contentCapture.node.endPosition.row + 1,
            }),
          });
          regions.push({
            id: regionId,
            filePath,
            heading: `${artifact.name} Embedded Markdown Region`,
            content,
            startLine: contentCapture.node.startPosition.row + 1,
            endLine: contentCapture.node.endPosition.row + 1,
            metadata: makeSourceArtifactMetadata(artifact, {
              regionId,
              regionStartLine: contentCapture.node.startPosition.row + 1,
              regionEndLine: contentCapture.node.endPosition.row + 1,
            }),
            sections: regionSections,
          });
          docs.push(...regionSections);
        } else {
          docs.push(makeArtifactDocSection(filePath, artifact, content, contentCapture.node.startPosition.row + 1, contentCapture.node.endPosition.row + 1, artifact.targetLanguage));
        }
      }

      artifactSummaries.push({
        artifactType: artifact.artifactType,
        name: artifact.name,
        packName: artifact.packName,
        targetLanguage: artifact.targetLanguage,
        matchedDocs: matchCount,
        status: 'applied',
      });
      continue;
    }

    if (artifact.artifactType === 'included_ranges') {
      if (!artifact.query) continue;
      let query: { matches(root: unknown): TSMatch[] };
      try {
        query = compileQuery(langObj, artifact.query);
      } catch (error) {
        artifactErrors.push({
          artifactType: artifact.artifactType,
          name: artifact.name,
          packName: artifact.packName,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const rangeCapture = artifact.rangeCapture ?? 'range';
      let matchedRanges = 0;
      for (const match of query.matches(tree.rootNode)) {
        for (const capture of match.captures.filter((item) => item.name === rangeCapture)) {
          const content = capture.node.text.trim();
          if (!content) continue;
          matchedRanges++;
          docs.push(makeArtifactDocSection(filePath, artifact, content, capture.node.startPosition.row + 1, capture.node.endPosition.row + 1));
        }
      }

      artifactSummaries.push({
        artifactType: artifact.artifactType,
        name: artifact.name,
        packName: artifact.packName,
        rangeCapture,
        matchedRanges,
        status: 'applied',
      });
    }
  }

  return {
    docs: dedupeDocs(docs),
    regions,
    artifactSummaries,
    artifactErrors,
  };
}

export interface RuleMatchDetail {
  ruleName: string;
  packName?: string;
  filePath: string;
  captures: Array<{
    name: string;
    text: string;
    startLine: number;
    endLine: number;
  }>;
}

/**
 * Auto-documented structural element.
 */
export function collectDocLinkRuleMatches(
  tree: { rootNode: unknown },
  filePath: string,
  language: string,
  rules: ParseRule[],
): RuleMatchDetail[] {
  return applyDocLinkRulesDetailed(tree, filePath, language, rules).matchDetails;
}

/**
 * Auto-documented structural element.
 */
function normalizeCommentText(text: string): string {
  if (text.startsWith('/**') || text.startsWith('/*')) {
    return text
      .replace(/^\/\*\*?\s*/m, '')
      .replace(/\s*\*\/$/m, '')
      .replace(/^\s*\*\s?/gm, '')
      .trim();
  }
  return text
    .replace(/^\s*\/\/\/?\s?/gm, '')
    .replace(/^\s*#\s?/gm, '')
    .trim();
}

/**
 * Auto-documented structural element.
 */
function extractSymbolRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(/@([A-Za-z$_][\w$]*)/g)) refs.add(match[1]);
  for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    if (!match[1].startsWith('doc:')) refs.add(match[1]);
  }
  return Array.from(refs);
}

/**
 * Auto-documented structural element.
 */
function extractRequirementIds(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(/\b(?:BRD|PRD|FRD)-[A-Z0-9-]+\b/g)) ids.add(match[0]);
  return Array.from(ids);
}

/**
 * Auto-documented structural element.
 */
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Auto-documented structural element.
 */
function dedupeDocs(docs: DocSection[]): DocSection[] {
  const seen = new Set<string>();
  const result: DocSection[] = [];
  for (const doc of docs) {
    const key = `${doc.filePath}:${doc.primarySymbolName ?? ''}:${doc.startLine}:${doc.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(doc);
  }
  return result;
}

/**
 * Auto-documented structural element.
 */
function compileQuery(langObj: TSLanguage, source: string): { matches(root: unknown): TSMatch[] } {
  return new TreeSitter.Query(langObj.language ?? langObj, source);
}

/**
 * Auto-documented structural element.
 * @doc:../../docs/architecture/04-4-codeparser-rulesengine.md#rule-types-va-artifacts
 */
function makeArtifactDocSection(
  filePath: string,
  artifact: ParseArtifact,
  content: string,
  startLine: number,
  endLine: number,
  targetLanguage?: string,
): DocSection {
  const heading = targetLanguage
    ? `${artifact.name} ${targetLanguage} Injection`
    : `${artifact.name} Included Range`;
  return {
    id: makeDocId(filePath, `${artifact.name}:${startLine}`, startLine),
    filePath,
    heading,
    slug: slugify(heading),
    headingLevel: 6,
    content,
    primarySymbolName: undefined,
    linkedSymbols: extractSymbolRefs(content),
    linkedDocTargets: extractDocRefs(content),
    linkedRequirements: extractRequirementIds(content),
    metadata: {
      ...makeSourceArtifactMetadata(artifact),
      linkedSymbols: extractSymbolRefs(content),
      linkedDocTargets: extractDocRefs(content),
      linkedRequirements: extractRequirementIds(content),
    },
    startLine,
    endLine,
  };
}

/**
 * Auto-documented structural element.
 * @doc:../../docs/guide/19-9-huong-dan-ra-lenh-cho-ai-agent-qua-mcp.md#chuan-annotation-khi-ai-viet-docscode
 */
function extractDocRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(RE_DOC_WIKI_LINK)) refs.add(match[1].trim());
  for (const match of text.matchAll(RE_DOC_AT_REF)) refs.add(match[1].trim());
  return Array.from(refs).filter(Boolean);
}

/**
 * Auto-documented structural element.
 */
function makeSourceArtifactMetadata(artifact: ParseArtifact, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceArtifact: {
      id: artifact.id,
      name: artifact.name,
      artifactType: artifact.artifactType,
      packName: artifact.packName,
      targetLanguage: artifact.targetLanguage,
      rangeCapture: artifact.rangeCapture,
      ...extra,
    },
  };
}

/**
 * Auto-documented structural element.
 */
function makeArtifactRegionId(
  filePath: string,
  artifact: ParseArtifact,
  startLine: number,
  endLine: number,
): string {
  return `${filePath}:${artifact.id}:${startLine}:${endLine}`;
}

/**
 * Auto-documented structural element.
 */
function normalizeQueryError(
  query: string,
  error: unknown,
): {
  error: string;
  errorType?: string;
  position?: number;
  line?: number;
  column?: number;
  snippet?: string;
  lineSnippet?: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  const typeMatch = message.match(/Query error of type (\w+)/);
  const positionMatch = message.match(/at position (\d+)/);
  const position = positionMatch ? Number(positionMatch[1]) : undefined;
  const lineColumn = position !== undefined ? getLineColumnFromOffset(query, position) : undefined;

  return {
    error: message,
    errorType: typeMatch?.[1],
    position,
    line: lineColumn?.line,
    column: lineColumn?.column,
    snippet: position !== undefined ? makeQuerySnippet(query, position) : undefined,
    lineSnippet: lineColumn ? makeLineSnippet(query, lineColumn.line, lineColumn.column) : undefined,
  };
}

/**
 * Auto-documented structural element.
 */
function makeQuerySnippet(query: string, position: number): string {
  const radius = 24;
  const start = Math.max(0, position - radius);
  const end = Math.min(query.length, position + radius);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < query.length ? '...' : '';
  return `${prefix}${query.slice(start, position)}[HERE]${query.slice(position, end)}${suffix}`;
}

/**
 * Auto-documented structural element.
 */
function getLineColumnFromOffset(query: string, offset: number): { line: number; column: number } {
  const bounded = Math.max(0, Math.min(offset, query.length));
  let line = 1;
  let lastLineStart = 0;

  for (let i = 0; i < bounded; i++) {
    if (query[i] === '\n') {
      line++;
      lastLineStart = i + 1;
    }
  }

  return {
    line,
    column: bounded - lastLineStart + 1,
  };
}

/**
 * Auto-documented structural element.
 */
function makeLineSnippet(query: string, line: number, column: number): string {
  const lines = query.split('\n');
  const lineText = lines[line - 1] ?? '';
  return `${lineText}\n${' '.repeat(Math.max(0, column - 1))}^`;
}
