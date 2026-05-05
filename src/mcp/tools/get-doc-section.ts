import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';

export const schema = {
  docSectionId: z.string().describe('The ID of the doc section to retrieve'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function getDocSection(db: GraphDB, args: { docSectionId: string }) {
  const section = db.getDocSectionById(args.docSectionId);
  if (!section) return null;
  const relatedDocs = db.getRelatedDocs(section.id);
  const mapRelated = (item: (typeof relatedDocs)[number]) => ({
    direction: item.direction,
    edgeType: item.edgeType,
    docSectionId: item.doc.id,
    heading: item.doc.heading,
    filePath: item.doc.filePath,
    slug: item.doc.slug,
    startLine: item.doc.startLine,
    endLine: item.doc.endLine,
  });
  const beforeDocs = relatedDocs.filter((item) => item.direction === 'outgoing').map(mapRelated);
  const afterDocs = relatedDocs.filter((item) => item.direction === 'incoming').map(mapRelated);

  return {
    id: section.id,
    filePath: section.filePath,
    heading: section.heading,
    slug: section.slug,
    headingLevel: section.headingLevel,
    content: section.content,
    primarySymbolName: section.primarySymbolName,
    linkedSymbols: section.linkedSymbols,
    linkedDocTargets: section.linkedDocTargets ?? [],
    linkedRequirements: section.linkedRequirements ?? [],
    metadata: section.metadata,
    sourceArtifact: (section.metadata?.['sourceArtifact'] as Record<string, unknown> | undefined) ?? undefined,
    relatedDocs: relatedDocs.map(mapRelated),
    beforeDocs,
    afterDocs,
    startLine: section.startLine,
    endLine: section.endLine,
    anchorUrl: `${section.filePath}#${section.slug}`,
  };
}
