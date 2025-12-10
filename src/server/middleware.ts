import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { DNS402ServerConfig, DNS402_HEADERS, PaymentProof, SupportedCurrency } from '../core/types';
import { verifyPayment, createConnection } from '../core/solana';
import { generateRecord, generateDNSRecordString } from '../core/dns';

interface PaymentSession {
  payer: string;
  signature: string;
  expiresAt: number;
}

/**
 * Express middleware for DNS402 payment verification
 */
export function dns402(config: DNS402ServerConfig): RequestHandler {
  const connection = createConnection(config.rpcEndpoint);
  const sessionTTL = (config.sessionTTL || 3600) * 1000;
  const sessions = new Map<string, PaymentSession>();

  // Cleanup expired sessions periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions) {
      if (session.expiresAt < now) {
        sessions.delete(key);
      }
    }
  }, 60000);

  return async (req: Request, res: Response, next: NextFunction) => {
    const proof = req.headers[DNS402_HEADERS.PROOF.toLowerCase()] as string;
    const payer = req.headers[DNS402_HEADERS.PAYER.toLowerCase()] as string;

    // Check for existing valid session
    if (payer) {
      const session = sessions.get(payer);
      if (session && session.expiresAt > Date.now()) {
        // Valid session, allow through
        return next();
      }
    }

    // No valid session, check for payment proof
    if (!proof || !payer) {
      return send402(res, config);
    }

    // Verify payment
    const isValid = await verifyPayment(
      connection,
      proof,
      config.wallet,
      config.price,
      config.currency
    );

    if (!isValid) {
      res.status(403).json({
        error: 'Invalid payment proof',
        message: 'Payment verification failed',
      });
      return;
    }

    // Create session
    const session: PaymentSession = {
      payer,
      signature: proof,
      expiresAt: Date.now() + sessionTTL,
    };
    sessions.set(payer, session);

    // Call onPayment callback
    if (config.onPayment) {
      const paymentProof: PaymentProof = {
        signature: proof,
        payer,
        timestamp: Date.now(),
      };
      await Promise.resolve(config.onPayment(paymentProof));
    }

    next();
  };
}

/**
 * Send 402 Payment Required response with DNS402 headers
 */
function send402(res: Response, config: DNS402ServerConfig): void {
  res
    .status(402)
    .set(DNS402_HEADERS.PRICE, config.price.toString())
    .set(DNS402_HEADERS.CURRENCY, config.currency)
    .set(DNS402_HEADERS.NETWORK, 'solana')
    .set(DNS402_HEADERS.WALLET, config.wallet)
    .set(DNS402_HEADERS.SESSION_TTL, (config.sessionTTL || 3600).toString())
    .json({
      error: 'Payment Required',
      price: config.price,
      currency: config.currency,
      network: 'solana',
      wallet: config.wallet,
      sessionTTL: config.sessionTTL || 3600,
    });
}

/**
 * Generate DNS TXT record for your domain
 */
export function createDNSRecord(config: {
  price: number;
  currency: SupportedCurrency;
  wallet: string;
  sessionTTL?: number;
  model?: 'per-request' | 'session' | 'subscription';
}): string {
  return generateRecord({
    price: config.price,
    currency: config.currency,
    wallet: config.wallet,
    ttl: config.sessionTTL,
    model: config.model,
  });
}

/**
 * Generate full DNS record string with domain
 */
export function createFullDNSRecord(
  domain: string,
  config: {
    price: number;
    currency: SupportedCurrency;
    wallet: string;
    sessionTTL?: number;
    model?: 'per-request' | 'session' | 'subscription';
  }
): string {
  return generateDNSRecordString(domain, {
    price: config.price,
    currency: config.currency,
    wallet: config.wallet,
    ttl: config.sessionTTL,
    model: config.model,
  });
}
