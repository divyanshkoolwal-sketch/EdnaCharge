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
