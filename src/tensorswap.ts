import { Connection, Keypair } from '@solana/web3.js';
import {
  TensorSwapSDK,
  TensorWhitelistSDK,
  TSWAP_TAKER_FEE_BPS,
} from '@tensor-hq/tensorswap-ts';
import { expect } from 'chai';
import { buildAndSendTx } from './txs';
export { TensorSwapSDK, TensorWhitelistSDK } from '@tensor-hq/tensorswap-ts';

export const testInitWLAuthority = async ({
  conn,
  cosigner,
  owner,
  wlSdk,
}: {
  conn: Connection;
  cosigner: Keypair;
  owner: Keypair;
  wlSdk: TensorWhitelistSDK;
}) => {
  const {
    tx: { ixs },
    authPda,
  } = await wlSdk.initUpdateAuthority({
    cosigner: cosigner.publicKey,
    owner: owner.publicKey,
    newCosigner: cosigner.publicKey,
    newOwner: owner.publicKey,
  });

  await buildAndSendTx({
    conn,
    payer: owner,
    ixs,
    extraSigners: [cosigner],
  });

  let authAcc = await wlSdk.fetchAuthority(authPda);
  expect(authAcc.cosigner.toBase58()).to.eq(cosigner.publicKey.toBase58());
  expect(authAcc.owner.toBase58()).to.eq(owner.publicKey.toBase58());

  return { authPda, owner };
};

export const testInitTSwap = async ({
  wlSdk,
  swapSdk,
  conn,
  cosigner,
  owner,
}: {
  wlSdk: TensorWhitelistSDK;
  swapSdk: TensorSwapSDK;
  conn: Connection;
  cosigner: Keypair;
  owner: Keypair;
}) => {
  // WL authority
  await testInitWLAuthority({ wlSdk, conn, cosigner, owner });

  // Tswap
  const {
    tx: { ixs },
    tswapPda,
  } = await swapSdk.initUpdateTSwap({
    owner: owner.publicKey,
    newOwner: owner.publicKey,
    config: {
      feeBps: TSWAP_TAKER_FEE_BPS,
    },
    cosigner: cosigner.publicKey,
  });

  await buildAndSendTx({
    conn,
    payer: owner,
    ixs,
    extraSigners: [cosigner],
  });

  const swapAcc = await swapSdk.fetchTSwap(tswapPda);
  expect(swapAcc.version).eq(1);
  expect(swapAcc.owner.toBase58()).eq(owner.publicKey.toBase58());
  expect(swapAcc.cosigner.toBase58()).eq(cosigner.publicKey.toBase58());
  expect(swapAcc.feeVault.toBase58()).eq(tswapPda.toBase58());
  expect(swapAcc.config.feeBps).eq(TSWAP_TAKER_FEE_BPS);

  return { tswapPda };
};
