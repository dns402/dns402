import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import type { DNS402Record, PaymentProof, SupportedCurrency } from './types';
import { USDC_MINTS, DNS402_MINT, TOKEN_DECIMALS } from './types';

const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

/**
 * Create a Solana connection
 */
export function createConnection(endpoint: string = DEFAULT_RPC): Connection {
  return new Connection(endpoint, 'confirmed');
}

/**
 * Send SOL payment
 */
export async function sendSOLPayment(
  connection: Connection,
  payer: Keypair,
  recipient: string,
  amount: number
): Promise<PaymentProof> {
  const recipientPubkey = new PublicKey(recipient);
  const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipientPubkey,
      lamports,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);

  return {
    signature,
    payer: payer.publicKey.toBase58(),
    timestamp: Date.now(),
  };
}

/**
 * Send SPL token payment (USDC, DNS402, or custom token)
 */
export async function sendSPLTokenPayment(
  connection: Connection,
  payer: Keypair,
  recipient: string,
  amount: number,
  mint: string,
  decimals: number = 6
): Promise<PaymentProof> {
  const tokenMint = new PublicKey(mint);
  const recipientPubkey = new PublicKey(recipient);

  // Get associated token accounts
  const payerATA = await getAssociatedTokenAddress(tokenMint, payer.publicKey);
  const recipientATA = await getAssociatedTokenAddress(tokenMint, recipientPubkey);

  const transaction = new Transaction();

  // Check if recipient ATA exists, create if not
  try {
    await getAccount(connection, recipientATA);
  } catch {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        recipientATA,
        recipientPubkey,
        tokenMint
      )
    );
  }

  // Calculate token amount based on decimals
  const tokenAmount = Math.floor(amount * Math.pow(10, decimals));

  transaction.add(
    createTransferInstruction(
      payerATA,
      recipientATA,
      payer.publicKey,
      tokenAmount
    )
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);

  return {
    signature,
    payer: payer.publicKey.toBase58(),
    timestamp: Date.now(),
  };
}

/**
 * Send USDC payment
 * @deprecated Use sendSPLTokenPayment instead
 */
export async function sendUSDCPayment(
  connection: Connection,
  payer: Keypair,
  recipient: string,
  amount: number,
  mint?: string
): Promise<PaymentProof> {
  return sendSPLTokenPayment(
    connection,
    payer,
    recipient,
    amount,
    mint || USDC_MINTS.mainnet,
    TOKEN_DECIMALS.USDC
  );
}

/**
 * Send DNS402 token payment
 */
export async function sendDNS402Payment(
  connection: Connection,
  payer: Keypair,
  recipient: string,
  amount: number
): Promise<PaymentProof> {
  return sendSPLTokenPayment(
    connection,
    payer,
    recipient,
    amount,
    DNS402_MINT,
    TOKEN_DECIMALS.DNS402
  );
}

/**
 * Send payment based on DNS402 record
 */
export async function sendPayment(
  connection: Connection,
  payer: Keypair,
  record: DNS402Record
): Promise<PaymentProof> {
  switch (record.currency) {
    case 'SOL':
      return sendSOLPayment(connection, payer, record.wallet, record.price);
    case 'USDC':
      return sendSPLTokenPayment(
        connection,
        payer,
        record.wallet,
        record.price,
        record.mint || USDC_MINTS.mainnet,
        TOKEN_DECIMALS.USDC
      );
    case 'DNS402':
      return sendDNS402Payment(connection, payer, record.wallet, record.price);
    default:
      // Support custom tokens via mint field
      if (record.mint) {
        return sendSPLTokenPayment(
          connection,
          payer,
          record.wallet,
          record.price,
          record.mint,
          6 // default decimals
        );
      }
      throw new Error(`Unsupported currency: ${record.currency}`);
  }
}

/**
 * Verify a payment on-chain
 */
export async function verifyPayment(
  connection: Connection,
  signature: string,
  expectedRecipient: string,
  expectedAmount: number,
  currency: SupportedCurrency
): Promise<boolean> {
  try {
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta) {
      return false;
    }

    // Check if transaction was successful
    if (tx.meta.err) {
      return false;
    }

    const recipientPubkey = new PublicKey(expectedRecipient);

    if (currency === 'SOL') {
      // Check SOL transfer
      const preBalances = tx.meta.preBalances;
      const postBalances = tx.meta.postBalances;
      const accountKeys = tx.transaction.message.getAccountKeys();

      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys.get(i)?.equals(recipientPubkey)) {
          const received = (postBalances[i] - preBalances[i]) / LAMPORTS_PER_SOL;
          if (received >= expectedAmount * 0.99) {
            return true;
          }
        }
      }
    } else {
      // Check SPL token transfer (USDC, DNS402, etc.) via post token balances
      const postTokenBalances = tx.meta.postTokenBalances || [];
      const preTokenBalances = tx.meta.preTokenBalances || [];

      for (const post of postTokenBalances) {
        if (post.owner === expectedRecipient) {
          const pre = preTokenBalances.find(
            p => p.accountIndex === post.accountIndex
          );
          const preAmount = pre?.uiTokenAmount.uiAmount || 0;
          const postAmount = post.uiTokenAmount.uiAmount || 0;
          const received = postAmount - preAmount;

          if (received >= expectedAmount * 0.99) {
            return true;
          }
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}
