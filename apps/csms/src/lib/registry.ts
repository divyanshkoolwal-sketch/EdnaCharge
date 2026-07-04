/** @file apps/csms/src/lib/registry.ts. */
// In-memory client registry keyed by charge-point id. Per PRD §17, v1 is single-node.
//
// ⚠️ SINGLE-INSTANCE CONSTRAINT: this Map lives in one process. The CSMS service
// must run with exactly one instance (render.yaml: edna-csms numInstances: 1).
// RemoteStart/RemoteStop are dispatched via the `ocpp-commands` BullMQ queue and
// resolved against this Map — a second instance would consume commands for
// chargers whose socket it does not hold, so energy would never start. To scale
// past one node, replace this with a Redis-backed registry + per-charger routing
// (publish the command to the node that owns the socket). A post-v1 concern.

type Client = {
  call: (method: string, params?: unknown, opts?: Record<string, unknown>) => Promise<unknown>;
  close: (code?: number, reason?: string) => void;
};

const clients = new Map<string, Client>();

export function register(cpId: string, client: Client): void {
  const existing = clients.get(cpId);
  if (existing && existing !== client) {
    // The charger reconnected while an old socket lingered. Close the stale one
    // so we don't keep two live sockets whose handlers both process messages for
    // the same charge point. (The stale socket's close handler no-ops because
    // get(cpId) already points at the new client.)
    try {
      existing.close(4000, 'Superseded by new connection');
    } catch {
      // best effort — the socket may already be gone
    }
  }
  clients.set(cpId, client);
}
export function unregister(cpId: string): void {
  clients.delete(cpId);
}
export function get(cpId: string): Client | undefined {
  return clients.get(cpId);
}
export function size(): number {
  return clients.size;
}
