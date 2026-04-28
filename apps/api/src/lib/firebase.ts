import { createHmac, timingSafeEqual } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp, type AppOptions } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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
  if (process.env.NODE_ENV === 'production' && process.env.FIREBASE_AUTH_DEV_BYPASS !== '1') {
    return null;
  }
  if (process.env.FIREBASE_AUTH_DEV_BYPASS === '0') return null;
  return process.env.FIREBASE_AUTH_DEV_SECRET ?? 'ednacharge-test-firebase-auth';
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
    const decoded = await getAuth(firebaseAdminApp()).verifyIdToken(token);
    return {
      firebaseUid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : null,
      name: typeof decoded.name === 'string' ? decoded.name : null,
      picture: typeof decoded.picture === 'string' ? decoded.picture : null,
      emailVerified: decoded.email_verified === true,
    };
  } catch {
    return null;
  }
}
