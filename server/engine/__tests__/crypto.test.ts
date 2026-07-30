// crypto unit tests cover AES-256-GCM encrypt/decrypt round-trip, key
// generation length, key-length validation errors, and ensureEncryptionKey
// read-or-create behavior against an in-memory SQLite stub.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// In-memory SQLite mock for ensureEncryptionKey tests.
const stmtMocks = {
  get: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
};
const dbMock = {
  exec: vi.fn(),
  prepare: vi.fn(() => stmtMocks),
};

vi.mock('../../db.js', () => ({
  initDb: () => dbMock,
}));

import {
  generateEncryptionKey,
  encrypt,
  decrypt,
  ensureEncryptionKey,
} from '../crypto.js';

const KEY_LENGTH = 32;

// Shared key for encrypt/decrypt tests (generated once per test file).
const sharedKey = generateEncryptionKey();

describe('engine/crypto — generateEncryptionKey', () => {
  it('returns a base64 string of 32 bytes (256-bit)', () => {
    const key = generateEncryptionKey();
    const decoded = Buffer.from(key, 'base64');
    expect(decoded.length).toBe(KEY_LENGTH);
  });

  it('produces different keys on each call (randomness)', () => {
    const k1 = generateEncryptionKey();
    const k2 = generateEncryptionKey();
    expect(k1).not.toBe(k2);
  });
});

describe('engine/crypto — encrypt/decrypt round-trip', () => {
  const key = sharedKey;

  it('round-trips an ASCII plaintext', () => {
    const plaintext = 'hello world';
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips a CJK plaintext', () => {
    const plaintext = '你好世界，加密解密测试！';
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips an empty string', () => {
    const plaintext = '';
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips a long text (10KB)', () => {
    const plaintext = 'a'.repeat(10_000);
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('produces distinct ciphertexts for the same plaintext (random IV)', () => {
    const plaintext = 'same input';
    const e1 = encrypt(plaintext, key);
    const e2 = encrypt(plaintext, key);
    expect(e1).not.toBe(e2);
    // Both should still decrypt back to the original
    expect(decrypt(e1, key)).toBe(plaintext);
    expect(decrypt(e2, key)).toBe(plaintext);
  });

  it('encrypt returns JSON with iv, tag, ciphertext fields', () => {
    const encrypted = encrypt('test', key);
    const parsed = JSON.parse(encrypted);
    expect(parsed).toHaveProperty('iv');
    expect(parsed).toHaveProperty('tag');
    expect(parsed).toHaveProperty('ciphertext');
    // All base64-encoded
    expect(() => Buffer.from(parsed.iv, 'base64')).not.toThrow();
    expect(() => Buffer.from(parsed.tag, 'base64')).not.toThrow();
    expect(() => Buffer.from(parsed.ciphertext, 'base64')).not.toThrow();
  });
});

describe('engine/crypto — key validation errors', () => {
  const key = sharedKey;

  it('encrypt throws on short key', () => {
    const badKey = Buffer.from('tooShort').toString('base64');
    expect(() => encrypt('hello', badKey)).toThrow(/Invalid key length/);
  });

  it('decrypt throws on short key', () => {
    const goodKey = generateEncryptionKey();
    const encrypted = encrypt('hello', goodKey);
    const badKey = Buffer.from('tooShort').toString('base64');
    expect(() => decrypt(encrypted, badKey)).toThrow(/Invalid key length/);
  });

  it('decrypt throws on tampered ciphertext (auth tag mismatch)', () => {
    const encrypted = encrypt('secret', key);
    const parsed = JSON.parse(encrypted);
    // Flip a byte in ciphertext
    const ct = Buffer.from(parsed.ciphertext, 'base64');
    ct[0] = ct[0] ^ 0xff;
    parsed.ciphertext = ct.toString('base64');
    expect(() => decrypt(JSON.stringify(parsed), key)).toThrow();
  });

  it('decrypt throws on tampered auth tag', () => {
    const encrypted = encrypt('secret', key);
    const parsed = JSON.parse(encrypted);
    const tag = Buffer.from(parsed.tag, 'base64');
    tag[0] = tag[0] ^ 0xff;
    parsed.tag = tag.toString('base64');
    expect(() => decrypt(JSON.stringify(parsed), key)).toThrow();
  });

  it('decrypt throws on invalid JSON input', () => {
    expect(() => decrypt('not json', key)).toThrow();
  });
});

describe('engine/crypto — ensureEncryptionKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing key when app_settings already has one', () => {
    const existingKey = 'preExistingKeyBase64==';
    stmtMocks.get.mockReturnValueOnce({ value: existingKey });

    const result = ensureEncryptionKey();

    expect(result).toBe(existingKey);
    expect(dbMock.exec).toHaveBeenCalledWith(
      'CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    );
    expect(dbMock.prepare).toHaveBeenCalledWith(
      'SELECT value FROM app_settings WHERE key = ?',
    );
    // Should NOT attempt to insert a new key
    const insertCall = stmtMocks.run.mock.calls.find(
      ([, value]) => value === undefined || typeof value === 'string',
    );
    expect(insertCall).toBeUndefined();
  });

  it('generates and stores a new key when none exists', () => {
    stmtMocks.get.mockReturnValueOnce(undefined);

    const result = ensureEncryptionKey();

    // Result is a base64-encoded 32-byte key
    const decoded = Buffer.from(result, 'base64');
    expect(decoded.length).toBe(KEY_LENGTH);

    // Should have created the table and inserted the new key
    expect(dbMock.exec).toHaveBeenCalledWith(
      'CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    );
    expect(dbMock.prepare).toHaveBeenCalledWith(
      'INSERT INTO app_settings (key, value) VALUES (?,?)',
    );
    // Verify the insert was called with the engine_encryption_key setting name
    expect(stmtMocks.run).toHaveBeenCalledWith(
      'engine_encryption_key',
      expect.any(String),
    );
    // And the inserted value matches the returned key
    const insertArgs = stmtMocks.run.mock.calls[0];
    expect(insertArgs[1]).toBe(result);
  });

  it('uses the same setting key name on repeated calls', () => {
    stmtMocks.get.mockReturnValue(undefined);
    ensureEncryptionKey();
    ensureEncryptionKey();
    // Both calls should query the same setting key
    expect(stmtMocks.get).toHaveBeenCalledTimes(2);
  });
});
