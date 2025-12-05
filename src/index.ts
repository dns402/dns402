// Core exports
export {
  DNS402Record,
  DNS402Session,
  DNS402ClientConfig,
  DNS402ServerConfig,
  PaymentProof,
  DNS402_HEADERS,
  USDC_MINTS,
} from './core/types';

export {
  parseRecord,
  generateRecord,
  resolveRecord,
  generateDNSRecordString,
} from './core/dns';

export {
  createConnection,
  sendSOLPayment,
  sendUSDCPayment,
  sendPayment,
  verifyPayment,
} from './core/solana';

// Client exports
export { DNS402Client } from './client/client';

// Server exports
export { dns402, createDNSRecord, createFullDNSRecord } from './server/middleware';
