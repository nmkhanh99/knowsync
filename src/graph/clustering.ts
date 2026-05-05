import { createRequire } from 'module';
import type { ClusterResult } from '../types/index.js';
import type { GraphDB } from './db.js';
import type { InMemoryGraph } from './builder.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const louvainLib = require('graphology-communities-louvain') as any;
const louvain: (graph: InMemoryGraph) => Record<string, number> = louvainLib.default ?? louvainLib;

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export function clusterGraph(graph: InMemoryGraph): ClusterResult[] {
  if (graph.order === 0) return [];

  const communities = louvain(graph);

  // Name each cluster after the highest-degree node in it
  const clusterBestNode = new Map<string, { nodeId: string; degree: number; name: string }>();
  for (const [nodeId, rawId] of Object.entries(communities)) {
    const clusterId = String(rawId);
    const deg = graph.degree(nodeId);
    const name = (graph.getNodeAttribute(nodeId, 'name') as string | undefined) ?? nodeId;
    const current = clusterBestNode.get(clusterId);
    if (!current || deg > current.degree) {
      clusterBestNode.set(clusterId, { nodeId, degree: deg, name });
    }
  }

  return Object.entries(communities).map(([nodeId, rawId]) => {
    const clusterId = String(rawId);
    const clusterName = clusterBestNode.get(clusterId)?.name ?? clusterId;
    return { nodeId, clusterId, clusterName };
  });
}

/**
 * KnowSync functional handler. Automatically synced via CLI Validation rule.
 */
export function persistClusters(db: GraphDB, clusters: ClusterResult[]): void {
  for (const cluster of clusters) {
    db.setClusterId(cluster.nodeId, cluster.clusterId);
  }
}
