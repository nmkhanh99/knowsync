import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';
import type { CodeSourceConfig, DocSourceConfig, VisualDocsConfig } from '../../types/index.js';

const DocSourceSchema = z.object({
  path: z.string().describe('Relative path or glob: "docs/architecture", "wiki/**/*.md"'),
  label: z.string().optional().describe('Display label in Visual Docs, e.g. "Kiến trúc"'),
  excludeFiles: z.array(z.string()).optional().describe('File names to hide, e.g. ["full.md"]'),
  order: z.number().optional().describe('Display order (ascending)'),
  color: z.string().optional().describe('Hex color, e.g. "#60a5fa"'),
});

const CodeSourceSchema = z.object({
  path: z.string().describe('Absolute or relative path to a code directory, e.g. "src", "/project/lib"'),
  label: z.string().optional().describe('Display label for this code area'),
});

export const schema = {
  codeSources: z.array(CodeSourceSchema).optional()
    .describe('Code source directories to configure. Replaces all existing code sources when provided.'),
  docSources: z.array(DocSourceSchema).optional()
    .describe('Doc source directories to configure. Replaces all existing doc sources when provided.'),
  visualDocs: z.object({
    structureMode: z.enum(['file', 'folder', 'docSource', 'flat']).optional()
      .describe('How Visual Docs groups sections. "docSource" groups by label (recommended).'),
    folderDepth: z.number().optional().describe('Depth for folder grouping mode'),
  }).optional().describe('Visual Docs display settings'),
};

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export function setVisualDocsConfig(
  db: GraphDB,
  args: { codeSources?: CodeSourceConfig[]; docSources?: DocSourceConfig[]; visualDocs?: Partial<VisualDocsConfig> },
) {
  if (args.codeSources != null) {
    db.setProjectConfig('codeSources', args.codeSources);
  }
  if (args.docSources != null) {
    db.setProjectConfig('docSources', args.docSources);
  }
  if (args.visualDocs) {
    const current = db.getProjectConfig<VisualDocsConfig>('visualDocs') ?? {};
    db.setProjectConfig('visualDocs', { ...current, ...args.visualDocs });
  }
  return {
    saved: true,
    codeSources: db.getProjectConfig<CodeSourceConfig[]>('codeSources') ?? [],
    docSources: db.getProjectConfig<DocSourceConfig[]>('docSources') ?? [],
    visualDocs: db.getProjectConfig<VisualDocsConfig>('visualDocs') ?? {},
    note: 'Config saved. No re-index needed — Visual Docs and code scanning will reflect this config on next build.',
  };
}
