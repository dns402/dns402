# dns402

Decentralized payment discovery protocol via DNS TXT records on Solana.

## Overview

DNS402 enables monetization of APIs and content by storing payment requirements in DNS TXT records. When a client receives a 402 Payment Required response, it automatically resolves the DNS record, discovers payment terms, sends payment on Solana, and retries the request with proof.

## Installation

```bash
npm install dns402
```

## Quick Start

### Server Side (Express)

```typescript
import express from 'express';
import { dns402, createFullDNSRecord } from 'dns402/server';

const app = express();

// Protect routes with payment requirement
app.use('/api/premium', dns402({
  wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  price: 0.01,
  currency: 'USDC',
  sessionTTL: 3600,
  onPayment: (payment) => {
    console.log(`Received payment: ${payment.signature}`);
  }
}));

app.get('/api/premium/data', (req, res) => {
  res.json({ secret: 'premium content' });
});

// Generate DNS record for your domain
const record = createFullDNSRecord('api.example.com', {
  price: 0.01,
  currency: 'USDC',
  wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  sessionTTL: 3600
});
console.log(record);
// _402.api.example.com TXT "v=dns402;p=0.01;c=USDC;n=solana;w=7xKXtg...;t=3600"
```

### Client Side

```typescript
import { DNS402Client } from 'dns402/client';
import { Keypair } from '@solana/web3.js';

const client = new DNS402Client({
  keypair: Keypair.generate().secretKey,
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  autoPay: {
    enabled: true,
    maxAmount: 0.1,
    currency: 'USDC'
  },
  sessionCache: true
});

// Automatic payment handling
const response = await client.fetch('https://api.example.com/premium/data');
const data = await response.json();

// Or discover pricing first
const pricing = await client.discover('api.example.com');
console.log(pricing);
// { price: 0.01, currency: 'USDC', network: 'solana', wallet: '7xKXtg...' }

// Manual payment
const session = await client.pay('api.example.com');
console.log(session.proof.signature);
```

## DNS Record Format

Add a TXT record to `_402.yourdomain.com`:

```
v=dns402;p=0.01;c=USDC;n=solana;w=7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU;t=3600
```

| Field | Description |
|-------|-------------|
| `v` | Protocol version (always `dns402`) |
| `p` | Price amount |
| `c` | Currency (`SOL` or `USDC`) |
| `n` | Network (always `solana`) |
| `w` | Recipient wallet address |
| `t` | Session TTL in seconds |
| `m` | Payment model: `per-request`, `session`, `subscription` |

## Protocol Flow

```
1. Client → GET api.example.com/data
2. Server → 402 Payment Required + DNS402 headers
3. Client → Resolve _402.api.example.com TXT
4. Client → Parse payment requirements
5. Client → Send SOL/USDC to wallet
6. Client → Retry with X-DNS402-Proof header
7. Server → Verify payment on-chain
8. Server → 200 OK + data
```

## HTTP Headers

### Response (402)

```
DNS402-Price: 0.01
DNS402-Currency: USDC
DNS402-Network: solana
DNS402-Wallet: 7xKXtg...
DNS402-Session-TTL: 3600
```

### Request (after payment)

```
X-DNS402-Proof: <transaction_signature>
X-DNS402-Payer: <wallet_address>
```

## API Reference

### DNS402Client

```typescript
new DNS402Client(config: DNS402ClientConfig)
```

- `keypair` - Solana keypair as Uint8Array
- `rpcEndpoint` - Solana RPC URL (optional)
- `autoPay` - Auto-payment settings (optional)
- `sessionCache` - Cache paid sessions (optional)

Methods:
- `discover(domain)` - Get payment requirements
- `pay(domain)` - Pay for access
- `fetch(url, init?)` - Fetch with automatic payment
- `getSession(domain)` - Get cached session
- `clearCache()` - Clear session cache

### dns402 Middleware

```typescript
dns402(config: DNS402ServerConfig)
```

- `wallet` - Recipient wallet address
- `price` - Price per request/session
- `currency` - `'SOL'` or `'USDC'`
- `sessionTTL` - Session duration in seconds (default: 3600)
- `rpcEndpoint` - Solana RPC for verification
- `onPayment` - Callback on successful payment

### Utility Functions

```typescript
// Generate DNS record value
createDNSRecord({ price, currency, wallet, sessionTTL?, model? })

// Generate full DNS record with domain
createFullDNSRecord(domain, { price, currency, wallet, sessionTTL?, model? })

// Parse DNS record
parseRecord(txt: string): DNS402Record | null

// Resolve DNS record for domain
resolveRecord(domain: string): Promise<DNS402Record | null>
```

## Supported Currencies

- **SOL** - Native Solana
- **USDC** - SPL Token (mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)

## License

MIT
