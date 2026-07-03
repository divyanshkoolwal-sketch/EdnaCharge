import { createHmac, timingSafeEqual } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp, type AppOptions } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { logger } from '../logger.js';

export type VerifiedFirebaseUser = {
  firebaseUid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  emailVerified: boolean;
};

function serviceAccountOptions(): AppOptions {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    return { credential: cert(JSON.parse(json)) };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    return { credential: cert({ projectId, clientEmail, privateKey }), projectId };
  }

  return {
    credential: applicationDefault(),
    projectId,
  };
}

function firebaseAdminApp() {
  return getApps()[0] ?? initializeApp(serviceAccountOptions());
}

function devTokenSecret(): string | null {
  // Hard guard: production never accepts dev tokens, regardless of any env.
  if (process.env.NODE_ENV === 'production') return null;
  // In dev/staging, dev tokens are off by default. Explicitly opt in via
  // ENABLE_DEV_BYPASS=1 (preferred) or the legacy FIREBASE_AUTH_DEV_BYPASS=1.
  const enabled =
    process.env.ENABLE_DEV_BYPASS === '1' ||
    process.env.FIREBASE_AUTH_DEV_BYPASS === '1';
  if (!enabled) return null;
  // No hardcoded fallback secret: even in dev/staging, the bypass only works if
  // an explicit secret is set. A shared default would let anyone who knows it
  // forge a token for any uid on a misconfigured staging box.
  const secret = process.env.FIREBASE_AUTH_DEV_SECRET;
  if (!secret || secret.length < 16) {
    logger.warn('dev token bypass enabled but FIREBASE_AUTH_DEV_SECRET is unset/too short — bypass disabled');
    return null;
  }
  return secret;
}

function verifyDevToken(token: string): VerifiedFirebaseUser | null {
  const secret = devTokenSecret();
  if (!secret || !token.startsWith('dev.')) return null;
  const [, payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    uid: string;
    email?: string | null;
    name?: string | null;
    picture?: string | null;
    emailVerified?: boolean;
  };

  return {
    firebaseUid: parsed.uid,
    email: parsed.email ?? null,
    name: parsed.name ?? null,
    picture: parsed.picture ?? null,
    emailVerified: parsed.emailVerified ?? true,
  };
}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedFirebaseUser | null> {
  const devUser = verifyDevToken(token);
  if (devUser) return devUser;

  try {
    // checkRevoked=true: reject tokens for users who signed out, were disabled,
    // or had their sessions revoked (e.g. after a password change / compromise).
    // Without it a stolen/stale ID token stays valid until its ~1h expiry.
    const decoded = await getAuth(firebaseAdminApp()).verifyIdToken(token, true);
    return {
      firebaseUid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : null,
      name: typeof decoded.name === 'string' ? decoded.name : null,
      picture: typeof decoded.picture === 'string' ? decoded.picture : null,
      emailVerified: decoded.email_verified === true,
    };
  } catch (err) {
    // Surface the reason so we can debug auth issues — `errorInfo.code` is
    // Firebase Admin's enum (e.g. `auth/id-token-expired`,
    // `auth/argument-error`, `auth/project-not-found`).
    const e = err as { errorInfo?: { code?: string; message?: string }; code?: string; message?: string };
    logger.warn(
      {
        code: e?.errorInfo?.code ?? e?.code ?? 'unknown',
        message: e?.errorInfo?.message ?? e?.message,
        tokenPreview: `${token.slice(0, 10)}…${token.slice(-6)}`,
      },
      'firebase: verifyIdToken failed',
    );
    return null;
  }
}
