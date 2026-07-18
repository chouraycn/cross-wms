import { logger } from "../../logger.js";
import { PairingSessionManager } from "./pairing-session.js";
import { PairingCrypto } from "./pairing-crypto.js";
import type {
  PairingMessage,
  PairingMessageType,
  PairingSession,
  DeviceInfo,
  PairingProtocolOptions,
  PairingSessionId,
} from "./types.js";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 30000;

export type ProtocolRole = "initiator" | "responder";

export type MessageHandler = (
  message: PairingMessage,
  session: PairingSession,
) => Promise<PairingMessage | void> | PairingMessage | void;

export class PairingProtocol {
  private sessionManager: PairingSessionManager;
  private crypto: PairingCrypto;
  private maxRetries: number;
  private retryDelayMs: number;
  private handshakeTimeoutMs: number;
  private messageHandlers = new Map<PairingMessageType, MessageHandler>();
  private pendingChallenges = new Map<PairingSessionId, string>();

  constructor(
    sessionManager: PairingSessionManager,
    options: PairingProtocolOptions = {},
  ) {
    this.sessionManager = sessionManager;
    this.crypto = sessionManager.getCrypto();
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.handshakeTimeoutMs =
      options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;

    this.registerDefaultHandlers();
  }

  createHelloMessage(sessionId: PairingSessionId): PairingMessage {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      type: "hello",
      sessionId,
      payload: {
        deviceInfo: session.localDevice,
        pairingMethod: session.pairingMethod,
        protocolVersion: "1.0.0",
      },
      timestamp: Date.now(),
    };
  }

  createHelloAckMessage(sessionId: PairingSessionId): PairingMessage {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      type: "hello-ack",
      sessionId,
      payload: {
        deviceInfo: session.localDevice,
        protocolVersion: "1.0.0",
      },
      timestamp: Date.now(),
    };
  }

  createChallengeMessage(sessionId: PairingSessionId): PairingMessage {
    const challenge = this.crypto.generateChallenge();
    this.pendingChallenges.set(sessionId, challenge);

    return {
      type: "challenge",
      sessionId,
      payload: { challenge },
      timestamp: Date.now(),
    };
  }

  createChallengeResponseMessage(
    sessionId: PairingSessionId,
    challenge: string,
  ): PairingMessage {
    const keyPair = this.sessionManager.getKeyPair(sessionId);
    if (!keyPair) {
      throw new Error(`No key pair for session ${sessionId}`);
    }

    const signature = this.crypto.sign(challenge, keyPair.privateKey);

    return {
      type: "challenge-response",
      sessionId,
      payload: {
        challenge,
        signature: signature.signature,
        publicKey: keyPair.publicKey,
      },
      timestamp: Date.now(),
    };
  }

  createKeyExchangeMessage(sessionId: PairingSessionId): PairingMessage {
    const keyPair = this.sessionManager.getKeyPair(sessionId);
    if (!keyPair) {
      throw new Error(`No key pair for session ${sessionId}`);
    }

    return {
      type: "key-exchange",
      sessionId,
      payload: {
        publicKey: keyPair.publicKey,
        algorithm: this.crypto.getKeyExchangeAlgorithm(),
      },
      timestamp: Date.now(),
    };
  }

  createKeyExchangeAckMessage(sessionId: PairingSessionId): PairingMessage {
    const keyPair = this.sessionManager.getKeyPair(sessionId);
    if (!keyPair) {
      throw new Error(`No key pair for session ${sessionId}`);
    }

    return {
      type: "key-exchange-ack",
      sessionId,
      payload: {
        publicKey: keyPair.publicKey,
        algorithm: this.crypto.getKeyExchangeAlgorithm(),
      },
      timestamp: Date.now(),
    };
  }

  createDeviceInfoMessage(sessionId: PairingSessionId): PairingMessage {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      type: "device-info",
      sessionId,
      payload: { deviceInfo: session.localDevice },
      timestamp: Date.now(),
    };
  }

  createPairingCompleteMessage(sessionId: PairingSessionId): PairingMessage {
    return {
      type: "pairing-complete",
      sessionId,
      payload: { status: "success" },
      timestamp: Date.now(),
    };
  }

  createErrorMessage(
    sessionId: PairingSessionId | undefined,
    error: string,
  ): PairingMessage {
    return {
      type: "error",
      sessionId,
      payload: { error },
      timestamp: Date.now(),
    };
  }

  createPingMessage(sessionId?: PairingSessionId): PairingMessage {
    return {
      type: "ping",
      sessionId,
      timestamp: Date.now(),
    };
  }

  createPongMessage(sessionId?: PairingSessionId): PairingMessage {
    return {
      type: "pong",
      sessionId,
      timestamp: Date.now(),
    };
  }

  async handleMessage(
    message: PairingMessage,
    role: ProtocolRole,
  ): Promise<PairingMessage | void> {
    const handler = this.messageHandlers.get(message.type);

    if (!handler) {
      logger.warn(`[PairingProtocol] No handler for message type: ${message.type}`);
      return;
    }

    const sessionId = message.sessionId;
    if (!sessionId) {
      logger.warn(`[PairingProtocol] Message without sessionId: ${message.type}`);
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      logger.warn(`[PairingProtocol] Session not found: ${sessionId}`);
      return this.createErrorMessage(sessionId, "Session not found");
    }

    try {
      return await handler(message, session);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[PairingProtocol] Error handling ${message.type}: ${errorMessage}`);
      this.sessionManager.failSession(sessionId, errorMessage);
      return this.createErrorMessage(sessionId, errorMessage);
    }
  }

  registerHandler(type: PairingMessageType, handler: MessageHandler): void {
    this.messageHandlers.set(type, handler);
  }

  private registerDefaultHandlers(): void {
    this.registerHandler("hello", this.handleHello.bind(this));
    this.registerHandler("hello-ack", this.handleHelloAck.bind(this));
    this.registerHandler("challenge", this.handleChallenge.bind(this));
    this.registerHandler("challenge-response", this.handleChallengeResponse.bind(this));
    this.registerHandler("key-exchange", this.handleKeyExchange.bind(this));
    this.registerHandler("key-exchange-ack", this.handleKeyExchangeAck.bind(this));
    this.registerHandler("device-info", this.handleDeviceInfo.bind(this));
    this.registerHandler("device-info-ack", this.handleDeviceInfoAck.bind(this));
    this.registerHandler("pairing-complete", this.handlePairingComplete.bind(this));
    this.registerHandler("pairing-complete-ack", this.handlePairingCompleteAck.bind(this));
    this.registerHandler("error", this.handleError.bind(this));
    this.registerHandler("ping", this.handlePing.bind(this));
    this.registerHandler("pong", this.handlePong.bind(this));
  }

  private handleHello(message: PairingMessage, session: PairingSession): PairingMessage {
    const payload = message.payload as { deviceInfo?: DeviceInfo };

    if (payload.deviceInfo) {
      this.sessionManager.setRemoteDevice(session.sessionId, payload.deviceInfo);
    }

    this.sessionManager.transitionState(session.sessionId, "connecting");

    return this.createHelloAckMessage(session.sessionId);
  }

  private handleHelloAck(message: PairingMessage, session: PairingSession): PairingMessage {
    const payload = message.payload as { deviceInfo?: DeviceInfo };

    if (payload.deviceInfo) {
      this.sessionManager.setRemoteDevice(session.sessionId, payload.deviceInfo);
    }

    this.sessionManager.transitionState(session.sessionId, "authenticating");

    return this.createChallengeMessage(session.sessionId);
  }

  private handleChallenge(message: PairingMessage, session: PairingSession): PairingMessage {
    const payload = message.payload as { challenge?: string };

    if (!payload.challenge) {
      throw new Error("Challenge message missing challenge");
    }

    this.sessionManager.transitionState(session.sessionId, "authenticating");

    return this.createChallengeResponseMessage(
      session.sessionId,
      payload.challenge,
    );
  }

  private handleChallengeResponse(
    message: PairingMessage,
    session: PairingSession,
  ): PairingMessage {
    const payload = message.payload as {
      challenge?: string;
      signature?: string;
      publicKey?: string;
    };

    const pendingChallenge = this.pendingChallenges.get(session.sessionId);
    if (!pendingChallenge) {
      throw new Error("No pending challenge");
    }

    if (payload.challenge !== pendingChallenge) {
      throw new Error("Challenge mismatch");
    }

    if (!payload.signature || !payload.publicKey) {
      throw new Error("Missing signature or public key");
    }

    const isValid = this.crypto.verify(
      payload.challenge,
      payload.signature,
      payload.publicKey,
    );

    if (!isValid) {
      throw new Error("Invalid challenge signature");
    }

    this.pendingChallenges.delete(session.sessionId);
    this.sessionManager.transitionState(session.sessionId, "exchanging-keys");

    return this.createKeyExchangeMessage(session.sessionId);
  }

  private handleKeyExchange(
    message: PairingMessage,
    session: PairingSession,
  ): PairingMessage {
    const payload = message.payload as { publicKey?: string };

    if (!payload.publicKey) {
      throw new Error("Key exchange message missing public key");
    }

    const sharedSecret = this.sessionManager.computeSharedSecret(
      session.sessionId,
      payload.publicKey,
    );

    if (!sharedSecret) {
      throw new Error("Failed to compute shared secret");
    }

    return this.createKeyExchangeAckMessage(session.sessionId);
  }

  private handleKeyExchangeAck(
    message: PairingMessage,
    session: PairingSession,
  ): PairingMessage {
    const payload = message.payload as { publicKey?: string };

    if (!payload.publicKey) {
      throw new Error("Key exchange ack missing public key");
    }

    const sharedSecret = this.sessionManager.computeSharedSecret(
      session.sessionId,
      payload.publicKey,
    );

    if (!sharedSecret) {
      throw new Error("Failed to compute shared secret");
    }

    return this.createDeviceInfoMessage(session.sessionId);
  }

  private handleDeviceInfo(message: PairingMessage, session: PairingSession): PairingMessage {
    const payload = message.payload as { deviceInfo?: DeviceInfo };

    if (payload.deviceInfo) {
      this.sessionManager.setRemoteDevice(session.sessionId, payload.deviceInfo);
    }

    return {
      type: "device-info-ack",
      sessionId: session.sessionId,
      timestamp: Date.now(),
    };
  }

  private handleDeviceInfoAck(
    _message: PairingMessage,
    session: PairingSession,
  ): PairingMessage {
    return this.createPairingCompleteMessage(session.sessionId);
  }

  private handlePairingComplete(
    _message: PairingMessage,
    session: PairingSession,
  ): PairingMessage {
    this.sessionManager.completeSession(session.sessionId);

    return {
      type: "pairing-complete-ack",
      sessionId: session.sessionId,
      timestamp: Date.now(),
    };
  }

  private handlePairingCompleteAck(
    _message: PairingMessage,
    session: PairingSession,
  ): void {
    if (session.state !== "paired") {
      this.sessionManager.completeSession(session.sessionId);
    }
  }

  private handleError(message: PairingMessage, session: PairingSession): void {
    const payload = message.payload as { error?: string };
    const error = payload.error ?? "Unknown error";
    this.sessionManager.failSession(session.sessionId, error);
  }

  private handlePing(message: PairingMessage): PairingMessage {
    return this.createPongMessage(message.sessionId);
  }

  private handlePong(): void {
    // Nothing to do, pong received
  }

  getMaxRetries(): number {
    return this.maxRetries;
  }

  getRetryDelayMs(): number {
    return this.retryDelayMs;
  }

  getHandshakeTimeoutMs(): number {
    return this.handshakeTimeoutMs;
  }

  getSessionManager(): PairingSessionManager {
    return this.sessionManager;
  }
}
