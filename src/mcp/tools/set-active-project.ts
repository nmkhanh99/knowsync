import { z } from 'zod';

export const schema = {
  projectCode: z.string().describe('Unique project code from the KnowSync registry, for example "mrp"'),
};

/**
 * MCP Tool Handler.
 * This tool is implemented in the MCP server because it switches the active
 * project context used by all other tools in the current session.
 */
export function describeSetActiveProjectResult(project: {
  id: string;
  name: string;
  code?: string;
}) {
  return {
    ok: true,
    activeProject: {
      id: project.id,
      name: project.name,
      code: project.code ?? null,
    },
  };
}
