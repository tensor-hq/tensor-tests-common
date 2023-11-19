import { Wallet } from '@coral-xyz/anchor';
import {
  SingleConnectionBroadcaster,
  SolanaProvider,
  TransactionEnvelope,
} from '@saberhq/solana-contrib';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { test_utils } from '@tensor-hq/tensor-common';

const { buildAndSendTx } = test_utils;

export const transferLamports = async (
  conn: Connection,
  from: Keypair,
  to: PublicKey,
  amount: number,
) => {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: amount,
    }),
  );
  await buildAndSendTx({
    conn,
    payer: from,
    ixs: tx.instructions,
  });
};

// This passes the accounts' lamports before the provided `callback` function is called.
// Useful for doing before/after lamports diffing.
//
// Example:
// ```
// // Create tx...
// await withLamports(
//   { prevLamports: traderA.publicKey, prevEscrowLamports: solEscrowPda },
//   async ({ prevLamports, prevEscrowLamports }) => {
//     // Actually send tx
//     await buildAndSendTx({...});
//     const currlamports = await getLamports(traderA.publicKey);
//     // Compare currlamports w/ prevLamports
//   })
// );
// ```
export const withLamports = async <
  Accounts extends Record<string, PublicKey>,
  R,
>(
  conn: Connection,
  accts: Accounts,
  callback: (results: {
    [k in keyof Accounts]: number | undefined;
  }) => Promise<R>,
): Promise<R> => {
  const results = Object.fromEntries(
    await Promise.all(
      Object.entries(accts).map(async ([k, key]) => [
        k,
        await conn.getBalance(key),
      ]),
    ),
  );
  return await callback(results);
};

//useful for debugging
export const simulateTxTable = async (
  conn: Connection,
  ixs: TransactionInstruction[],
) => {
  const broadcaster = new SingleConnectionBroadcaster(conn);
  const wallet = new Wallet(Keypair.generate());
  const provider = new SolanaProvider(conn, broadcaster, wallet);
  const tx = new TransactionEnvelope(provider, ixs);
  console.log(await tx.simulateTable());
};
