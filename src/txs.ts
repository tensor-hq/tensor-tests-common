import { Wallet } from '@coral-xyz/anchor';
import {
  SingleConnectionBroadcaster,
  SolanaProvider,
  TransactionEnvelope,
} from '@saberhq/solana-contrib';
import {
  AddressLookupTableAccount,
  ConfirmOptions,
  Connection,
  Finality,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { buildTxV0 } from '@tensor-hq/tensor-common';
import { backOff } from 'exponential-backoff';

export type BuildAndSendTxArgs = {
  conn: Connection;
  payer: Signer;
  ixs: TransactionInstruction[];
  extraSigners?: Signer[];
  opts?: ConfirmOptions;
  commitment?: Finality;
  // Prints out transaction (w/ logs) to stdout
  debug?: boolean;
  // Optional, if present signify that a V0 tx should be sent
  lookupTableAccounts?: [AddressLookupTableAccount] | undefined;
};

export const buildAndSendTx = async ({
  conn,
  payer,
  ixs,
  extraSigners,
  /** For tests, skip preflight so we can expect tx errors */
  opts,
  commitment = 'confirmed',
  debug,
  lookupTableAccounts,
}: BuildAndSendTxArgs) => {
  //build v0
  const { tx, blockhash, lastValidBlockHeight } = await backOff(
    () =>
      buildTxV0({
        connections: [conn],
        instructions: ixs,
        //have to add TEST_KEYPAIR here instead of wallet.signTx() since partialSign not impl on v0 txs
        additionalSigners: [payer, ...(extraSigners ?? [])],
        feePayer: payer.publicKey,
        addressLookupTableAccs: lookupTableAccounts ?? [],
      }),
    {
      // Retry blockhash errors (happens during tests sometimes).
      retry: (e: any) => {
        return e.message.includes('blockhash');
      },
    },
  );

  try {
    // Need to pass commitment here o/w it doesn't work...?
    if (debug) opts = { ...opts, commitment: 'confirmed' };
    const sig = await conn.sendTransaction(tx, {
      ...opts,
    });
    await conn.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      commitment,
    );
    if (debug) {
      console.log(
        await conn.getTransaction(sig, {
          commitment,
          maxSupportedTransactionVersion: 0,
        }),
      );
    }
    return sig;
  } catch (e) {
    //this is needed to see program error logs
    console.error('❌ FAILED TO SEND TX, FULL ERROR: ❌');
    console.error(e);
    throw e;
  }
};

export const createFundedWallet = async ({
  conn,
  payer,
  sol = 1000,
}: {
  conn: Connection;
  payer: Signer;
  sol?: number;
}): Promise<Keypair> => {
  const keypair = Keypair.generate();
  //airdrops are funky, best to move from provider wallet
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: keypair.publicKey,
      lamports: sol * LAMPORTS_PER_SOL,
    }),
  );
  await buildAndSendTx({ conn, payer, ixs: tx.instructions });
  return keypair;
};

export const makeNTraders = async ({
  conn,
  payer,
  n,
  sol,
}: {
  conn: Connection;
  payer: Keypair;
  n: number;
  sol?: number;
}) => {
  return await Promise.all(
    Array(n)
      .fill(null)
      .map(async () => await createFundedWallet({ conn, payer, sol })),
  );
};

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
