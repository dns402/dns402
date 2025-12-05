import { Keypair, Connection } from '@solana/web3.js';
import {
  DNS402ClientConfig,
  DNS402Record,
  DNS402Session,
  PaymentProof,
  DNS402_HEADERS,
} from '../core/types';
import { resolveRecord } from '../core/dns';
import { createConnection, sendPayment } from '../core/solana';

/**
 * DNS402 Client for making paid requests
 */
export class DNS402Client {
  private keypair: Keypair;
  private connection: Connection;
  private config: DNS402ClientConfig;
  private sessionCache: Map<string, DNS402Session> = new Map();

  constructor(config: DNS402ClientConfig) {
    this.config = config;
    this.keypair = Keypair.fromSecretKey(config.keypair);
    this.connection = createConnection(config.rpcEndpoint);
  }

  /**
   * Get payer wallet address
   */
  get walletAddress(): string {
    return this.keypair.publicKey.toBase58();
  }

  /**
   * Discover payment requirements for a domain
   */
  async discover(domain: string): Promise<DNS402Record | null> {
    if (this.config.dnsResolver) {
      const txt = await this.config.dnsResolver(domain);
      if (!txt) return null;
      const { parseRecord } = await import('../core/dns');
      return parseRecord(txt);
    }
    return resolveRecord(domain);
  }

  /**
   * Pay for access to a domain
   */
  async pay(domain: string): Promise<DNS402Session> {
    // Check cache first
    const cached = this.sessionCache.get(domain);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    // Discover payment requirements
    const record = await this.discover(domain);
    if (!record) {
      throw new Error(`No DNS402 record found for ${domain}`);
    }

    // Send payment
    const proof = await sendPayment(this.connection, this.keypair, record);

    // Create session
    const session: DNS402Session = {
      domain,
      proof,
      expiresAt: Date.now() + (record.ttl || 3600) * 1000,
    };

    // Cache if enabled
    if (this.config.sessionCache) {
      this.sessionCache.set(domain, session);
    }

    return session;
  }

  /**
   * Make a fetch request with automatic payment handling
   */
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    // Check for cached session
    const cached = this.sessionCache.get(domain);
    if (cached && cached.expiresAt > Date.now()) {
      return this.fetchWithProof(url, init, cached.proof);
    }

    // First attempt
    const response = await fetch(url, init);

    // If not 402, return as-is
    if (response.status !== 402) {
      return response;
    }

    // Get DNS402 record
    const record = await this.discover(domain);
    if (!record) {
      throw new Error(`402 received but no DNS402 record found for ${domain}`);
    }

    // Check auto-pay settings
    if (this.config.autoPay?.enabled) {
      const { maxAmount, currency } = this.config.autoPay;
      if (record.price > maxAmount) {
        throw new Error(
          `Price ${record.price} ${record.currency} exceeds auto-pay limit of ${maxAmount} ${currency}`
        );
      }
      if (record.currency !== currency) {
        throw new Error(
          `Currency mismatch: expected ${currency}, got ${record.currency}`
        );
      }
    } else {
      throw new Error(
        `Payment required: ${record.price} ${record.currency}. Enable autoPay or call pay() first.`
      );
    }

    // Pay and retry
    const session = await this.pay(domain);
    return this.fetchWithProof(url, init, session.proof);
  }

  /**
   * Make a fetch request with payment proof headers
   */
  private async fetchWithProof(
    url: string,
    init: RequestInit | undefined,
    proof: PaymentProof
  ): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set(DNS402_HEADERS.PROOF, proof.signature);
    headers.set(DNS402_HEADERS.PAYER, proof.payer);

    return fetch(url, {
      ...init,
      headers,
    });
  }

  /**
   * Clear session cache
   */
  clearCache(): void {
    this.sessionCache.clear();
  }

  /**
   * Get cached session for a domain
   */
  getSession(domain: string): DNS402Session | undefined {
    const session = this.sessionCache.get(domain);
    if (session && session.expiresAt > Date.now()) {
      return session;
    }
    return undefined;
  }
}
