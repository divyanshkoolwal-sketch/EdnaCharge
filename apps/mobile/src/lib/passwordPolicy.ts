import * as Crypto from 'expo-crypto';

/**
 * Password policy for account creation (sign-up).
 *
 * Industry-standard (NIST SP 800-63B aligned): length is the primary lever, so
 * we require a 12-char minimum and screen against known-breached passwords via
 * the HaveIBeenPwned k-anonymity API (we never send the password or its full
 * hash — only the first 5 chars of its SHA-1, per the HIBP range protocol).
 *
 * We do NOT impose composition rules (must-have-symbol etc.) — NIST advises
 * against them; they push users toward predictable patterns. Length + breach
 * screening is stronger.
 */

export const MIN_PASSWORD_LENGTH = 12;

/** Synchronous, offline policy check. Returns an error string or null if ok. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 128) {
    // Firebase rejects >4096; cap far lower to avoid DoS-y hashing inputs.
    return 'Password is too long.';
  }
  // Trivial all-same-char / whitespace-only guards.
  if (/^\s+$/.test(password)) return 'Password cannot be only spaces.';
  if (/^(.)\1+$/.test(password)) return 'Choose a less predictable password.';
  return null;
}

/**
 * HaveIBeenPwned k-anonymity breach check.
 * Returns true if the password appears in a known breach corpus.
 * FAIL-OPEN: any network/API error returns false (never blocks sign-up on an
 * outage — breach screening is defense-in-depth, not a hard gate).
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  try {
    const sha1 = (
      await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, password)
    ).toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
    });
    if (!res.ok) return false;
    const body = await res.text();
    // Each line: "<SHA1_SUFFIX>:<count>". Match our suffix; count 0 = padding.
    for (const line of body.split('\n')) {
      const [hashSuffix, countStr] = line.trim().split(':');
      if (hashSuffix === suffix && Number(countStr) > 0) return true;
    }
    return false;
  } catch {
    return false; // fail-open
  }
}

/**
 * Full sign-up validation: offline policy first (fast, no network), then the
 * breach check. Returns an error string or null if the password is acceptable.
 */
export async function validateNewPassword(password: string): Promise<string | null> {
  const policy = passwordPolicyError(password);
  if (policy) return policy;
  if (await isBreachedPassword(password)) {
    return 'This password has appeared in a data breach. Choose a different one.';
  }
  return null;
}
