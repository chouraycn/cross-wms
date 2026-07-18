import { describe, it, expect, beforeEach } from "vitest";
import { PairingCrypto } from "../pairing-crypto.js";

describe("PairingCrypto", () => {
  let crypto: PairingCrypto;

  beforeEach(() => {
    crypto = new PairingCrypto();
  });

  describe("generateKeyPair", () => {
    it("should generate a key pair with ECDH P-256", () => {
      const keyPair = crypto.generateKeyPair();
      expect(keyPair).toHaveProperty("publicKey");
      expect(keyPair).toHaveProperty("privateKey");
      expect(keyPair.publicKey).toBeTruthy();
      expect(keyPair.privateKey).toBeTruthy();
      expect(typeof keyPair.publicKey).toBe("string");
      expect(typeof keyPair.privateKey).toBe("string");
    });

    it("should generate different key pairs each time", () => {
      const keyPair1 = crypto.generateKeyPair();
      const keyPair2 = crypto.generateKeyPair();
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
    });
  });

  describe("computeSharedSecret", () => {
    it("should compute the same shared secret from both sides", () => {
      const aliceKeyPair = crypto.generateKeyPair();
      const bobKeyPair = crypto.generateKeyPair();

      const aliceSecret = crypto.computeSharedSecret(
        aliceKeyPair.privateKey,
        bobKeyPair.publicKey,
      );
      const bobSecret = crypto.computeSharedSecret(
        bobKeyPair.privateKey,
        aliceKeyPair.publicKey,
      );

      expect(aliceSecret).toBe(bobSecret);
    });

    it("should produce a non-empty shared secret", () => {
      const keyPair1 = crypto.generateKeyPair();
      const keyPair2 = crypto.generateKeyPair();

      const secret = crypto.computeSharedSecret(
        keyPair1.privateKey,
        keyPair2.publicKey,
      );

      expect(secret).toBeTruthy();
      expect(secret.length).toBeGreaterThan(0);
    });
  });

  describe("deriveKey", () => {
    it("should derive a key from shared secret", () => {
      const sharedSecret = crypto.generateRandomBytes(32);
      const result = crypto.deriveKey(sharedSecret);

      expect(result).toHaveProperty("key");
      expect(result).toHaveProperty("salt");
      expect(result.key).toBeTruthy();
      expect(result.salt).toBeTruthy();
    });

    it("should derive the same key with the same salt", () => {
      const sharedSecret = crypto.generateRandomBytes(32);
      const result1 = crypto.deriveKey(sharedSecret);
      const result2 = crypto.deriveKey(sharedSecret, result1.salt);

      expect(result1.key).toBe(result2.key);
    });

    it("should derive different keys with different salts", () => {
      const sharedSecret = crypto.generateRandomBytes(32);
      const salt1 = crypto.generateRandomBytes(16);
      const salt2 = crypto.generateRandomBytes(16);

      const result1 = crypto.deriveKey(sharedSecret, salt1);
      const result2 = crypto.deriveKey(sharedSecret, salt2);

      expect(result1.key).not.toBe(result2.key);
    });
  });

  describe("encrypt and decrypt", () => {
    it("should encrypt and decrypt data correctly", () => {
      const key = crypto.generateRandomBytes(32);
      const plaintext = "Hello, World!";

      const encrypted = crypto.encrypt(plaintext, key);
      expect(encrypted).toHaveProperty("ciphertext");
      expect(encrypted).toHaveProperty("iv");
      expect(encrypted).toHaveProperty("tag");
      expect(encrypted.algorithm).toBe("aes-256-gcm");

      const decrypted = crypto.decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it("should produce different ciphertext for same plaintext (different IV)", () => {
      const key = crypto.generateRandomBytes(32);
      const plaintext = "Hello, World!";

      const encrypted1 = crypto.encrypt(plaintext, key);
      const encrypted2 = crypto.encrypt(plaintext, key);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it("should fail to decrypt with wrong key", () => {
      const key1 = crypto.generateRandomBytes(32);
      const key2 = crypto.generateRandomBytes(32);
      const plaintext = "Hello, World!";

      const encrypted = crypto.encrypt(plaintext, key1);

      expect(() => crypto.decrypt(encrypted, key2)).toThrow();
    });

    it("should handle empty string", () => {
      const key = crypto.generateRandomBytes(32);
      const plaintext = "";

      const encrypted = crypto.encrypt(plaintext, key);
      const decrypted = crypto.decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle long strings", () => {
      const key = crypto.generateRandomBytes(32);
      const plaintext = "A".repeat(10000);

      const encrypted = crypto.encrypt(plaintext, key);
      const decrypted = crypto.decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("sign and verify", () => {
    it("should sign and verify data correctly", () => {
      const secretKey = crypto.generateRandomBytes(32);
      const data = "Hello, World!";

      const signature = crypto.sign(data, secretKey);
      expect(signature).toHaveProperty("signature");
      expect(signature).toHaveProperty("algorithm");
      expect(signature.algorithm).toBe("HMAC-SHA256");

      const isValid = crypto.verify(data, signature.signature, secretKey);
      expect(isValid).toBe(true);
    });

    it("should fail verification with wrong key", () => {
      const key1 = crypto.generateRandomBytes(32);
      const key2 = crypto.generateRandomBytes(32);
      const data = "Hello, World!";

      const signature = crypto.sign(data, key1);
      const isValid = crypto.verify(data, signature.signature, key2);

      expect(isValid).toBe(false);
    });

    it("should fail verification with tampered data", () => {
      const secretKey = crypto.generateRandomBytes(32);
      const data = "Hello, World!";

      const signature = crypto.sign(data, secretKey);
      const isValid = crypto.verify(
        "Hello, Tampered!",
        signature.signature,
        secretKey,
      );

      expect(isValid).toBe(false);
    });
  });

  describe("generateRandomBytes", () => {
    it("should generate random bytes of specified length", () => {
      const result = crypto.generateRandomBytes(16);
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should generate different values each time", () => {
      const result1 = crypto.generateRandomBytes(16);
      const result2 = crypto.generateRandomBytes(16);
      expect(result1).not.toBe(result2);
    });
  });

  describe("generateChallenge", () => {
    it("should generate a challenge", () => {
      const challenge = crypto.generateChallenge();
      expect(challenge).toBeTruthy();
      expect(typeof challenge).toBe("string");
    });

    it("should generate unique challenges", () => {
      const challenge1 = crypto.generateChallenge();
      const challenge2 = crypto.generateChallenge();
      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe("hash", () => {
    it("should hash data consistently", () => {
      const data = "Hello, World!";
      const hash1 = crypto.hash(data);
      const hash2 = crypto.hash(data);

      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different data", () => {
      const hash1 = crypto.hash("Hello");
      const hash2 = crypto.hash("World");

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("hmac", () => {
    it("should generate consistent HMAC", () => {
      const key = crypto.generateRandomBytes(32);
      const data = "Hello, World!";

      const hmac1 = crypto.hmac(data, key);
      const hmac2 = crypto.hmac(data, key);

      expect(hmac1).toBe(hmac2);
    });

    it("should produce different HMAC with different keys", () => {
      const key1 = crypto.generateRandomBytes(32);
      const key2 = crypto.generateRandomBytes(32);
      const data = "Hello, World!";

      const hmac1 = crypto.hmac(data, key1);
      const hmac2 = crypto.hmac(data, key2);

      expect(hmac1).not.toBe(hmac2);
    });
  });

  describe("constantTimeEquals", () => {
    it("should return true for equal strings", () => {
      const a = crypto.generateRandomBytes(32);
      expect(crypto.constantTimeEquals(a, a)).toBe(true);
    });

    it("should return false for different strings", () => {
      const a = crypto.generateRandomBytes(32);
      const b = crypto.generateRandomBytes(32);
      expect(crypto.constantTimeEquals(a, b)).toBe(false);
    });
  });

  describe("getKeyExchangeAlgorithm", () => {
    it("should return the key exchange algorithm", () => {
      expect(crypto.getKeyExchangeAlgorithm()).toBe("ecdh-p256");
    });
  });

  describe("getEncryptionAlgorithm", () => {
    it("should return the encryption algorithm", () => {
      expect(crypto.getEncryptionAlgorithm()).toBe("aes-256-gcm");
    });
  });
});
