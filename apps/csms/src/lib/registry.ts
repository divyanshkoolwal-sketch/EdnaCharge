// In-memory client registry keyed by charge-point id. Per PRD §17, v1 is single-node.
// A Redis-backed registry is a post-v1 concern.

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
