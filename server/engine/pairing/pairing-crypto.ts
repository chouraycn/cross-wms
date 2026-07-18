import crypto from "node:crypto";
import { logger } from "../../logger.js";
import type {
  KeyPair,
  EncryptedData,
  SignatureData,
  CryptoAlgorithm,
  KeyExchangeAlgorithm,
  PairingCryptoOptions,
} from "./types.js";

const DEFAULT_KEY_EXCHANGE_ALGORITHM: KeyExchangeAlgorithm = "ecdh-p256";
const DEFAULT_ENCRYPTION_ALGORITHM: CryptoAlgorithm = "aes-256-gcm";
const DEFAULT_KEY_DERIVATION_ROUNDS = 100000;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;

export class PairingCrypto {
  private keyExchangeAlgorithm: KeyExchangeAlgorithm;
  private encryptionAlgorithm: CryptoAlgorithm;
  private keyDerivationRounds: number;

  constructor(options: PairingCryptoOptions = {}) {
    this.keyExchangeAlgorithm = options.keyExchangeAlgorithm ?? DEFAULT_KEY_EXCHANGE_ALGORITHM;
    this.encryptionAlgorithm = options.encryptionAlgorithm ?? DEFAULT_ENCRYPTION_ALGORITHM;
    this.keyDerivationRounds = options.keyDerivationRounds ?? DEFAULT_KEY_DERIVATION_ROUNDS;
  }

  generateKeyPair(): KeyPair {
    logger.debug(`[PairingCrypto] Generating key pair with ${this.keyExchangeAlgorithm}`);

    if (this.keyExchangeAlgorithm === "ecdh-p256") {
      const ecdh = crypto.createECDH("prime256v1");
      ecdh.generateKeys();
      return {
        publicKey: ecdh.getPublicKey("base64"),
        privateKey: ecdh.getPrivateKey("base64"),
      };
    }

    if (this.keyExchangeAlgorithm === "x25519") {
      const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519", {
        publicKeyEncoding: { type: "spki", format: "der" },
        privateKeyEncoding: { type: "pkcs8", format: "der" },
      });
      return {
        publicKey: publicKey.toString("base64"),
        privateKey: privateKey.toString("base64"),
      };
    }

    throw new Error(`Unsupported key exchange algorithm: ${this.keyExchangeAlgorithm}`);
  }

  computeSharedSecret(privateKey: string, publicKey: string): string {
    logger.debug(`[PairingCrypto] Computing shared secret with ${this.keyExchangeAlgorithm}`);

    if (this.keyExchangeAlgorithm === "ecdh-p256") {
      const ecdh = crypto.createECDH("prime256v1");
      ecdh.setPrivateKey(Buffer.from(privateKey, "base64"));
      const sharedSecret = ecdh.computeSecret(Buffer.from(publicKey, "base64"));
      return sharedSecret.toString("base64");
    }

    if (this.keyExchangeAlgorithm === "x25519") {
      const privateKeyObj = crypto.createPrivateKey({
        key: Buffer.from(privateKey, "base64"),
        format: "der",
        type: "pkcs8",
      });
      const publicKeyObj = crypto.createPublicKey({
        key: Buffer.from(publicKey, "base64"),
        format: "der",
        type: "spki",
      });
      const sharedSecret = crypto.diffieHellman({
        privateKey: privateKeyObj,
        publicKey: publicKeyObj,
      });
      return sharedSecret.toString("base64");
    }

    throw new Error(`Unsupported key exchange algorithm: ${this.keyExchangeAlgorithm}`);
  }

  deriveKey(sharedSecret: string, salt?: string): { key: string; salt: string } {
    const saltBuffer = salt ? Buffer.from(salt, "base64") : crypto.randomBytes(SALT_LENGTH);
    const key = crypto.pbkdf2Sync(
      Buffer.from(sharedSecret, "base64"),
      saltBuffer,
      this.keyDerivationRounds,
      32,
      "sha256",
    );

    return {
      key: key.toString("base64"),
      salt: saltBuffer.toString("base64"),
    };
  }

  encrypt(plaintext: string, key: string): EncryptedData {
    const keyBuffer = Buffer.from(key, "base64");
    const iv = crypto.randomBytes(IV_LENGTH);

    if (this.encryptionAlgorithm === "aes-256-gcm") {
      const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);
      let ciphertext = cipher.update(plaintext, "utf8", "base64");
      ciphertext += cipher.final("base64");
      const tag = cipher.getAuthTag();

      return {
        ciphertext,
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        algorithm: "aes-256-gcm",
      };
    }

    if (this.encryptionAlgorithm === "chacha20-poly1305") {
      const cipher = crypto.createCipheriv("chacha20-poly1305", keyBuffer, iv, {
        authTagLength: TAG_LENGTH,
      });
      let ciphertext = cipher.update(plaintext, "utf8", "base64");
      ciphertext += cipher.final("base64");
      const tag = cipher.getAuthTag();

      return {
        ciphertext,
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        algorithm: "chacha20-poly1305",
      };
    }

    throw new Error(`Unsupported encryption algorithm: ${this.encryptionAlgorithm}`);
  }

  decrypt(encrypted: EncryptedData, key: string): string {
    const keyBuffer = Buffer.from(key, "base64");
    const iv = Buffer.from(encrypted.iv, "base64");

    if (encrypted.algorithm === "aes-256-gcm") {
      const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv);
      if (encrypted.tag) {
        decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
      }
      let plaintext = decipher.update(encrypted.ciphertext, "base64", "utf8");
      plaintext += decipher.final("utf8");
      return plaintext;
    }

    if (encrypted.algorithm === "chacha20-poly1305") {
      const decipher = crypto.createDecipheriv("chacha20-poly1305", keyBuffer, iv, {
        authTagLength: TAG_LENGTH,
      });
      if (encrypted.tag) {
        decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
      }
      let plaintext = decipher.update(encrypted.ciphertext, "base64", "utf8");
      plaintext += decipher.final("utf8");
      return plaintext;
    }

    throw new Error(`Unsupported encryption algorithm: ${encrypted.algorithm}`);
  }

  sign(data: string, privateKey: string): SignatureData {
    const signature = this.hmac(data, privateKey);
    return {
      signature,
      algorithm: "HMAC-SHA256",
    };
  }

  verify(data: string, signature: string, privateKey: string): boolean {
    try {
      const expected = this.hmac(data, privateKey);
      return this.constantTimeEquals(expected, signature);
    } catch (err) {
      logger.warn(`[PairingCrypto] Signature verification failed: ${err}`);
      return false;
    }
  }

  generateRandomBytes(length: number): string {
    return crypto.randomBytes(length).toString("base64");
  }

  generateChallenge(): string {
    return this.generateRandomBytes(32);
  }

  hash(data: string, algorithm: string = "sha256"): string {
    return crypto.createHash(algorithm).update(data).digest("base64");
  }

  hmac(data: string, key: string, algorithm: string = "sha256"): string {
    return crypto.createHmac(algorithm, Buffer.from(key, "base64")).update(data).digest("base64");
  }

  constantTimeEquals(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a, "base64");
      const bufB = Buffer.from(b, "base64");
      return crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  getKeyExchangeAlgorithm(): KeyExchangeAlgorithm {
    return this.keyExchangeAlgorithm;
  }

  getEncryptionAlgorithm(): CryptoAlgorithm {
    return this.encryptionAlgorithm;
  }
}

export const pairingCrypto = new PairingCrypto();
