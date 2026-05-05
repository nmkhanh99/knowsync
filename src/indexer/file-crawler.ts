import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, relative, resolve } from 'path';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import type { CodeSourceConfig, DocSourceConfig } from '../types/index.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ignoreLib = require('ignore') as any;
const createIgnore: () => IgnoreInstance = ignoreLib.default ?? ignoreLib;

interface IgnoreInstance {
  add: (pattern: string) => IgnoreInstance;
  ignores: (path: string) => boolean;
}

const SUPPORTED_EXTENSIONS: Record<string, string> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.html': 'javascript',
  '.htm': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
};

const DOC_EXTENSIONS = new Set(['.md', '.mdx']);

export interface CrawlResult {
  codeFiles: Array<{ filePath: string; language: string; contentHash: string; lastModified: number }>;
  docFiles: Array<{ filePath: string; contentHash: string; lastModified: number }>;
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function crawlRepo(
  rootPath: string,
  languages?: string[],
  docSources?: DocSourceConfig[],
  codeSources?: CodeSourceConfig[],
): Promise<CrawlResult> {
  const ig = await loadGitignore(rootPath);
  const codeFiles: CrawlResult['codeFiles'] = [];
  const docFiles: CrawlResult['docFiles'] = [];

  // Code files: only scan explicit codeSources
  if (codeSources && codeSources.length > 0) {
    const seen = new Set<string>();
    for (const source of codeSources) {
      await crawlCodeSource(rootPath, source, codeFiles, seen, languages);
    }
  }

  // Doc files: only scan explicit docSources
  if (docSources && docSources.length > 0) {
    const seen = new Set<string>();
    for (const source of docSources) {
      await crawlDocSource(rootPath, source, docFiles, seen);
    }
  }

  return { codeFiles, docFiles };
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function crawlCodeSource(
  rootPath: string,
  source: CodeSourceConfig,
  codeFiles: CrawlResult['codeFiles'],
  seen: Set<string>,
  languages?: string[],
): Promise<void> {
  const absPath = resolve(rootPath, source.path.trim());
  try {
    const s = await stat(absPath);
    if (s.isDirectory()) {
      await walkCodeDir(absPath, codeFiles, seen, languages);
    } else if (s.isFile()) {
      const ext = extname(absPath).toLowerCase();
      const lang = SUPPORTED_EXTENSIONS[ext];
      if (lang && (!languages || languages.includes(lang)) && !seen.has(absPath)) {
        seen.add(absPath);
        codeFiles.push({ filePath: absPath, language: lang, ...(await fileInfo(absPath)) });
      }
    }
  } catch {
    // Path doesn't exist — skip silently
  }
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function walkCodeDir(
  dir: string,
  codeFiles: CrawlResult['codeFiles'],
  seen: Set<string>,
  languages?: string[],
): Promise<void> {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      await walkCodeDir(fullPath, codeFiles, seen, languages);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (ext in SUPPORTED_EXTENSIONS && !seen.has(fullPath)) {
        const lang = SUPPORTED_EXTENSIONS[ext];
        if (!languages || languages.includes(lang)) {
          seen.add(fullPath);
          codeFiles.push({ filePath: fullPath, language: lang, ...(await fileInfo(fullPath)) });
        }
      }
    }
  }
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function crawlDocSource(
  rootPath: string,
  source: DocSourceConfig,
  docFiles: CrawlResult['docFiles'],
  seen: Set<string>,
): Promise<void> {
  const rawPath = source.path.trim();

  // Glob pattern — extract base directory before the first wildcard
  if (rawPath.includes('*')) {
    const beforeWild = rawPath.split('*')[0];
    // Walk up to the last slash to get the base dir
    const baseDir = beforeWild.includes('/')
      ? beforeWild.slice(0, beforeWild.lastIndexOf('/'))
      : '.';
    await walkDocDir(resolve(rootPath, baseDir), docFiles, seen);
    return;
  }

  const absPath = resolve(rootPath, rawPath);
  try {
    const s = await stat(absPath);
    if (s.isDirectory()) {
      await walkDocDir(absPath, docFiles, seen);
    } else if (s.isFile() && DOC_EXTENSIONS.has(extname(absPath).toLowerCase())) {
      if (!seen.has(absPath)) {
        seen.add(absPath);
        docFiles.push({ filePath: absPath, ...(await fileInfo(absPath)) });
      }
    }
  } catch {
    // Path doesn't exist — skip silently
  }
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function walkDocDir(
  dir: string,
  docFiles: CrawlResult['docFiles'],
  seen: Set<string>,
): Promise<void> {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      await walkDocDir(fullPath, docFiles, seen);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (DOC_EXTENSIONS.has(ext) && !seen.has(fullPath)) {
        seen.add(fullPath);
        docFiles.push({ filePath: fullPath, ...(await fileInfo(fullPath)) });
      }
    }
  }
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function walk(
  rootPath: string,
  dir: string,
  ig: IgnoreInstance,
  codeFiles: CrawlResult['codeFiles'],
  docFiles: CrawlResult['docFiles'],
  languages?: string[]
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(rootPath, fullPath);

    if (entry.name.startsWith('.')) continue;
    if (ig.ignores(relPath)) continue;

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      await walk(rootPath, fullPath, ig, codeFiles, docFiles, languages);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();

      if (DOC_EXTENSIONS.has(ext)) {
        const info = await fileInfo(fullPath);
        docFiles.push({ filePath: fullPath, ...info });
      } else if (ext in SUPPORTED_EXTENSIONS) {
        const lang = SUPPORTED_EXTENSIONS[ext];
        if (languages && !languages.includes(lang)) continue;
        const info = await fileInfo(fullPath);
        codeFiles.push({ filePath: fullPath, language: lang, ...info });
      }
    }
  }
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function fileInfo(filePath: string): Promise<{ contentHash: string; lastModified: number }> {
  const s = await stat(filePath);
  const content = await readFile(filePath);
  const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  return { contentHash, lastModified: s.mtimeMs };
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
async function loadGitignore(rootPath: string): Promise<IgnoreInstance> {
  const ig = createIgnore();
  try {
    const content = await readFile(join(rootPath, '.gitignore'), 'utf-8');
    ig.add(content);
  } catch {
    // no .gitignore is fine
  }
  return ig;
}
