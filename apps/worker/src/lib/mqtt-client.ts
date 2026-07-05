import mqtt, { type MqttClient } from 'mqtt';
import { logger } from '../logger.js';

let _client: MqttClient | null = null;

const BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
const USERNAME = process.env.MQTT_USERNAME ?? '';
const PASSWORD = process.env.MQTT_PASSWORD ?? '';

/** Topic → set of registered handlers. One global on('message') dispatches. */
const _topicHandlers = new Map<string, Set<(payload: Buffer) => void>>();

/** Wildcard subscriptions match by prefix; e.g. `foo/+` → topic starts with `foo/`. */
function topicMatches(pattern: string, topic: string): boolean {
  if (pattern === topic) return true;
  if (!pattern.includes('+') && !pattern.includes('#')) return false;
  const pp = pattern.split('/');
  const tp = topic.split('/');
  if (pp[pp.length - 1] === '#') {
    if (tp.length < pp.length - 1) return false;
    for (let i = 0; i < pp.length - 1; i++) if (pp[i] !== '+' && pp[i] !== tp[i]) return false;
    return true;
  }
  if (pp.length !== tp.length) return false;
  for (let i = 0; i < pp.length; i++) if (pp[i] !== '+' && pp[i] !== tp[i]) return false;
  return true;
}

function ensureClient(): MqttClient {
  if (_client) return _client;

  const opts: mqtt.IClientOptions = {
    clientId: `edna-worker-${process.pid}-${Date.now().toString(36)}`,
    clean: false,
    reconnectPeriod: 3000,
    connectTimeout: 10_000,
    will: {
      topic: 'edna/worker/status',
      payload: Buffer.from('offline'),
      qos: 1,
      retain: true,
    },
  };
  if (USERNAME) opts.username = USERNAME;
  if (PASSWORD) opts.password = PASSWORD;

  _client = mqtt.connect(BROKER_URL, opts);

  _client.on('connect', () => {
    logger.info({ broker: BROKER_URL }, 'mqtt: connected');
    _client!.publish('edna/worker/status', 'online', { retain: true });
    // Re-subscribe to all known topics on reconnect (in case clean=false didn't preserve them)
    for (const topic of _topicHandlers.keys()) {
      _client!.subscribe(topic, { qos: 1 }, (err) => {
        if (err) logger.warn({ err, topic }, 'mqtt: re-subscribe failed');
      });
    }
  });
  _client.on('error', (err) => logger.error({ err }, 'mqtt: error'));
  _client.on('reconnect', () => logger.warn('mqtt: reconnecting'));
  _client.on('offline', () => logger.warn('mqtt: offline'));

  // Single global dispatcher — fans out to per-topic handlers.
  _client.on('message', (topic: string, payload: Buffer) => {
    // Exact match (fast path)
    const exact = _topicHandlers.get(topic);
    if (exact) for (const h of exact) safeCall(h, payload, topic);
    // Wildcard patterns (slow path; only iterates if not exact-matched)
    for (const [pattern, set] of _topicHandlers) {
      if (pattern === topic) continue;
      if (!pattern.includes('+') && !pattern.includes('#')) continue;
      if (topicMatches(pattern, topic)) {
        for (const h of set) safeCall(h, payload, topic);
      }
    }
  });

  return _client;
}

function safeCall(handler: (payload: Buffer) => void, payload: Buffer, topic: string) {
  try {
    handler(payload);
  } catch (err) {
    logger.warn({ err, topic }, 'mqtt: handler threw');
  }
}

export function getMqttClient(): MqttClient {
  return ensureClient();
}

export function closeMqttClient(): Promise<void> {
  return new Promise((resolve) => {
    if (!_client) return resolve();
    _topicHandlers.clear();
    _client.end(false, undefined, () => {
      _client = null;
      resolve();
    });
  });
}

export function mqttPublish(topic: string, payload: string | Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureClient().publish(topic, payload, { qos: 1 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Subscribe to `topic` and register a handler. Returns an unsubscribe function
 * that removes ONLY this handler. The underlying MQTT subscription is kept
 * until the last handler for the topic is removed.
 */
export async function mqttOnTopic(
  topic: string,
  handler: (payload: Buffer) => void,
): Promise<() => void> {
  const client = ensureClient();
  let set = _topicHandlers.get(topic);
  if (!set) {
    set = new Set();
    _topicHandlers.set(topic, set);
    await new Promise<void>((resolve, reject) => {
      client.subscribe(topic, { qos: 1 }, (err) => (err ? reject(err) : resolve()));
    });
  }
  set.add(handler);

  return () => {
    const s = _topicHandlers.get(topic);
    if (!s) return;
    s.delete(handler);
    if (s.size === 0) {
      _topicHandlers.delete(topic);
      client.unsubscribe(topic, (err) => {
        if (err) logger.warn({ err, topic }, 'mqtt: unsubscribe failed');
      });
    }
  };
}

/** Wait until the broker is connected (resolves immediately if already connected). */
export function awaitConnected(timeoutMs = 10_000): Promise<void> {
  const c = ensureClient();
  if (c.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      c.off('connect', onConnect);
      reject(new Error('mqtt: connect timeout'));
    }, timeoutMs);
    const onConnect = () => {
      clearTimeout(timer);
      resolve();
    };
    c.once('connect', onConnect);
  });
}
