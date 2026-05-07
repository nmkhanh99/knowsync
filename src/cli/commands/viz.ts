import { resolve } from 'path';
import { loadRegistry, registerProject } from '../registry.js';
import { startVizServer } from '../../viz/server.js';

/**
 * Opens the stakeholder-facing Web UI surface for architecture and knowledge health.
 * @doc:../../../docs/requirements/frd-architecture-surfaces-and-freshness.md#frd-func-010-diagram-generation-va-architecture-surface-delivery
 * @doc:../../../docs/requirements/prd-living-architecture-and-freshness.md#prd-arch-001-c4-architecture-surfaces-va-diagram-export
 *
 * FRD-FUNC-010: diagram generation and architecture surface delivery.
 * PRD-ARCH-001: C4 architecture surfaces and diagram export.
 */
export async function runViz(projectDir: string | undefined, port: number): Promise<void> {
  if (projectDir) {
    await registerProject(resolve(projectDir), [], undefined, undefined, [], undefined);
  }

  const registry = await loadRegistry();
  await startVizServer(registry.projects, port);
}
