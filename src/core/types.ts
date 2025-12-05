/**
 * DNS402 Record parsed from TXT record
 */
export interface DNS402Record {
  /** Protocol version */
  version: string;
  /** Price amount */
  price: number;
  /** Currency (SOL, USDC, etc.) */
  currency: string;
  /** Network (always 'solana' for now) */
  network: string;
  /** Recipient wallet address */
  wallet: string;
  /** Session TTL in seconds */
  ttl?: number;
  /** Payment model */
  model?: 'per-request' | 'session' | 'subscription';
  /** Callback URL for payment verification */
  callback?: string;
  /** USDC mint address (optional, defaults to mainnet USDC) */
  mint?: string;
}

/**
 * Payment proof to attach to requests
 */
export interface PaymentProof {
  /** Transaction signature */
  signature: string;
  /** Payer wallet address */
  payer: string;
  /** Timestamp of payment */
  timestamp: number;
}

/**
 * Session information after successful payment
 */
export interface DNS402Session {
  /** Domain this session is for */
  domain: string;
  /** Session token (if using session-based auth) */
  token?: string;
  /** Payment proof */
  proof: PaymentProof;
  /** When session expires */
  expiresAt: number;
}

/**
 * Client configuration
 */
export interface DNS402ClientConfig {
  /** Solana wallet keypair */
  keypair: Uint8Array;
  /** Solana RPC endpoint */
  rpcEndpoint?: string;
  /** Auto-pay configuration */
  autoPay?: {
    enabled: boolean;
    maxAmount: number;
    currency: string;
  };
  /** Cache sessions in memory */
  sessionCache?: boolean;
  /** Custom DNS resolver */
  dnsResolver?: (domain: string) => Promise<string | null>;
}

/**
 * Server middleware configuration
 */
export interface DNS402ServerConfig {
  /** Recipient wallet address */
  wallet: string;
  /** Price per request/session */
  price: number;
  /** Currency */
  currency: 'SOL' | 'USDC';
  /** Session TTL in seconds (default: 3600) */
  sessionTTL?: number;
  /** Solana RPC endpoint for verification */
  rpcEndpoint?: string;
  /** Payment verification method */
  verify?: 'onchain' | 'signature';
  /** USDC mint address */
  usdcMint?: string;
  /** Callback on successful payment */
  onPayment?: (payment: PaymentProof) => void | Promise<void>;
}

/**
 * Headers used by DNS402 protocol
 */
export const DNS402_HEADERS = {
  HOST: 'DNS402-Host',
  PRICE: 'DNS402-Price',
  CURRENCY: 'DNS402-Currency',
  NETWORK: 'DNS402-Network',
  WALLET: 'DNS402-Wallet',
  SESSION_TTL: 'DNS402-Session-TTL',
  PROOF: 'X-DNS402-Proof',
  PAYER: 'X-DNS402-Payer',
  TOKEN: 'X-DNS402-Token',
} as const;

/**
 * Default USDC mint addresses
 */
export const USDC_MINTS = {
  mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
} as const;
