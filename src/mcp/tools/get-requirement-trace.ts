import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';

export const schema = {
  requirementId: z.string().optional().describe('Requirement ID like BRD-REQ-001, PRD-UI-045, FRD-FUNC-112'),
  symbolName: z.string().optional().describe('Symbol name to inspect for linked requirements'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function getRequirementTrace(
  db: GraphDB,
  args: { requirementId?: string; symbolName?: string },
) {
  if (args.requirementId) {
    const requirements = db.getSymbolByName(args.requirementId).filter((node) => node.type === 'Requirement');
    if (!requirements.length) return null;

    const requirement = requirements[0];
    return {
      requirement,
      linkedDocs: db.getLinkedDocs(requirement.id),
      linkedSymbols: db.getSymbolsForRequirement(requirement.id),
    };
  }

  if (args.symbolName) {
    const symbols = db.getSymbolByName(args.symbolName);
    return symbols.map((symbol) => ({
      symbol,
      linkedRequirements: db.getRequirementsForSymbol(symbol.id),
      linkedDocs: db.getLinkedDocs(symbol.id),
    }));
  }

  return { error: 'Provide requirementId or symbolName' };
}
