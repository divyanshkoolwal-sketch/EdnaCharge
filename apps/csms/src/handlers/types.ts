/** Structural OCPP client types used by handler binding. */
export type Client = {
  handle: (method: string, handler: (ctx: { params: unknown }) => Promise<unknown>) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  close: (code?: number, reason?: string) => void;
  call: (method: string, params?: unknown, opts?: Record<string, unknown>) => Promise<unknown>;
  identity?: string;
  session: Record<string, unknown>;
};

export type Ctx = { chargePointId: string };
