import { promises as dns } from 'dns';
import type { DNS402Record } from './types';

/**
 * Parse DNS402 TXT record value into structured object
 * Format: v=dns402;p=0.001;c=USDC;n=solana;w=ABC...;t=3600;m=per-request
 */
export function parseRecord(txt: string): DNS402Record | null {
  const parts = txt.split(';').map(p => p.trim()).filter(Boolean);
  const data: Record<string, string> = {};

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) {
      data[key.trim()] = value.trim();
    }
  }

  // Validate required fields
  if (data.v !== 'dns402' || !data.p || !data.c || !data.n || !data.w) {
    return null;
  }

  return {
    version: data.v,
    price: parseFloat(data.p),
    currency: data.c.toUpperCase(),
    network: data.n.toLowerCase(),
    wallet: data.w,
    ttl: data.t ? parseInt(data.t, 10) : undefined,
    model: (data.m as DNS402Record['model']) || 'per-request',
    callback: data.cb,
    mint: data.mint,
  };
}

/**
 * Generate DNS TXT record value from config
 */
export function generateRecord(config: {
  price: number;
  currency: string;
  wallet: string;
  ttl?: number;
  model?: 'per-request' | 'session' | 'subscription';
  callback?: string;
  mint?: string;
}): string {
  const parts = [
    'v=dns402',
    `p=${config.price}`,
    `c=${config.currency}`,
    'n=solana',
    `w=${config.wallet}`,
  ];

  if (config.ttl) parts.push(`t=${config.ttl}`);
  if (config.model) parts.push(`m=${config.model}`);
  if (config.callback) parts.push(`cb=${config.callback}`);
  if (config.mint) parts.push(`mint=${config.mint}`);

  return parts.join(';');
}

/**
 * Resolve DNS402 TXT record for a domain
 * Looks up _402.{domain} TXT record
 */
export async function resolveRecord(domain: string): Promise<DNS402Record | null> {
  // Remove protocol and path
  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');

  const recordDomain = `_402.${cleanDomain}`;

  try {
    const records = await dns.resolveTxt(recordDomain);
    
    // TXT records can be chunked, join them
    for (const record of records) {
      const txt = Array.isArray(record) ? record.join('') : record;
      const parsed = parseRecord(txt);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  } catch (error) {
    // Record not found or DNS error
    return null;
  }
}

/**
 * Generate full DNS record string for documentation
 */
export function generateDNSRecordString(domain: string, config: {
  price: number;
  currency: string;
  wallet: string;
  ttl?: number;
  model?: 'per-request' | 'session' | 'subscription';
}): string {
  const value = generateRecord(config);
  return `_402.${domain} TXT "${value}"`;
}
