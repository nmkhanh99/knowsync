#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from './commands/init.js';
import { runIndexCommand } from './commands/index-cmd.js';
import { runValidate } from './commands/validate.js';
import { runViz } from './commands/viz.js';
import { runMcpCommand } from './commands/mcp-cmd.js';
import { runRegister, runUnregister, runList } from './commands/register.js';

const program = new Command();

program
  .name('knowsync')
  .description('Local-first knowledge graph + MCP tool for code and docs')
  .version('0.1.0');

program
  .command('init [path]')
  .description('Initialize KnowSync config in a repository')
  .action(async (path?: string) => {
    await runInit(path ?? '.');
  });

program
  .command('register [path]')
  .description('Register a project in the central registry (~/.knowsync/registry.json)')
  .option('--docs-source <path>', 'Doc source path (can be specified multiple times)', (v, acc: string[]) => { acc.push(v); return acc; }, [] as string[])
  .option('--code <code>', 'Unique code identifier for the project')
  .action(async (path: string | undefined, opts: { docsSource: string[]; code?: string }) => {
    await runRegister(path ?? '.', { docSources: opts.docsSource, code: opts.code });
  });

program
  .command('unregister <id>')
  .description('Remove a project from the registry by ID or path')
  .action(async (id: string) => {
    await runUnregister(id);
  });

program
  .command('list')
  .description('List all registered projects')
  .action(async () => {
    await runList();
  });

program
  .command('index [path]')
  .description('Index code and docs into the knowledge graph')
  .option('--docs', 'Also index Markdown documentation', false)
  .option('--delta', 'Only re-index changed files', false)
  .option('--all', 'Index all registered projects', false)
  .action(async (path: string | undefined, opts: { docs: boolean; delta: boolean; all: boolean }) => {
    await runIndexCommand(path, opts);
  });

program
  .command('validate [path]')
  .description('Check that all symbols have documentation')
  .action(async (path?: string) => {
    await runValidate(path ?? '.');
  });

program
  .command('viz [path]')
  .description('Open the Web UI (no path = multi-project dashboard from registry)')
  .option('-p, --port <number>', 'Port to serve on', '4242')
  .action(async (path: string | undefined, opts: { port: string }) => {
    await runViz(path, parseInt(opts.port, 10));
  });

program
  .command('mcp')
  .description('Start the MCP server for AI tools (Claude, Cursor, Windsurf)')
  .action(async () => {
    await runMcpCommand();
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
