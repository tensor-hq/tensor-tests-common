import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TensorWhitelistSDK } from '@tensor-oss/tensorswap-sdk';
import { keccak256 } from 'js-sha3';
import { MerkleTree } from 'merkletreejs';
import { buildAndSendTx } from './txs';

export const generateTreeOfSize = (size: number, targetMints: PublicKey[]) => {
  const leaves = targetMints.map((m) => m.toBuffer());

  for (let i = 0; i < size; i++) {
    let u = Keypair.generate();
    leaves.push(u.publicKey.toBuffer());
  }

  const tree = new MerkleTree(leaves, keccak256, {
    sortPairs: true,
    hashLeaves: true,
  });

  const proofs: { mint: PublicKey; proof: Buffer[] }[] = targetMints.map(
    (targetMint) => {
      const leaf = keccak256(targetMint.toBuffer());
      const proof = tree.getProof(leaf);
      const validProof: Buffer[] = proof.map((p) => p.data);
      return { mint: targetMint, proof: validProof };
    },
  );

  return { tree, root: tree.getRoot().toJSON().data, proofs };
};

export const makeProofWhitelist = async ({
  wlSdk,
  conn,
  cosigner,
  mints,
  treeSize = 100,
}: {
  wlSdk: TensorWhitelistSDK;
  conn: Connection;
  cosigner: Keypair;
  mints: PublicKey[];
  treeSize?: number;
}) => {
  const { root, proofs } = generateTreeOfSize(treeSize, mints);
  const uuid = wlSdk.genWhitelistUUID();
  const name = 'hello_world';
  const {
    tx: { ixs },
    whitelistPda,
  } = await wlSdk.initUpdateWhitelist({
    cosigner: cosigner.publicKey,
    uuid: TensorWhitelistSDK.uuidToBuffer(uuid),
    rootHash: root,
    name: TensorWhitelistSDK.nameToBuffer(name),
  });
  await buildAndSendTx({ conn, payer: cosigner, ixs });

  return { proofs, whitelist: whitelistPda };
};

export const makeFvcWhitelist = async ({
  wlSdk,
  conn,
  cosigner,
  fvc,
}: {
  wlSdk: TensorWhitelistSDK;
  conn: Connection;
  cosigner: Keypair;
  fvc: PublicKey;
}) => {
  const uuid = wlSdk.genWhitelistUUID();
  const name = 'hello_world';
  const {
    tx: { ixs },
    whitelistPda,
  } = await wlSdk.initUpdateWhitelist({
    cosigner: cosigner.publicKey,
    uuid: TensorWhitelistSDK.uuidToBuffer(uuid),
    name: TensorWhitelistSDK.nameToBuffer(name),
    fvc,
  });
  await buildAndSendTx({ conn, payer: cosigner, ixs });

  return { fvc, whitelist: whitelistPda };
};

export const makeVocWhitelist = async ({
  wlSdk,
  conn,
  cosigner,
  voc,
}: {
  wlSdk: TensorWhitelistSDK;
  conn: Connection;
  cosigner: Keypair;
  voc: PublicKey;
}) => {
  const uuid = wlSdk.genWhitelistUUID();
  const name = 'hello_world';
  const {
    tx: { ixs },
    whitelistPda,
  } = await wlSdk.initUpdateWhitelist({
    cosigner: cosigner.publicKey,
    uuid: TensorWhitelistSDK.uuidToBuffer(uuid),
    name: TensorWhitelistSDK.nameToBuffer(name),
    voc,
  });
  await buildAndSendTx({ conn, payer: cosigner, ixs });

  return { voc, whitelist: whitelistPda };
};

export const makeEverythingWhitelist = async ({
  wlSdk,
  conn,
  cosigner,
  mints,
  treeSize = 100,
  voc,
  fvc,
}: {
  wlSdk: TensorWhitelistSDK;
  conn: Connection;
  cosigner: Keypair;
  mints: PublicKey[];
  treeSize?: number;
  voc?: PublicKey;
  fvc?: PublicKey;
}) => {
  const { root, proofs } = generateTreeOfSize(treeSize, mints);
  const uuid = wlSdk.genWhitelistUUID();
  const name = 'hello_world';
  const {
    tx: { ixs },
    whitelistPda,
  } = await wlSdk.initUpdateWhitelist({
    cosigner: cosigner.publicKey,
    uuid: TensorWhitelistSDK.uuidToBuffer(uuid),
    rootHash: root,
    name: TensorWhitelistSDK.nameToBuffer(name),
    voc,
    fvc,
  });
  await buildAndSendTx({ conn, payer: cosigner, ixs });

  return { proofs, whitelist: whitelistPda, voc, fvc };
};
