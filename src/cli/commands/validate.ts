import { resolve } from 'path';
import { registerProject, CENTRAL_DB_PATH } from '../registry.js';
import { GraphDB } from '../../graph/db.js';

/**
 * Auto-documented structural element.
 */
export async function runValidate(rootPath: string): Promise<void> {
  const absRoot = resolve(rootPath);
  const entry = await registerProject(absRoot);

  const db = new GraphDB(CENTRAL_DB_PATH, entry.id);
  await db.init();

  const undocumented = db.searchSymbols('', 10000)
    .filter((s) => {
      if (!['Function', 'Class', 'Method'].includes(s.type)) return false;
      if (s.docString) return false;
      return db.getLinkedDocs(s.id).length === 0;
    });

  db.close();

  if (undocumented.length === 0) {
    console.log('All symbols are documented.');
    return;
  }

  console.log(`\nUndocumented symbols (${undocumented.length}):`);
  for (const s of undocumented) {
    console.log(`  ${s.filePath}:${s.startLine} — ${s.name} (${s.type})`);
  }
  process.exit(1);
}
