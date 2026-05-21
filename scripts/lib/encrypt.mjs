import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

export function deriveContentKey(secret) {
  const s = String(secret || '').trim();
  if (!s) {
    throw new Error('BLOG_ENCRYPT_KEY is required to build encrypted posts');
  }
  return createHash('sha256').update(s, 'utf8').digest();
}

export function hashAccessPassword(from, password) {
  return createHash('sha256')
    .update(`${String(from)}:${String(password)}`, 'utf8')
    .digest('hex');
}

export function encryptPayload(secret, payload) {
  const key = deriveContentKey(secret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const plain = Buffer.from(JSON.stringify(payload), 'utf8');
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  };
}

export function decryptPayload(secret, envelope) {
  const key = deriveContentKey(secret);
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const data = Buffer.from(envelope.data, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}
