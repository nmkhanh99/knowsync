import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';

export const schema = {
  action: z.enum(['list', 'create', 'delete']).describe(
    'list: list all dependency links for a RuleSet. ' +
    'create: add a dependency link between two RuleSets. ' +
    'delete: remove a dependency link by ID.',
  ),

  ruleSetId: z.string().optional().describe('RuleSet to list links for (list action).'),

  // For create
  sourceId: z.string().optional().describe('Source RuleSet ID (the one that "has" the link).'),
  targetId: z.string().optional().describe('Target RuleSet ID (the one being linked to).'),
  linkType: z.enum(['inherit', 'override', 'inject']).optional().describe(
    'inherit: source applies target rules first, then its own override on top. ' +
    'override: source rules fully replace target rules. ' +
    'inject: target rules are injected into source (e.g. cross-language injection).',
  ),

  // For delete
  linkId: z.string().optional().describe('Link ID to delete (from list action).'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function ruleLinks(
  db: GraphDB,
  args: {
    action: 'list' | 'create' | 'delete';
    ruleSetId?: string;
    sourceId?: string;
    targetId?: string;
    linkType?: 'inherit' | 'override' | 'inject';
    linkId?: string;
  },
) {
  switch (args.action) {

    case 'list': {
      if (!args.ruleSetId) throw new Error('ruleSetId is required for list');
      const links = db.listRuleLinks(args.ruleSetId);
      const allSets = db.listAllRuleSets();
      return {
        count: links.length,
        links: links.map(l => ({
          ...l,
          sourceName: allSets.find(s => s.id === l.sourceId)?.name ?? l.sourceId,
          targetName: allSets.find(s => s.id === l.targetId)?.name ?? l.targetId,
        })),
      };
    }

    case 'create': {
      if (!args.sourceId) throw new Error('sourceId is required');
      if (!args.targetId) throw new Error('targetId is required');
      if (!args.linkType) throw new Error('linkType is required (inherit | override | inject)');
      if (args.sourceId === args.targetId) throw new Error('source and target cannot be the same RuleSet');
      if (!db.getRuleSet(args.sourceId)) throw new Error(`Source RuleSet "${args.sourceId}" not found`);
      if (!db.getRuleSet(args.targetId)) throw new Error(`Target RuleSet "${args.targetId}" not found`);
      const id = `rl:${args.sourceId}:${args.targetId}:${args.linkType}`;
      const link = db.createRuleLink({ id, sourceId: args.sourceId, targetId: args.targetId, linkType: args.linkType });
      return { ok: true, link };
    }

    case 'delete': {
      if (!args.linkId) throw new Error('linkId is required for delete');
      db.deleteRuleLink(args.linkId);
      return { ok: true, deleted: args.linkId };
    }
  }
}
