import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import { runIndex } from '../../indexer/index.js';
import type { CodeSourceConfig, DocSourceConfig, VisualDocsConfig } from '../../types/index.js';

const DocSourceSchema = z.object({
  path: z.string().describe('Relative path, directory, or glob: "docs", "wiki/**/*.md", "README.md"'),
  label: z.string().optional().describe('Display label shown in Visual Docs, e.g. "Kiến trúc"'),
  excludeFiles: z.array(z.string()).optional()
    .describe('File names to hide from Visual Docs, e.g. ["full.md"]'),
  order: z.number().optional().describe('Display order in Visual Docs (ascending)'),
  color: z.string().optional().describe('Hex color hint for graph nodes in this doc set'),
});

const CodeSourceSchema = z.object({
  path: z.string().describe('Absolute or relative path to a code directory, e.g. "src", "/project/lib"'),
  label: z.string().optional().describe('Display label for this code area'),
});

export const schema = {
  delta: z.boolean().optional().describe('Only re-index changed files (default true)'),
  includeDocs: z.boolean().optional().describe('Also index Markdown docs (default true)'),
  codeSources: z.array(CodeSourceSchema).optional()
    .describe('Explicit code directories to scan. If omitted, the active project Code Sources config is used.'),
  docSources: z.array(DocSourceSchema).optional()
    .describe('Doc source directories/files to index. If omitted, the active project Doc Sources config is used. Label, excludeFiles, order, color control Visual Docs display.'),
  visualDocs: z.object({
    structureMode: z.enum(['file', 'folder', 'docSource', 'flat']).optional()
      .describe('How Visual Docs groups sections (default: docSource)'),
    folderDepth: z.number().optional().describe('Folder nesting depth when structureMode=folder'),
  }).optional().describe('Visual Docs display settings persisted to the graph DB'),
};

/**
 * Auto-documented structural element.
 */
export async function buildGraph(
  db: GraphDB,
  args: {
    delta?: boolean;
    includeDocs?: boolean;
    codeSources?: CodeSourceConfig[];
    docSources?: DocSourceConfig[];
    visualDocs?: Partial<VisualDocsConfig>;
    fallbackCodeSources?: CodeSourceConfig[];
    fallbackDocSources?: DocSourceConfig[];
  },
) {
  if (args.codeSources?.length) {
    db.setProjectConfig('codeSources', args.codeSources);
  }
  if (args.docSources?.length) {
    db.setProjectConfig('docSources', args.docSources);
  }
  if (args.visualDocs) {
    const current = db.getProjectConfig<VisualDocsConfig>('visualDocs') ?? {};
    db.setProjectConfig('visualDocs', { ...current, ...args.visualDocs });
  }

  const codeSources = args.codeSources?.length
    ? args.codeSources
    : (db.getProjectConfig<CodeSourceConfig[]>('codeSources') ?? args.fallbackCodeSources ?? []);
  const docSources = args.docSources?.length
    ? args.docSources
    : (db.getProjectConfig<DocSourceConfig[]>('docSources') ?? args.fallbackDocSources ?? []);

  return runIndex(db, {
    delta: args.delta ?? true,
    includeDocs: args.includeDocs ?? true,
    codeSources: codeSources.length ? codeSources : undefined,
    docSources: docSources.length ? docSources : undefined,
  });
}
