// Simple symmetric encryption for sensitive data at rest in Supabase.
// Uses AES-256-GCM with a key derived from ENCRYPTION_SECRET env var.

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// U2 (2026-10-18): the fallback to SUPABASE_SERVICE_ROLE_KEY is a
// disaster waiting to happen — rotating the service role key would
// permanently brick every encrypted af_session.session_cookie, with
// NO runtime indication of the coupling. The fallback is retained for
// now to avoid breaking existing deployments that rely on it, but we
// log loudly when it fires. Migration path when Chase is ready:
//   1. Set ENCRYPTION_SECRET to the current service role key value.
//   2. Rotate the service role key (now safe — encryption is
//      decoupled).
//   3. Later, rotate ENCRYPTION_SECRET independently by first
//      re-encrypting af_session.session_cookie with the new secret.
// Once ENCRYPTION_SECRET is set in prod, we can delete the fallback.
let fallbackWarned = false;
function getKey(): Buffer {
  const explicit = process.env.ENCRYPTION_SECRET;
  const secret = explicit || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!secret) throw new Error('ENCRYPTION_SECRET not configured');
  if (!explicit && !fallbackWarned) {
    fallbackWarned = true;
    console.warn(
      '[crypto.ts] ENCRYPTION_SECRET not set — falling back to SUPABASE_SERVICE_ROLE_KEY. ' +
      'Rotating the service role key will BRICK af_session decryption. ' +
      'Set ENCRYPTION_SECRET to the current service role key value, then the two can be rotated independently.',
    );
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64(iv):base64(authTag):base64(encrypted)
  return `enc:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(encrypted: string): string {
  // Backward compatible: if not prefixed with 'enc:', treat as plaintext
  if (!encrypted.startsWith('enc:')) return encrypted;

  const parts = encrypted.split(':');
  if (parts.length !== 4) throw new Error('Invalid encrypted format');

  const key = getKey();
  const iv = Buffer.from(parts[1], 'base64');
  const authTag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
