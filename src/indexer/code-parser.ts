import { readFile } from 'fs/promises';
import { createRequire } from 'module';
import { basename, extname } from 'path';
import { makeDocId, makeNodeId } from '../graph/builder.js';
import { applyDocLinkRules, applyParseArtifacts, applyParseRules } from './rules-engine.js';
import type { DocSection, GraphNode, GraphEdge, ParsedFile, PendingCall, NodeType } from '../types/index.js';
import type { ParseArtifact, ParseRule } from '../types/index.js';

const require = createRequire(import.meta.url);

// ─── Tree-sitter node interface ───────────────────────────────────────────────

interface TSNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  namedChildCount: number;
  child(i: number): TSNode;
  namedChild(i: number): TSNode | null;
  childForFieldName(name: string): TSNode | null;
  previousNamedSibling: TSNode | null;
  parent: TSNode | null;
}

type Language = 'javascript' | 'typescript' | 'python';
const RE_REQUIREMENT_ID = /\b(?:BRD|PRD|FRD)-[A-Z0-9-]+\b/g;
const RE_DOC_WIKI_LINK = /\[\[doc:([^\]]+)\]\]/g;
const RE_DOC_AT_REF = /@doc:([^\s)]+)/g;

// ─── Parser cache (one parser instance per language) ─────────────────────────

type TSParser = { parse(src: string): { rootNode: TSNode }; setLanguage(l: unknown): void };
const parserCache: Partial<Record<Language, TSParser>> = {};

/**
 * Auto-documented structural element.
 */
function getParser(lang: Language): TSParser {
  if (parserCache[lang]) return parserCache[lang]!;

  const TreeSitter = require('tree-sitter') as new () => TSParser;
  const parser = new TreeSitter();

  switch (lang) {
    case 'javascript':
      parser.setLanguage(require('tree-sitter-javascript'));
      break;
    case 'typescript': {
      // Use tsx grammar as superset — handles both .ts and .tsx
      const ts = require('tree-sitter-typescript') as { typescript: unknown; tsx: unknown };
      parser.setLanguage(ts.tsx ?? ts.typescript);
      break;
    }
    case 'python':
      parser.setLanguage(require('tree-sitter-python'));
      break;
  }

  parserCache[lang] = parser;
  return parser;
}

// ─── Symbol node type sets ────────────────────────────────────────────────────

// Nodes that are functions/methods (become scope owners for CALLS tracking)
const FUNCTION_NODE_TYPES = new Set([
  'function_declaration',
  'generator_function_declaration',
  'method_definition',
  'variable_declarator',   // only when value is arrow_function / function_expression
  'function_definition',   // Python def
]);

// Nodes that are classes (not scope owners for CALLS, but still symbols)
const CLASS_NODE_TYPES = new Set([
  'class_declaration',
  'class_expression',
  'abstract_class_declaration',
  'class_definition',      // Python class
]);

// TypeScript-only structural types
const TS_STRUCTURAL_TYPES = new Set([
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
]);

const ALL_SYMBOL_TYPES = new Set([
  ...FUNCTION_NODE_TYPES,
  ...CLASS_NODE_TYPES,
  ...TS_STRUCTURAL_TYPES,
]);

// ─── Walk context ─────────────────────────────────────────────────────────────

interface DeferredCall {
  callerId: string;
  calleeName: string;
}

interface WalkContext {
  filePath: string;
  language: Language;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** name → list of node IDs (multiple overloads can share a name) */
  nameToIds: Map<string, string[]>;
  /** Stack of enclosing function node IDs for CALLS attribution */
  scopeStack: string[];
  deferredCalls: DeferredCall[];
  /** Calls whose callee was not found in this file — resolved in second pass */
  pendingCalls: PendingCall[];
  lines: string[];
  fileModuleId: string;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Parses one code file into symbols, code edges, embedded docs, and injected
 * markdown regions.
 *
 * @doc:../../docs/architecture/04-4-codeparser-rulesengine.md#4-codeparser-rulesengine
 * @doc:../../docs/architecture/02-2-pipeline-tong-the.md#2-pipeline-tong-the
 */
export async function parseCodeFile(
  filePath: string,
  language: string,
  contentHash: string,
  lastModified: number,
  parseRules: ParseRule[] = [],
  parseArtifacts: ParseArtifact[] = [],
): Promise<ParsedFile> {
  const supported: Language[] = ['javascript', 'typescript', 'python'];
  if (!supported.includes(language as Language)) {
    return { filePath, language, nodes: [], edges: [], embeddedDocs: [], embeddedDocRegions: [], pendingCalls: [], contentHash, lastModified };
  }

  const lang = language as Language;
  let parser: TSParser;
  try {
    parser = getParser(lang);
  } catch {
    // Tree-sitter native addon not available (e.g. CI without build tools)
    return { filePath, language, nodes: [], edges: [], embeddedDocs: [], embeddedDocRegions: [], pendingCalls: [], contentHash, lastModified };
  }

  const rawSource = await readFile(filePath, 'utf-8');
  const source = shouldExtractEmbeddedJavaScript(filePath, language)
    ? extractEmbeddedJavaScript(rawSource)
    : rawSource;
  const lines = source.split('\n');
  const tree = parser.parse(source);

  // Every file gets a Module node representing the file itself
  const moduleName = basename(filePath, extname(filePath));
  const fileModuleId = makeNodeId(filePath, '__module__', 0);
  const fileModule: GraphNode = {
    id: fileModuleId,
    type: 'Module',
    name: moduleName,
    filePath,
    startLine: 1,
    endLine: lines.length,
  };

  const ctx: WalkContext = {
    filePath,
    language: lang,
    nodes: [fileModule],
    edges: [],
    nameToIds: new Map([[moduleName, [fileModuleId]]]),
    scopeStack: [],
    deferredCalls: [],
    pendingCalls: [],
    lines,
    fileModuleId,
  };

  walkNode(tree.rootNode, ctx);
  resolveCallEdges(ctx);
  const ruleGraph = applyParseRules(tree, filePath, language, parseRules);
  mergeRuleGraph(ctx, ruleGraph);
  const builtInEmbeddedDocs = buildEmbeddedDocs(ctx.nodes);
  const ruleEmbeddedDocs = applyDocLinkRules(tree, filePath, language, parseRules);
  const artifactResult = applyParseArtifacts(tree, filePath, language, parseArtifacts);
  const artifactEmbeddedDocs = artifactResult.docs;
  const artifactEmbeddedRegions = artifactResult.regions;
  const embeddedDocs = mergeEmbeddedDocs(mergeEmbeddedDocs(builtInEmbeddedDocs, ruleEmbeddedDocs), artifactEmbeddedDocs);

  return {
    filePath,
    language,
    nodes: ctx.nodes,
    edges: ctx.edges,
    embeddedDocs,
    embeddedDocRegions: artifactEmbeddedRegions,
    pendingCalls: ctx.pendingCalls,
    contentHash,
    lastModified,
  };
}

/**
 * Auto-documented structural element.
 */
function shouldExtractEmbeddedJavaScript(filePath: string, language: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return language === 'javascript' && (ext === '.html' || ext === '.htm');
}

/**
 * Auto-documented structural element.
 */
function extractEmbeddedJavaScript(source: string): string {
  const totalLines = source.split('\n').length;
  const outputLines = new Array<string>(totalLines).fill('');
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of source.matchAll(scriptRe)) {
    const scriptContent = match[1] ?? '';
    const fullMatch = match[0] ?? '';
    const fullIndex = match.index ?? 0;
    const contentOffset = fullMatch.indexOf(scriptContent);
    const contentIndex = fullIndex + Math.max(0, contentOffset);
    const startLine = source.slice(0, contentIndex).split('\n').length - 1;
    const scriptLines = scriptContent.split('\n');

    for (let i = 0; i < scriptLines.length; i++) {
      const lineIndex = startLine + i;
      if (lineIndex >= outputLines.length) break;
      outputLines[lineIndex] = outputLines[lineIndex]
        ? `${outputLines[lineIndex]}\n${scriptLines[i]}`
        : scriptLines[i];
    }
  }

  return outputLines.join('\n');
}

/**
 * Auto-documented structural element.
 */
function mergeRuleGraph(
  ctx: WalkContext,
  ruleGraph: { nodes: GraphNode[]; edges: GraphEdge[] },
): void {
  const knownNodeIds = new Set(ctx.nodes.map((node) => node.id));
  for (const node of ruleGraph.nodes) {
    if (knownNodeIds.has(node.id)) continue;
    ctx.nodes.push(node);
    knownNodeIds.add(node.id);
    const ids = ctx.nameToIds.get(node.name) ?? [];
    ids.push(node.id);
    ctx.nameToIds.set(node.name, ids);
  }

  const knownEdgeIds = new Set(ctx.edges.map((edge) => edge.id));
  for (const edge of ruleGraph.edges) {
    if (knownEdgeIds.has(edge.id)) continue;
    ctx.edges.push(edge);
    knownEdgeIds.add(edge.id);
  }
}

// ─── Recursive AST walker ─────────────────────────────────────────────────────

function walkNode(node: TSNode, ctx: WalkContext): void {
  const type = node.type;

  // Track call sites so we can build CALLS edges after the walk
  if (type === 'call_expression' || type === 'new_expression') {
    const callerScope = ctx.scopeStack.at(-1);
    if (callerScope) {
      const callee = extractCalleeName(node);
      if (callee) ctx.deferredCalls.push({ callerId: callerScope, calleeName: callee });
    }
    // Continue recursion — there may be nested calls
  }

  // Capture import edges
  if (type === 'import_statement' && ctx.language !== 'python') {
    extractJSImport(node, ctx);
  }
  if (type === 'import_from_statement' || (type === 'import_statement' && ctx.language === 'python')) {
    extractPyImport(node, ctx);
  }

  // Try to extract this node as a named symbol
  const sym = tryExtractSymbol(node, ctx);
  if (sym) {
    ctx.nodes.push(sym);
    const ids = ctx.nameToIds.get(sym.name) ?? [];
    ids.push(sym.id);
    ctx.nameToIds.set(sym.name, ids);
  }

  // If this is a function-like symbol, it owns a new call scope
  const isScopeOwner = sym !== null && isFunctionLikeNode(node, ctx.language);
  if (isScopeOwner) ctx.scopeStack.push(sym!.id);

  for (let i = 0; i < node.childCount; i++) {
    walkNode(node.child(i), ctx);
  }

  if (isScopeOwner) ctx.scopeStack.pop();
}

// ─── Symbol extraction ────────────────────────────────────────────────────────

function tryExtractSymbol(node: TSNode, ctx: WalkContext): GraphNode | null {
  if (!ALL_SYMBOL_TYPES.has(node.type)) return null;

  const info = extractSymbolInfo(node, ctx.language, ctx.lines);
  if (!info) return null;

  return {
    id: makeNodeId(ctx.filePath, info.name, info.startLine),
    type: info.nodeType,
    name: info.name,
    filePath: ctx.filePath,
    startLine: info.startLine,
    endLine: info.endLine,
    signature: info.signature,
    docString: info.docString,
    metadata: info.requirementIds.length ? { requirementIds: info.requirementIds } : undefined,
  };
}

interface SymbolInfo {
  name: string;
  nodeType: NodeType;
  startLine: number;
  endLine: number;
  signature: string;
  docString: string;
  requirementIds: string[];
}

/**
 * Auto-documented structural element.
 * @doc:../../docs/architecture/04-4-codeparser-rulesengine.md#built-in-parser-coverage
 */
function extractSymbolInfo(node: TSNode, language: Language, lines: string[]): SymbolInfo | null {
  const type = node.type;
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const sig = lines[startLine - 1]?.trim() ?? '';

  switch (type) {
    // ── JS / TS functions ──────────────────────────────────────────────────

    case 'function_declaration':
    case 'generator_function_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return null;
      const docString = extractLeadingComment(node);
      return { name, nodeType: 'Function', startLine, endLine, signature: sig, docString, requirementIds: extractRequirementIds(docString) };
    }

    case 'method_definition': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return null;
      const docString = extractLeadingComment(node);
      return { name, nodeType: 'Method', startLine, endLine, signature: sig, docString, requirementIds: extractRequirementIds(docString) };
    }

    case 'variable_declarator': {
      // Only extract when the value is an arrow function or function expression
      const nameNode = node.childForFieldName('name');
      const valueNode = node.childForFieldName('value');
      if (!nameNode || !valueNode) return null;
      if (valueNode.type !== 'arrow_function' && valueNode.type !== 'function_expression') return null;
      const docString = extractLeadingComment(node.parent ?? node);
      return { name: nameNode.text, nodeType: 'Function', startLine, endLine, signature: sig, docString, requirementIds: extractRequirementIds(docString) };
    }

    // ── JS / TS classes ────────────────────────────────────────────────────

    case 'class_declaration':
    case 'abstract_class_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return null;
      const docString = extractLeadingComment(node);
      return { name, nodeType: 'Class', startLine, endLine, signature: `class ${name}`, docString, requirementIds: extractRequirementIds(docString) };
    }

    case 'class_expression': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return null; // anonymous class expressions are not useful
      const docString = extractLeadingComment(node);
      return { name, nodeType: 'Class', startLine, endLine, signature: `class ${name}`, docString, requirementIds: extractRequirementIds(docString) };
    }

    // ── TypeScript structural types ────────────────────────────────────────

    case 'interface_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return null;
      const docString = extractLeadingComment(node);
      return { name, nodeType: 'Interface', startLine, endLine, signature: `interface ${name}`, docString, requirementIds: extractRequirementIds(docString) };
    }

    case 'type_alias_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return null;
      const docString = extractLeadingComment(node);
      return { name, nodeType: 'Type', startLine, endLine, signature: `type ${name}`, docString, requirementIds: extractRequirementIds(docString) };
    }

    case 'enum_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return null;
      const docString = extractLeadingComment(node);
      return { name, nodeType: 'Type', startLine, endLine, signature: `enum ${name}`, docString, requirementIds: extractRequirementIds(docString) };
    }

    // ── Python ────────────────────────────────────────────────────────────

    case 'function_definition': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return null;
      const docString = extractPyDocString(node);
      return { name, nodeType: 'Function', startLine, endLine, signature: sig, docString, requirementIds: extractRequirementIds(docString) };
    }

    case 'class_definition': {
      const name = node.childForFieldName('name')?.text;
      if (!name) return null;
      const docString = extractPyDocString(node);
      return { name, nodeType: 'Class', startLine, endLine, signature: `class ${name}`, docString, requirementIds: extractRequirementIds(docString) };
    }

    default:
      return null;
  }
}

/**
 * Auto-documented structural element.
 */
function isFunctionLikeNode(node: TSNode, _language: Language): boolean {
  const type = node.type;
  if (FUNCTION_NODE_TYPES.has(type) && type !== 'variable_declarator') return true;
  if (type === 'variable_declarator') {
    const val = node.childForFieldName('value');
    return val?.type === 'arrow_function' || val?.type === 'function_expression';
  }
  return false;
}

// ─── DocString extraction ─────────────────────────────────────────────────────

function extractLeadingComment(node: TSNode): string {
  const comments: string[] = [];
  let current = node.previousNamedSibling;
  while (current?.type === 'comment') {
    comments.unshift(normalizeCommentText(current.text));
    current = current.previousNamedSibling;
  }
  const direct = comments.filter(Boolean).join('\n').trim();
  if (direct) return direct;

  // Exported declarations often sit under an export_statement wrapper, so the
  // leading comment is attached to the parent statement rather than the symbol node.
  const parent = node.parent;
  if (parent && parent.type === 'export_statement') {
    const parentComments: string[] = [];
    let parentCurrent = parent.previousNamedSibling;
    while (parentCurrent?.type === 'comment') {
      parentComments.unshift(normalizeCommentText(parentCurrent.text));
      parentCurrent = parentCurrent.previousNamedSibling;
    }
    return parentComments.filter(Boolean).join('\n').trim();
  }

  return '';
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
  return text.replace(/^\s*\/\/\/?\s?/gm, '').trim();
}

/** Extracts Python docstring (first expression if it's a string literal). */
function extractPyDocString(node: TSNode): string {
  const body = node.childForFieldName('body');
  if (!body) return '';
  const first = body.namedChild(0);
  if (!first) return '';

  // expression_statement containing a string
  if (first.type === 'expression_statement') {
    const expr = first.namedChild(0);
    if (expr?.type === 'string') {
      return expr.text.replace(/^['"]{1,3}|['"]{1,3}$/g, '').trim();
    }
  }
  return '';
}

/**
 * Auto-documented structural element.
 */
function extractRequirementIds(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(RE_REQUIREMENT_ID)) ids.add(match[0]);
  return Array.from(ids);
}

/**
 * Auto-documented structural element.
 * @doc:../../docs/architecture/04-4-codeparser-rulesengine.md#4-codeparser-rulesengine
 */
function buildEmbeddedDocs(nodes: GraphNode[]): DocSection[] {
  const docs: DocSection[] = [];

  for (const node of nodes) {
    const content = node.docString?.trim();
    if (!content || node.type === 'Module' || node.type === 'Requirement') continue;
    const linkedSymbols = Array.from(new Set([node.name, ...extractSymbolRefs(content)]));
    const linkedRequirements = extractRequirementIds(content);
    const linkedDocTargets = extractDocRefs(content);

    docs.push({
      id: makeDocId(node.filePath, `${node.name}:comment-doc`, Math.max(1, node.startLine - 1)),
      filePath: node.filePath,
      heading: `${node.name} Comment Doc`,
      slug: `${slugify(node.name)}-comment-doc`,
      headingLevel: 6,
      content,
      primarySymbolName: node.name,
      linkedSymbols,
      linkedDocTargets,
      linkedRequirements,
      metadata: {
        primarySymbolName: node.name,
        linkedSymbols,
        linkedDocTargets,
        linkedRequirements,
      },
      startLine: Math.max(1, node.startLine - 1),
      endLine: node.startLine,
    });
  }

  return docs;
}

/**
 * Auto-documented structural element.
 */
function mergeEmbeddedDocs(baseDocs: DocSection[], ruleDocs: DocSection[]): DocSection[] {
  /**
   * Auto-documented structural element.
   */
  const keyOf = (doc: DocSection) => `${doc.primarySymbolName ?? ''}:${doc.startLine}:${doc.content}`;
  const indexByKey = new Map(baseDocs.map((doc, index) => [keyOf(doc), index]));
  const merged = [...baseDocs];
  for (const doc of ruleDocs) {
    const key = keyOf(doc);
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      const existing = merged[existingIndex];
      merged[existingIndex] = {
        ...existing,
        metadata: {
          ...(existing.metadata ?? {}),
          ...(doc.metadata ?? {}),
          sourceArtifact: doc.metadata?.['sourceArtifact'] ?? existing.metadata?.['sourceArtifact'],
        },
      };
      continue;
    }
    indexByKey.set(key, merged.length);
    merged.push(doc);
  }
  return merged;
}

/**
 * Auto-documented structural element.
 * @doc:../../docs/guide/19-9-huong-dan-ra-lenh-cho-ai-agent-qua-mcp.md#chuan-annotation-khi-ai-viet-docscode
 */
function extractDocRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(RE_DOC_WIKI_LINK)) refs.add(m[1].trim());
  for (const m of text.matchAll(RE_DOC_AT_REF)) refs.add(m[1].trim());
  return Array.from(refs).filter(Boolean);
}

function extractSymbolRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(/@([A-Za-z$_][\w$]*)/g)) refs.add(match[1]);
  for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    if (!match[1].startsWith('doc:')) refs.add(match[1]);
  }
  return Array.from(refs);
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ─── Callee name extraction ───────────────────────────────────────────────────

function extractCalleeName(callNode: TSNode): string | null {
  if (callNode.type === 'new_expression') {
    const ctor = callNode.childForFieldName('constructor');
    return ctor?.type === 'identifier' ? ctor.text : null;
  }

  // call_expression: callee is the "function" field
  const fnNode = callNode.childForFieldName('function');
  if (!fnNode) return null;

  if (fnNode.type === 'identifier') return fnNode.text;

  // obj.method() → extract "method" from member_expression
  if (fnNode.type === 'member_expression') {
    const prop = fnNode.childForFieldName('property');
    if (prop?.type === 'property_identifier') return prop.text;
  }

  return null;
}

// ─── Call edge resolution ─────────────────────────────────────────────────────

/**
 * Auto-documented structural element.
 * @doc:../../docs/architecture/04-4-codeparser-rulesengine.md#pending-calls-va-second-pass
 */
function resolveCallEdges(ctx: WalkContext): void {
  const seen = new Set<string>();

  for (const { callerId, calleeName } of ctx.deferredCalls) {
    const calleeIds = ctx.nameToIds.get(calleeName);

    if (!calleeIds) {
      // Callee not defined in this file — defer to second-pass resolution
      ctx.pendingCalls.push({ callerId, calleeName });
      continue;
    }

    for (const calleeId of calleeIds) {
      if (callerId === calleeId) continue;
      const edgeId = `${callerId}->CALLS->${calleeId}`;
      if (seen.has(edgeId)) continue;
      seen.add(edgeId);
      ctx.edges.push({ id: edgeId, type: 'CALLS', sourceId: callerId, targetId: calleeId });
    }
  }
}

// ─── Import edge extraction ───────────────────────────────────────────────────

function extractJSImport(node: TSNode, ctx: WalkContext): void {
  // Find string child = the module source, e.g. './utils' or "react"
  let source = '';
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'string') {
      source = child.text.replace(/['"]/g, '');
      break;
    }
  }
  if (!source || source.startsWith('.')) return; // skip relative imports (not in graph yet)

  const importedModuleId = makeNodeId(source, '__module__', 0);
  const edgeId = `${ctx.fileModuleId}->IMPORTS->${importedModuleId}`;
  if (ctx.edges.some((e) => e.id === edgeId)) return;

  // Stub node for external module
  if (!ctx.nodes.some((n) => n.id === importedModuleId)) {
    ctx.nodes.push({
      id: importedModuleId,
      type: 'Module',
      name: source,
      filePath: source,
      startLine: 0,
      endLine: 0,
    });
  }

  ctx.edges.push({ id: edgeId, type: 'IMPORTS', sourceId: ctx.fileModuleId, targetId: importedModuleId });
}

/**
 * Auto-documented structural element.
 */
function extractPyImport(node: TSNode, ctx: WalkContext): void {
  let moduleName = '';

  if (node.type === 'import_from_statement') {
    // from X import Y
    const moduleNode = node.childForFieldName('module_name');
    if (moduleNode) {
      moduleName = moduleNode.text;
    } else {
      // Fallback: first dotted_name or relative_import child
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'dotted_name' || child.type === 'relative_import') {
          moduleName = child.text;
          break;
        }
      }
    }
  } else {
    // import X (or import X as Y)
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'dotted_name') { moduleName = child.text; break; }
    }
  }

  if (!moduleName || moduleName.startsWith('.')) return;

  const importedModuleId = makeNodeId(moduleName, '__module__', 0);
  const edgeId = `${ctx.fileModuleId}->IMPORTS->${importedModuleId}`;
  if (ctx.edges.some((e) => e.id === edgeId)) return;

  if (!ctx.nodes.some((n) => n.id === importedModuleId)) {
    ctx.nodes.push({
      id: importedModuleId,
      type: 'Module',
      name: moduleName,
      filePath: moduleName,
      startLine: 0,
      endLine: 0,
    });
  }

  ctx.edges.push({ id: edgeId, type: 'IMPORTS', sourceId: ctx.fileModuleId, targetId: importedModuleId });
}
