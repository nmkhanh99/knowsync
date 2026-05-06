import { z } from 'zod';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import type { GraphDB } from '../../graph/db.js';
import type { DocSourceConfig } from '../../types/index.js';

export const schema = {
  maxDepth: z.number().optional().describe('Max folder depth (default 3)'),
};

interface DiscoveredDir {
  path: string;
  mdFileCount: number;
  sampleFiles: string[];
}

/**
 * Auto-documented structural element.
 */
function walkDir(dir: string, root: string, depth: number, maxDepth: number): DiscoveredDir[] {
  if (depth > maxDepth) return [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return []; }

  const mdFiles = entries.filter((e) => e.toLowerCase().endsWith('.md'));
  const subDirs = entries.filter((e) => {
    if (e.startsWith('.') || e === 'node_modules') return false;
    try { return statSync(join(dir, e)).isDirectory(); } catch { return false; }
  });

  const results: DiscoveredDir[] = [];
  if (mdFiles.length > 0) {
    results.push({
      path: relative(root, dir) || '.',
      mdFileCount: mdFiles.length,
      sampleFiles: mdFiles.slice(0, 6),
    });
  }
  for (const sub of subDirs) {
    results.push(...walkDir(join(dir, sub), root, depth + 1, maxDepth));
  }
  return results;
}

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function scanDocSources(db: GraphDB, args: { seedPaths: string[]; maxDepth?: number }) {
  const maxDepth = args.maxDepth ?? 3;
  const discovered = args.seedPaths.flatMap((seedPath) => walkDir(seedPath, seedPath, 0, maxDepth));
  const currentConfig = db.getProjectConfig<DocSourceConfig[]>('docSources') ?? [];
  return {
    discovered,
    currentConfig,
    hint: [
      'Call knowsync_set_visual_docs_config with docSources[] to configure Visual Docs display.',
      'Each source: { path, label, color (hex), order (number), excludeFiles (array) }.',
      'Use structureMode "docSource" to group by label in the Visual Docs outline.',
    ].join(' '),
  };
}
