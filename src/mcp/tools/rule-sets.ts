import { z } from 'zod';
import { createHash } from 'crypto';
import type { GraphDB } from '../../graph/db.js';

export const schema = {
  action: z.enum([
    'list',
    'create',
    'update',
    'delete',
    'fork',
    'get',
    'get_resolved',
  ]).describe(
    'list: list all RuleSets for this project (including global). ' +
    'create: create a new RuleSet. ' +
    'update: rename, change description/version/parent/grammarWasmUrl of a RuleSet. ' +
    'delete: delete a RuleSet (rules are kept but unlinked). ' +
    'fork: clone a RuleSet into a new project-level RuleSet with the source as parent. ' +
    'get: get a single RuleSet with its rules, artifacts and links. ' +
    'get_resolved: resolve the full inheritance chain and return merged rules + artifacts.',
  ),

  // Filters for list
  language: z.string().optional().describe('Filter by language (list action).'),

  // Identifiers
  ruleSetId: z.string().optional().describe('ID of the RuleSet to get/update/delete/fork/resolve.'),

  // Fields for create / update
  name: z.string().optional().describe('RuleSet name.'),
  description: z.string().optional().describe('Short description.'),
  version: z.string().optional().describe('Semantic version, e.g. "1.0.0".'),
  parentId: z.string().nullable().optional().describe('Parent RuleSet ID for inheritance (null to remove parent).'),
  grammarWasmUrl: z.string().optional().describe('URL to grammar.wasm file (for future client-side parsing).'),
  isGlobal: z.boolean().optional().describe('Mark as global (shared across all projects). Default false.'),
  // language is also used for create
};

/**
 * Auto-documented structural element.
 */
function makeId(db: GraphDB, language: string, name: string): string {
  const seed = `${db.projectId}:${language}:${name}:${Date.now()}`;
  return 'rs:' + createHash('sha1').update(seed).digest('hex').slice(0, 12);
}

/**
 * MCP Tool Handler.
 * @param db The GraphDB core reference
 * @param args Tool specific schema arguments
 * @returns The queried internal schema nodes or operation results for the Agent
 */
export function ruleSets(
  db: GraphDB,
  args: {
    action: 'list' | 'create' | 'update' | 'delete' | 'fork' | 'get' | 'get_resolved';
    language?: string;
    ruleSetId?: string;
    name?: string;
    description?: string;
    version?: string;
    parentId?: string | null;
    grammarWasmUrl?: string;
    isGlobal?: boolean;
  },
) {
  switch (args.action) {

    case 'list': {
      const sets = db.listAllRuleSets(args.language ? { language: args.language } : undefined);
      return {
        count: sets.length,
        ruleSets: sets.map(s => ({
          id: s.id,
          name: s.name,
          language: s.language,
          version: s.version,
          isGlobal: s.isGlobal,
          parentId: s.parentId,
          description: s.description,
          ruleCount: db.getRuleSetRules(s.id).length,
          artifactCount: db.getRuleSetArtifacts(s.id).length,
        })),
      };
    }

    case 'create': {
      if (!args.name) throw new Error('name is required for create');
      if (!args.language) throw new Error('language is required for create');
      const id = makeId(db, args.language, args.name);
      const rs = db.createRuleSet({
        id,
        name: args.name,
        language: args.language,
        description: args.description ?? '',
        version: args.version ?? '1.0.0',
        isGlobal: args.isGlobal ?? false,
        parentId: args.parentId ?? null,
        grammarWasmUrl: args.grammarWasmUrl ?? '',
      });
      return { ok: true, ruleSet: rs };
    }

    case 'update': {
      if (!args.ruleSetId) throw new Error('ruleSetId is required for update');
      const existing = db.getRuleSet(args.ruleSetId);
      if (!existing) throw new Error(`RuleSet "${args.ruleSetId}" not found`);
      db.updateRuleSet(args.ruleSetId, {
        name: args.name,
        description: args.description,
        version: args.version,
        parentId: 'parentId' in args ? args.parentId : undefined,
        grammarWasmUrl: args.grammarWasmUrl,
      });
      return { ok: true, ruleSet: db.getRuleSet(args.ruleSetId) };
    }

    case 'delete': {
      if (!args.ruleSetId) throw new Error('ruleSetId is required for delete');
      const existing = db.getRuleSet(args.ruleSetId);
      if (!existing) throw new Error(`RuleSet "${args.ruleSetId}" not found`);
      db.deleteRuleSet(args.ruleSetId);
      return { ok: true, deleted: args.ruleSetId };
    }

    case 'fork': {
      if (!args.ruleSetId) throw new Error('ruleSetId is required for fork');
      const source = db.getRuleSet(args.ruleSetId);
      if (!source) throw new Error(`RuleSet "${args.ruleSetId}" not found`);
      const newName = args.name ?? `${source.name} (Fork)`;
      const newId = makeId(db, source.language, newName);
      const forked = db.forkRuleSet(args.ruleSetId, newId, newName);
      if (!forked) throw new Error('Fork failed');
      return {
        ok: true,
        ruleSet: forked,
        note: `Forked from "${source.name}". Forked rules are copies — edit independently or keep parentId for inheritance.`,
      };
    }

    case 'get': {
      if (!args.ruleSetId) throw new Error('ruleSetId is required for get');
      const rs = db.getRuleSet(args.ruleSetId);
      if (!rs) throw new Error(`RuleSet "${args.ruleSetId}" not found`);
      return {
        ...rs,
        rules: db.getRuleSetRules(rs.id),
        artifacts: db.getRuleSetArtifacts(rs.id),
        links: db.listRuleLinks(rs.id),
      };
    }

    case 'get_resolved': {
      if (!args.ruleSetId) throw new Error('ruleSetId is required for get_resolved');
      const resolved = db.getResolvedRuleSet(args.ruleSetId);
      if (!resolved) throw new Error(`RuleSet "${args.ruleSetId}" not found`);
      return {
        ...resolved,
        chainSummary: resolved.chain.map(s => ({ id: s.id, name: s.name, isGlobal: s.isGlobal })),
        totalRules: resolved.rules.length,
        totalArtifacts: resolved.artifacts.length,
      };
    }
  }
}
