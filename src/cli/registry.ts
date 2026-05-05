import { createHash } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { CodeSourceConfig, DocSourceConfig, VisualDocsConfig } from '../types/index.js';

export interface RegisteredProject {
  id: string;
  code?: string;
  name: string;
  rootPath: string;
  docSources: DocSourceConfig[];
  codeSources?: CodeSourceConfig[];
  visualDocs: VisualDocsConfig;
  registeredAt: number;
}

export interface Registry {
  projects: RegisteredProject[];
}

const REGISTRY_DIR = join(homedir(), '.knowsync');
const REGISTRY_PATH = join(REGISTRY_DIR, 'registry.json');

export const CENTRAL_DB_PATH = join(REGISTRY_DIR, 'graph.db');

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
function normalizeVisualDocsConfig(config?: Partial<VisualDocsConfig> | null): VisualDocsConfig {
  const structureMode = config?.structureMode;
  return {
    structureMode: structureMode === 'folder' || structureMode === 'docSource' || structureMode === 'flat'
      ? structureMode
      : 'file',
    folderDepth: Math.max(1, Math.min(6, Number(config?.folderDepth ?? 2) || 2)),
  };
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
function normalizeProject(project: RegisteredProject): RegisteredProject {
  return {
    ...project,
    code: project.code,
    docSources: project.docSources ?? [],
    codeSources: project.codeSources ?? [],
    visualDocs: normalizeVisualDocsConfig(project.visualDocs),
  };
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function loadRegistry(): Promise<Registry> {
  if (!existsSync(REGISTRY_PATH)) return { projects: [] };
  try {
    const parsed = JSON.parse(await readFile(REGISTRY_PATH, 'utf-8')) as Registry;
    return { projects: (parsed.projects ?? []).map((project) => normalizeProject(project as RegisteredProject)) };
  } catch {
    return { projects: [] };
  }
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function saveRegistry(registry: Registry): Promise<void> {
  await mkdir(REGISTRY_DIR, { recursive: true });
  await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export function makeProjectId(seed: string): string {
  return createHash('sha1').update(seed).digest('hex').slice(0, 8);
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function registerProject(
  rootPath: string,
  docSources?: DocSourceConfig[],
  visualDocs?: Partial<VisualDocsConfig>,
  nameOverride?: string,
  codeSources?: CodeSourceConfig[],
  code?: string,
): Promise<RegisteredProject> {
  const registry = await loadRegistry();
  const existing = rootPath ? registry.projects.find((p) => p.rootPath === rootPath) : null;
  if (existing) {
    if (!existing.docSources) existing.docSources = [];
    if (!existing.codeSources) existing.codeSources = [];
    existing.visualDocs = normalizeVisualDocsConfig(existing.visualDocs ?? visualDocs);
    if (nameOverride) existing.name = nameOverride;
    if (code) existing.code = code;
    return existing;
  }

  const seed = rootPath || (nameOverride ?? 'project') + '-' + Date.now();
  const name = nameOverride || rootPath.split('/').filter(Boolean).pop() || 'project';
  const project: RegisteredProject = {
    id: makeProjectId(seed),
    code,
    name,
    rootPath,
    docSources: docSources ?? [],
    codeSources: codeSources ?? [],
    visualDocs: normalizeVisualDocsConfig(visualDocs),
    registeredAt: Date.now(),
  };

  registry.projects.push(project);
  await saveRegistry(registry);
  return project;
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function updateProject(
  id: string,
  updates: { name?: string; rootPath?: string; code?: string; docSources?: DocSourceConfig[]; codeSources?: CodeSourceConfig[]; visualDocs?: Partial<VisualDocsConfig> },
): Promise<RegisteredProject | null> {
  const registry = await loadRegistry();
  const idx = registry.projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const proj = registry.projects[idx];
  if (updates.name !== undefined) proj.name = updates.name;
  if (updates.code !== undefined) proj.code = updates.code;
  if (updates.docSources !== undefined) proj.docSources = updates.docSources;
  if (updates.codeSources !== undefined) proj.codeSources = updates.codeSources;
  if (updates.visualDocs !== undefined) proj.visualDocs = normalizeVisualDocsConfig(updates.visualDocs);
  if (updates.rootPath !== undefined && updates.rootPath !== proj.rootPath) {
    proj.rootPath = updates.rootPath;
    proj.id = makeProjectId(updates.rootPath);
    if (!updates.name) proj.name = updates.rootPath.split('/').filter(Boolean).pop() ?? proj.name;
  }
  if (!proj.docSources) proj.docSources = [];
  if (!proj.codeSources) proj.codeSources = [];
  proj.visualDocs = normalizeVisualDocsConfig(proj.visualDocs);
  await saveRegistry(registry);
  return normalizeProject(proj);
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export async function unregisterProject(id: string): Promise<boolean> {
  const registry = await loadRegistry();
  const before = registry.projects.length;
  registry.projects = registry.projects.filter((p) => p.id !== id && p.rootPath !== id);
  if (registry.projects.length === before) return false;
  await saveRegistry(registry);
  return true;
}
