import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit, SKIP } from 'unist-util-visit';
import { makeDocId } from '../graph/builder.js';
import type { DocSection, ParsedDoc } from '../types/index.js';

// ─── Symbol reference patterns ────────────────────────────────────────────────
// @doc:../../docs/architecture/05-5-docsparser.md#5-docsparser

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** @functionName style references */
const RE_AT_REF = /@([A-Za-z$_][\w$]*)/g;
/** [[WikiLink]] style references */
const RE_WIKI_LINK = /\[\[([^\]]+)\]\]/g;
/** BRD/PRD/FRD requirement references */
const RE_REQUIREMENT_ID = /\b(?:BRD|PRD|FRD)-[A-Z0-9-]+\b/g;
/** [[doc:path/to/file.md#slug]] or [[doc:#slug]] */
const RE_DOC_WIKI_LINK = /\[\[doc:([^\]]+)\]\]/g;
/** @doc:path/to/file.md#slug or @doc:#slug */
const RE_DOC_AT_REF = /@doc:([^\s)]+)/g;
/** `symbolName` in headings */
const RE_CODE_SPAN_SYMBOL = /`([A-Za-z$_][\w$]*)`/g;
/** Standalone identifier-like headings */
const RE_STANDALONE_SYMBOL = /^@?([A-Za-z$_][\w$]*)(?:\(\))?$/;

// ─── Internal types ───────────────────────────────────────────────────────────

interface SectionDraft {
  heading: string;
  depth: number;
  startLine: number;
  contentParts: string[];
  symbols: Set<string>;
  requirements: Set<string>;
}

export interface MarkdownSectionOptions {
  lineOffset?: number;
  metadata?: Record<string, unknown>;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parseDocFile(
  filePath: string,
  contentHash: string,
  lastModified: number,
): Promise<ParsedDoc> {
  const source = await readFile(filePath, 'utf-8');
  const sections = parseMarkdownSectionsFromText(source, filePath);

  return { filePath, sections, contentHash, lastModified };
}

export function parseMarkdownSectionsFromText(
  source: string,
  filePath: string,
  options: MarkdownSectionOptions = {},
): DocSection[] {
  const lineOffset = options.lineOffset ?? 0;
  const totalLines = source.split('\n').length;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tree = unified().use(remarkParse).parse(source) as any;

  const drafts: SectionDraft[] = [];

  let current: SectionDraft = {
    heading: 'root',
    depth: 0,
    startLine: 1 + lineOffset,
    contentParts: [],
    symbols: new Set(),
    requirements: new Set(),
  };

  // Single-pass over top-level AST nodes.
  // SKIP prevents the outer visitor from descending into children we've already consumed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, (node: any) => {
    if (node.type === 'root') return; // let visit enter root's children

    if (node.type === 'heading') {
      if (current.contentParts.length > 0 || drafts.length > 0 || current.heading !== 'root') {
        drafts.push(current);
      }
      current = {
        heading: collectText(node),
        depth: (node.depth as number) ?? 1,
        startLine: (node.position?.start?.line ?? 1) + lineOffset,
        contentParts: [],
        symbols: new Set(),
        requirements: new Set(),
      };
      return SKIP; // heading children are already consumed by collectText
    }

    if (node.type === 'paragraph') {
      const { text, symbols, requirements } = collectParagraph(node);
      if (text) current.contentParts.push(text);
      for (const s of symbols) current.symbols.add(s);
      for (const req of requirements) current.requirements.add(req);
      return SKIP;
    }

    if (node.type === 'code') {
      const lang = node.lang ? `\`\`\`${node.lang}\n` : '```\n';
      current.contentParts.push(`${lang}${node.value as string}\n\`\`\``);
      return SKIP;
    }

    if (node.type === 'list') {
      const { text, symbols, requirements } = collectList(node);
      if (text) current.contentParts.push(text);
      for (const s of symbols) current.symbols.add(s);
      for (const req of requirements) current.requirements.add(req);
      return SKIP;
    }

    if (node.type === 'blockquote') {
      const text = collectText(node);
      if (text) current.contentParts.push(`> ${text}`);
      return SKIP;
    }

    if (node.type === 'table') {
      return SKIP; // skip tables
    }

    if (node.type === 'thematicBreak') {
      return SKIP;
    }
  });

  // Flush the last section
  drafts.push(current);

  // Convert drafts → DocSection, fixing up endLine boundaries.
  // @doc:../../docs/architecture/05-5-docsparser.md#docsection-schema
  return drafts.map((draft, i) => {
    const nextStart = drafts[i + 1]?.startLine ?? totalLines + lineOffset + 1;
    const content = draft.contentParts.join('\n\n');

    // Collect any remaining @ref / [[link]] from the assembled content
    const headingSymbols = extractSymbolRefs(draft.heading);
    const linkedDocTargets = new Set<string>(extractDocRefs(draft.heading, filePath));
    const linkedSymbols = new Set([...headingSymbols, ...draft.symbols]);
    const linkedRequirements = new Set(draft.requirements);
    for (const m of draft.heading.matchAll(RE_CODE_SPAN_SYMBOL)) linkedSymbols.add(m[1]);
    for (const m of content.matchAll(RE_AT_REF)) linkedSymbols.add(m[1]);
    for (const m of content.matchAll(RE_WIKI_LINK)) {
      if (!m[1].startsWith('doc:')) linkedSymbols.add(m[1]);
    }
    for (const ref of extractDocRefs(content, filePath)) linkedDocTargets.add(ref);
    for (const m of draft.heading.matchAll(RE_REQUIREMENT_ID)) linkedRequirements.add(m[0]);
    for (const m of content.matchAll(RE_REQUIREMENT_ID)) linkedRequirements.add(m[0]);
    const primarySymbolName = inferPrimarySymbolName(draft.heading, headingSymbols);
    const metadata = {
      ...(options.metadata ?? {}),
      primarySymbolName: primarySymbolName ?? null,
      linkedSymbols: Array.from(linkedSymbols),
      linkedDocTargets: Array.from(linkedDocTargets),
      linkedRequirements: Array.from(linkedRequirements),
    };

    return {
      id: makeDocId(filePath, draft.heading, draft.startLine),
      filePath,
      heading: draft.heading,
      slug: slugify(draft.heading),
      headingLevel: draft.depth,
      content,
      primarySymbolName,
      linkedSymbols: Array.from(linkedSymbols),
      linkedDocTargets: Array.from(linkedDocTargets),
      linkedRequirements: Array.from(linkedRequirements),
      metadata,
      startLine: draft.startLine,
      endLine: nextStart - 1,
    };
  });
}

// ─── Text collection helpers ──────────────────────────────────────────────────

/** Recursively collects plain text from any remark AST node. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectText(node: any): string {
  if (node.type === 'text') return node.value as string;
  if (node.type === 'inlineCode') return `\`${node.value as string}\``;
  if (node.type === 'html') return '';
  if (node.type === 'break') return ' ';

  const children: unknown[] = node.children ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (children as any[]).map(collectText).join('');
}

interface CollectResult {
  text: string;
  symbols: string[];
  requirements: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectParagraph(node: any): CollectResult {
  const text = collectText(node).trim();
  return {
    text,
    symbols: extractSymbolRefs(text),
    requirements: extractRequirementRefs(text),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectList(node: any): CollectResult {
  const items: string[] = [];
  const symbols: string[] = [];
  const requirements: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of (node.children ?? []) as any[]) {
    // listItem children: paragraph, list (nested), ...
    const itemParts: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const child of (item.children ?? []) as any[]) {
      if (child.type === 'paragraph') {
        const text = collectText(child).trim();
        if (text) itemParts.push(text);
        symbols.push(...extractSymbolRefs(text));
        requirements.push(...extractRequirementRefs(text));
      } else if (child.type === 'list') {
        const nested = collectList(child);
        if (nested.text) itemParts.push(nested.text);
        symbols.push(...nested.symbols);
        requirements.push(...nested.requirements);
      }
    }
    if (itemParts.length > 0) items.push(`- ${itemParts.join(' ')}`);
  }

  return { text: items.join('\n'), symbols, requirements };
}

// ─── Symbol ref extraction ────────────────────────────────────────────────────

function extractSymbolRefs(text: string): string[] {
  const refs: string[] = [];
  for (const m of text.matchAll(RE_AT_REF)) refs.push(m[1]);
  for (const m of text.matchAll(RE_WIKI_LINK)) {
    if (!m[1].startsWith('doc:')) refs.push(m[1]);
  }
  for (const m of text.matchAll(RE_CODE_SPAN_SYMBOL)) refs.push(m[1]);
  return refs;
}

/**
 * Auto-documented structural element.
 * @doc:../../docs/architecture/05-5-docsparser.md#5-docsparser
 */
function extractDocRefs(text: string, sourceFilePath: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(RE_DOC_WIKI_LINK)) refs.add(normalizeDocRef(m[1], sourceFilePath));
  for (const m of text.matchAll(RE_DOC_AT_REF)) refs.add(normalizeDocRef(m[1], sourceFilePath));
  return Array.from(refs).filter(Boolean);
}

/**
 * Auto-documented structural element.
 * @doc:../../docs/guide/19-9-huong-dan-ra-lenh-cho-ai-agent-qua-mcp.md#chuan-annotation-khi-ai-viet-docscode
 */
function normalizeDocRef(rawRef: string, sourceFilePath: string): string {
  const value = String(rawRef || '').trim();
  if (!value) return '';
  if (value.startsWith('#')) return `${sourceFilePath}${value}`;
  const [rawPath, slug = ''] = value.split('#');
  const absPath = rawPath.startsWith('/') ? rawPath : resolve(dirname(sourceFilePath), rawPath);
  return slug ? `${absPath}#${slug}` : absPath;
}

/**
 * Infers a primary symbol from a heading only when the heading gives a strong
 * exact-match signal, to avoid noisy DOCUMENTED_BY edges.
 * @doc:../../docs/architecture/05-5-docsparser.md#5-docsparser
 */
function inferPrimarySymbolName(heading: string, linkedSymbols: string[]): string | undefined {
  if (!heading) return undefined;
  if (linkedSymbols.length > 0) return linkedSymbols[0];

  const plain = heading.trim();
  const standalone = plain.match(RE_STANDALONE_SYMBOL);
  if (standalone) return standalone[1];

  const codeSpanMatches = Array.from(plain.matchAll(RE_CODE_SPAN_SYMBOL));
  if (codeSpanMatches.length === 1) {
    return codeSpanMatches[0][1];
  }

  return undefined;
}

/**
 * Auto-documented structural element.
 */
function extractRequirementRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(RE_REQUIREMENT_ID)) refs.add(m[0]);
  return Array.from(refs);
}
