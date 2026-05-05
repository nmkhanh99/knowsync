import { z } from 'zod';
import type { GraphDB } from '../../graph/db.js';

const RuleSchema = z.object({
  name: z.string(),
  ruleType: z.enum(['node', 'edge', 'resolve', 'linking', 'doc_link']),
  query: z.string(),
  packName: z.string().optional(),
  nodeType: z.string().optional(),
  edgeType: z.string().optional(),
  nameCapture: z.string().optional(),
  sourceCapture: z.string().optional(),
  targetCapture: z.string().optional(),
  docCapture: z.string().optional(),
  symbolCapture: z.string().optional(),
  priority: z.number().optional(),
});

const QueryPackSchema = z.object({
  name: z.string(),
  packType: z.enum(['comment_doc_linking']),
  rules: z.array(RuleSchema),
});

const ArtifactSchema = z.discriminatedUnion('artifactType', [
  z.object({
    name: z.string(),
    artifactType: z.literal('injection_query'),
    packName: z.string().optional(),
    content: z.string().describe('Tree-sitter injection query content, equivalent to injections.scm'),
    targetLanguage: z.string().optional().describe('Injected language name, e.g. markdown, sql'),
    priority: z.number().optional(),
  }),
  z.object({
    name: z.string(),
    artifactType: z.literal('included_ranges'),
    packName: z.string().optional(),
    query: z.string().describe('Tree-sitter query used to capture ranges'),
    rangeCapture: z.string().optional().describe('Capture name that defines the included range'),
    priority: z.number().optional(),
  }),
]);

export const schema = {
  language: z.string().describe('Target language, e.g. "typescript", "python", "go", "rust"'),
  rules: z.array(RuleSchema).optional().describe('Array of parse rules (S-expression queries for Tree-sitter)'),
  queryPacks: z.array(QueryPackSchema).optional().describe('Named query packs. Use comment_doc_linking for doc comment -> symbol linking rules.'),
  artifacts: z.array(ArtifactSchema).optional().describe('First-class parse artifacts such as injections.scm content and included range selectors.'),
  replace: z.boolean().optional().describe('If true, replace all existing rules for this language'),
  ruleSetId: z.string().optional().describe('If provided, assign the imported rules to this RuleSet. Use knowsync_rule_sets to list or create RuleSets first.'),
};

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function provideParseRules(
  db: GraphDB,
  args: {
    language: string;
    rules?: z.infer<typeof RuleSchema>[];
    queryPacks?: z.infer<typeof QueryPackSchema>[];
    artifacts?: z.infer<typeof ArtifactSchema>[];
    replace?: boolean;
    ruleSetId?: string;
  },
) {
  if (args.replace) db.clearParseRules(args.language);

  const directRules = args.rules ?? [];
  const packedRules = (args.queryPacks ?? []).flatMap((pack) =>
    pack.rules.map((rule) => ({
      ...rule,
      packName: pack.name,
    }))
  );
  const allRulesToAdd = [...directRules, ...packedRules];

  let added = 0;
  const addedRuleIds: string[] = [];
  for (const rule of allRulesToAdd) {
    const suffix = rule.packName ? `${rule.packName}:${rule.name}` : rule.name;
    const id = `rule:${args.language}:${suffix}:${rule.ruleType}`;
    db.upsertParseRule({ id, language: args.language, ...rule });
    addedRuleIds.push(id);
    added++;
  }

  let artifactsAdded = 0;
  const addedArtifactIds: string[] = [];
  for (const artifact of args.artifacts ?? []) {
    const id = `artifact:${args.language}:${artifact.packName ?? 'direct'}:${artifact.name}:${artifact.artifactType}`;
    db.upsertParseArtifact({ id, language: args.language, ...artifact });
    addedArtifactIds.push(id);
    artifactsAdded++;
  }

  // Assign to RuleSet if specified
  if (args.ruleSetId) {
    const rs = db.getRuleSet(args.ruleSetId);
    if (!rs) throw new Error(`RuleSet "${args.ruleSetId}" not found. Use knowsync_rule_sets action=list to see available RuleSets.`);
    for (const id of addedRuleIds) db.assignRuleToSet(id, args.ruleSetId);
    for (const id of addedArtifactIds) db.assignArtifactToSet(id, args.ruleSetId);
  }

  const all = db.getParseRules(args.language);
  const allArtifacts = db.getParseArtifacts(args.language);
  return {
    ok: true,
    added,
    artifactsAdded,
    total: all.length,
    totalArtifacts: allArtifacts.length,
    language: args.language,
    ruleIds: addedRuleIds,
    artifactIds: addedArtifactIds,
    ruleSetId: args.ruleSetId ?? null,
    packs: (args.queryPacks ?? []).map((pack) => ({ name: pack.name, packType: pack.packType, ruleCount: pack.rules.length })),
    artifacts: (args.artifacts ?? []).map((artifact) => ({ name: artifact.name, artifactType: artifact.artifactType })),
  };
}
