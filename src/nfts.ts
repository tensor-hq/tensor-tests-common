import { BN } from '@coral-xyz/anchor';
import {
  computeCompressedNFTHash,
  computeCreatorHash,
  computeDataHash,
  createCreateTreeInstruction,
  createMintToCollectionV1Instruction,
  createMintV1Instruction,
  createVerifyCreatorInstruction,
  Creator,
  getLeafAssetId,
  MetadataArgs,
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  TokenProgramVersion,
  TokenStandard as BubblegumTokenStandard,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  createCreateMasterEditionV3Instruction,
  createCreateMetadataAccountV3Instruction,
  createSetCollectionSizeInstruction,
  TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  ConcurrentMerkleTreeAccount,
  createVerifyLeafIx,
  getConcurrentMerkleTreeAccountSize,
  MerkleTree,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  ValidDepthSizePair,
} from '@solana/spl-account-compression';
import {
  createAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
} from '@solana/spl-token';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import {
  findBubblegumSignerPda,
  findBubblegumTreeAuthorityPda,
  findMasterEditionPda,
  findMetadataPda,
  isNullLike,
  prependComputeIxs,
  TMETA_PROGRAM_ID,
} from '@tensor-hq/tensor-common';
import { expect } from 'chai';
import { createNft, makeMintTwoAta } from './ata';
import { buildAndSendTx, makeNTraders } from './txs';

export const DEFAULT_DEPTH_SIZE: ValidDepthSizePair = {
  maxDepth: 14,
  maxBufferSize: 64,
};

export const initCollection = async ({
  conn,
  owner,
  sellerFeeBasisPoints,
}: {
  conn: Connection;
  owner: Keypair;
  sellerFeeBasisPoints: number;
}) => {
  const collectionMint = await createMint(
    conn,
    owner,
    owner.publicKey,
    owner.publicKey,
    0,
  );
  const collectionTokenAccount = await createAccount(
    conn,
    owner,
    collectionMint,
    owner.publicKey,
  );
  await mintTo(conn, owner, collectionMint, collectionTokenAccount, owner, 1);
  const [collectionMetadataAccount, _b] = await PublicKey.findProgramAddress(
    [
      Buffer.from('metadata', 'utf8'),
      TMETA_PROGRAM_ID.toBuffer(),
      collectionMint.toBuffer(),
    ],
    TMETA_PROGRAM_ID,
  );
  const collectionMeatadataIX = createCreateMetadataAccountV3Instruction(
    {
      metadata: collectionMetadataAccount,
      mint: collectionMint,
      mintAuthority: owner.publicKey,
      payer: owner.publicKey,
      updateAuthority: owner.publicKey,
    },
    {
      createMetadataAccountArgsV3: {
        data: {
          name: "Nick's collection",
          symbol: 'NICK',
          uri: 'nicksfancyuri',
          sellerFeeBasisPoints,
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: false,
        collectionDetails: null,
      },
    },
  );
  const [collectionMasterEditionAccount, _b2] =
    PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata', 'utf8'),
        TMETA_PROGRAM_ID.toBuffer(),
        collectionMint.toBuffer(),
        Buffer.from('edition', 'utf8'),
      ],
      TMETA_PROGRAM_ID,
    );
  const collectionMasterEditionIX = createCreateMasterEditionV3Instruction(
    {
      edition: collectionMasterEditionAccount,
      mint: collectionMint,
      mintAuthority: owner.publicKey,
      payer: owner.publicKey,
      updateAuthority: owner.publicKey,
      metadata: collectionMetadataAccount,
    },
    {
      createMasterEditionArgs: {
        maxSupply: 0,
      },
    },
  );

  const sizeCollectionIX = createSetCollectionSizeInstruction(
    {
      collectionMetadata: collectionMetadataAccount,
      collectionAuthority: owner.publicKey,
      collectionMint: collectionMint,
    },
    {
      setCollectionSizeArgs: { size: 50 },
    },
  );

  await buildAndSendTx({
    conn,
    payer: owner,
    ixs: [collectionMeatadataIX, collectionMasterEditionIX, sizeCollectionIX],
  });

  return {
    collectionMint,
    collectionMetadataAccount,
    collectionMasterEditionAccount,
  };
};

export const makeTree = async ({
  conn,
  treeOwner,
  depthSizePair = DEFAULT_DEPTH_SIZE,
  canopyDepth = 0,
}: {
  conn: Connection;
  treeOwner: Keypair;
  depthSizePair?: ValidDepthSizePair;
  canopyDepth?: number;
}) => {
  const owner = treeOwner.publicKey;

  const merkleTreeKeypair = Keypair.generate();
  const merkleTree = merkleTreeKeypair.publicKey;
  const space = getConcurrentMerkleTreeAccountSize(
    depthSizePair.maxDepth,
    depthSizePair.maxBufferSize,
    canopyDepth,
  );
  const allocTreeIx = SystemProgram.createAccount({
    fromPubkey: owner,
    newAccountPubkey: merkleTree,
    lamports: await conn.getMinimumBalanceForRentExemption(space),
    space: space,
    programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  });
  const [treeAuthority, _bump] = findBubblegumTreeAuthorityPda(merkleTree);
  const createTreeIx = createCreateTreeInstruction(
    {
      merkleTree,
      treeAuthority,
      treeCreator: owner,
      payer: owner,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    },
    {
      maxBufferSize: depthSizePair.maxBufferSize,
      maxDepth: depthSizePair.maxDepth,
      public: false,
    },
    BUBBLEGUM_PROGRAM_ID,
  );

  await buildAndSendTx({
    conn,
    payer: treeOwner,
    ixs: [allocTreeIx, createTreeIx],
    extraSigners: [merkleTreeKeypair],
  });

  return {
    merkleTree,
  };
};

const makeRandomStr = (length: number) => {
  let result = '';
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
};

export const makeCNftMeta = ({
  nrCreators = 4,
  sellerFeeBasisPoints = 1000,
  collectionMint,
  randomizeName = false,
  unverifiedCollection = false,
  creators,
}: {
  nrCreators?: number;
  sellerFeeBasisPoints?: number;
  collectionMint?: PublicKey;
  randomizeName?: boolean;
  unverifiedCollection?: boolean;
  creators: Creator[];
}): MetadataArgs => {
  if (nrCreators < 0 || nrCreators > 4) {
    throw new Error(
      'must be between 0 and 4 creators (yes 4 for compressed nfts)',
    );
  }

  return {
    name: randomizeName ? makeRandomStr(32) : 'Compressed NFT',
    symbol: 'COMP',
    uri: 'https://v6nul6vaqrzhjm7qkcpbtbqcxmhwuzvcw2coxx2wali6sbxu634a.arweave.net/r5tF-qCEcnSz8FCeGYYCuw9qZqK2hOvfVgLR6Qb09vg',
    creators,
    editionNonce: 0,
    tokenProgramVersion: TokenProgramVersion.Original,
    tokenStandard: BubblegumTokenStandard.NonFungible,
    uses: null,
    // Will be set to true during mint by bubblegum
    collection: collectionMint
      ? { key: collectionMint, verified: !unverifiedCollection }
      : null,
    primarySaleHappened: true,
    sellerFeeBasisPoints,
    isMutable: false,
  };
};

export const mintCNft = async ({
  conn,
  treeOwner,
  receiver,
  metadata,
  merkleTree,
  unverifiedCollection = false,
}: {
  conn: Connection;
  treeOwner: Keypair;
  receiver: PublicKey;
  metadata: MetadataArgs;
  merkleTree: PublicKey;
  unverifiedCollection?: boolean;
}) => {
  const owner = treeOwner.publicKey;

  const [treeAuthority] = findBubblegumTreeAuthorityPda(merkleTree);

  const [bgumSigner] = findBubblegumSignerPda();

  const mintIx =
    !!metadata.collection && !unverifiedCollection
      ? createMintToCollectionV1Instruction(
          {
            merkleTree,
            treeAuthority,
            treeDelegate: owner,
            payer: owner,
            leafDelegate: receiver,
            leafOwner: receiver,
            compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
            logWrapper: SPL_NOOP_PROGRAM_ID,
            bubblegumSigner: bgumSigner,
            collectionAuthority: treeOwner.publicKey,
            collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
            collectionMetadata: findMetadataPda(metadata.collection.key)[0],
            collectionMint: metadata.collection.key,
            editionAccount: findMasterEditionPda(metadata.collection.key)[0],
            tokenMetadataProgram: TMETA_PROGRAM_ID,
          },
          {
            metadataArgs: {
              ...metadata,
              //we have to pass it in as FALSE, it'll be set to TRUE during the ix
              collection: { key: metadata.collection.key, verified: false },
            },
          },
        )
      : createMintV1Instruction(
          {
            merkleTree,
            treeAuthority,
            treeDelegate: owner,
            payer: owner,
            leafDelegate: receiver,
            leafOwner: receiver,
            compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
            logWrapper: SPL_NOOP_PROGRAM_ID,
          },
          {
            message: metadata,
          },
        );

  const sig = await buildAndSendTx({
    conn,
    payer: treeOwner,
    ixs: [mintIx],
  });

  console.log('✅ minted', sig);
};

export const makeLeaf = async ({
  index,
  owner,
  delegate,
  merkleTree,
  metadata,
}: {
  index: number;
  owner: PublicKey;
  delegate?: PublicKey;
  merkleTree: PublicKey;
  metadata: MetadataArgs;
}) => {
  const nonce = new BN(index);
  const assetId = await getLeafAssetId(merkleTree, nonce);
  const leaf = computeCompressedNFTHash(
    assetId,
    owner,
    delegate ?? owner,
    nonce,
    metadata,
  );
  return {
    leaf,
    assetId,
  };
};

export const verifyCNft = async ({
  conn,
  payer,
  index,
  owner,
  delegate,
  merkleTree,
  metadata,
  proof,
}: {
  conn: Connection;
  payer: Keypair;
  index: number;
  owner: PublicKey;
  delegate?: PublicKey;
  merkleTree: PublicKey;
  metadata: MetadataArgs;
  proof: Buffer[];
}) => {
  const accountInfo = await conn.getAccountInfo(merkleTree);
  const account = ConcurrentMerkleTreeAccount.fromBuffer(accountInfo!.data!);
  const { leaf, assetId } = await makeLeaf({
    index,
    owner,
    delegate,
    merkleTree,
    metadata,
  });
  const verifyLeafIx = createVerifyLeafIx(merkleTree, {
    root: account.getCurrentRoot(),
    leaf,
    leafIndex: index,
    proof,
  });

  const sig = await buildAndSendTx({
    conn,
    payer,
    ixs: prependComputeIxs([verifyLeafIx], 400_000, undefined),
  });
  console.log('✅ CNFT verified:', sig);

  return { leaf, assetId };
};

export const verifyCNftCreator = async ({
  conn,
  payer,
  index,
  owner,
  delegate,
  merkleTree,
  memTree,
  metadata,
  proof,
  verifiedCreator,
}: {
  conn: Connection;
  payer: Keypair;
  index: number;
  owner: PublicKey;
  delegate?: PublicKey;
  merkleTree: PublicKey;
  metadata: MetadataArgs;
  proof: Buffer[];
  verifiedCreator: Keypair;
  memTree: MerkleTree;
}) => {
  const accountInfo = await conn.getAccountInfo(merkleTree, {
    commitment: 'confirmed',
  });
  const account = ConcurrentMerkleTreeAccount.fromBuffer(accountInfo!.data!);

  const [treeAuthority] = findBubblegumTreeAuthorityPda(merkleTree);
  const verifyCreatorIx = createVerifyCreatorInstruction(
    {
      merkleTree,
      treeAuthority,
      leafOwner: owner,
      leafDelegate: owner,
      payer: payer.publicKey,
      creator: verifiedCreator.publicKey,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      anchorRemainingAccounts: proof.map((p) => ({
        pubkey: new PublicKey(p),
        isWritable: false,
        isSigner: false,
      })),
    },
    {
      root: [...account.getCurrentRoot()],
      creatorHash: [...computeCreatorHash(metadata.creators)],
      dataHash: [...computeDataHash(metadata)],
      index,
      message: metadata,
      nonce: new BN(index),
    },
  );

  const sig = await buildAndSendTx({
    conn,
    payer,
    ixs: [verifyCreatorIx],
    extraSigners: [verifiedCreator],
  });
  console.log('✅ creator verified:', sig);

  metadata.creators.forEach((c) => {
    if (c.address.equals(verifiedCreator.publicKey)) {
      c.verified = true;
    }
  });

  //update mem tree
  const { leaf, assetId } = await makeLeaf({
    index,
    owner,
    delegate,
    merkleTree,
    metadata,
  });
  memTree.updateLeaf(index, leaf);

  return { metadata, leaf, assetId };
};

export type TestCnft = {
  index: number;
  assetId: PublicKey;
  metadata: MetadataArgs;
  leaf: Buffer;
};

export const makeTestNfts = async ({
  conn,
  payer,
  cnftMints = 0,
  cnftMintsToTraderA = 0,
  pnftMints = 0,
  pnftMintsToTraderA = 0,
  nrCreators = 4,
  depthSizePair = DEFAULT_DEPTH_SIZE,
  canopyDepth = 0,
  randomizeName = true,
  verifiedCreator,
  collectionless = false,
  unverifiedCollection = false,
  sellerFeeBasisPoints = 300,
  ruleSetAddr,
}: {
  conn: Connection;
  payer: Keypair;
  cnftMints?: number;
  cnftMintsToTraderA?: number;
  pnftMints?: number;
  pnftMintsToTraderA?: number;
  nrCreators?: number;
  depthSizePair?: ValidDepthSizePair;
  canopyDepth?: number;
  randomizeName?: boolean;
  verifiedCreator?: Keypair;
  collectionless?: boolean;
  unverifiedCollection?: boolean;
  sellerFeeBasisPoints?: number;
  ruleSetAddr?: PublicKey;
}) => {
  const [treeOwner, traderA, traderB] = await makeNTraders({
    conn,
    payer,
    n: 3,
  });

  //setup collection and tree
  const collection = Keypair.generate();
  const { merkleTree } = await makeTree({
    conn,
    treeOwner,
    depthSizePair,
    canopyDepth,
  });

  const creators = verifiedCreator
    ? [
        {
          address: verifiedCreator.publicKey,
          verified: false,
          share: 100,
        },
      ]
    : Array(nrCreators)
        .fill(null)
        .map((_) => ({
          address: Keypair.generate().publicKey,
          verified: false,
          share: 100 / nrCreators,
        }));

  // --------------------------------------- create collection

  await createNft({
    conn,
    payer,
    owner: treeOwner,
    mint: collection,
    tokenStandard: TokenStandard.NonFungible,
    royaltyBps: sellerFeeBasisPoints,
    setCollSize: 50,
  });

  // --------------------------------------- pnfts

  const traderAPromises: ReturnType<typeof makeMintTwoAta>[] = [];
  const traderBPromises: ReturnType<typeof makeMintTwoAta>[] = [];

  for (let index = 0; index < pnftMintsToTraderA; index++) {
    traderAPromises.push(
      makeMintTwoAta({
        conn,
        payer,
        owner: traderA,
        other: traderB,
        royaltyBps: sellerFeeBasisPoints,
        creators,
        collection,
        collectionUA: treeOwner,
        collectionVerified: true,
        createCollection: false,
        programmable: true,
        ruleSetAddr,
      }),
    );
  }

  for (let index = 0; index < pnftMints - pnftMintsToTraderA; index++) {
    traderBPromises.push(
      makeMintTwoAta({
        conn,
        payer,
        owner: traderB,
        other: traderA,
        royaltyBps: sellerFeeBasisPoints,
        creators,
        collection,
        collectionUA: treeOwner,
        collectionVerified: true,
        createCollection: false,
        programmable: true,
        ruleSetAddr,
      }),
    );
  }

  // --------------------------------------- cnfts

  let leaves: TestCnft[] = [];
  const makeCnfts = async () => {
    //has to be sequential to ensure index is correct
    for (let index = 0; index < cnftMints; index++) {
      const metadata = makeCNftMeta({
        collectionMint: collectionless ? undefined : collection.publicKey,
        nrCreators,
        randomizeName,
        unverifiedCollection,
        creators,
        sellerFeeBasisPoints,
      });

      let receiver = traderA.publicKey;
      if (!isNullLike(cnftMintsToTraderA) && index >= cnftMintsToTraderA) {
        receiver = traderB.publicKey;
      }

      await mintCNft({
        conn,
        merkleTree,
        metadata,
        treeOwner,
        receiver,
        unverifiedCollection,
      });

      const { leaf, assetId } = await makeLeaf({
        index,
        merkleTree,
        metadata,
        owner: receiver,
      });
      leaves.push({
        index,
        metadata,
        assetId,
        leaf,
      });
    }
  };

  const [traderAPnfts, traderBPnfts] = await Promise.all([
    Promise.all(traderAPromises),
    Promise.all(traderBPromises),
    makeCnfts(),
  ]);

  // simulate an in-mem tree
  const memTree = MerkleTree.sparseMerkleTreeFromLeaves(
    leaves.map((l) => l.leaf),
    depthSizePair.maxDepth,
  );

  leaves = await Promise.all(
    leaves.map(async (l) => {
      let { index, assetId, leaf, metadata } = l;
      let proof = memTree.getProof(index, false, depthSizePair.maxDepth, false);

      let receiver = traderA.publicKey;
      if (!isNullLike(cnftMintsToTraderA) && index >= cnftMintsToTraderA) {
        receiver = traderB.publicKey;
      }

      if (verifiedCreator) {
        ({ metadata, leaf, assetId } = await verifyCNftCreator({
          conn,
          payer,
          index,
          merkleTree,
          memTree,
          metadata,
          owner: receiver,
          proof: proof.proof.slice(0, proof.proof.length - canopyDepth),
          verifiedCreator,
        }));
        //get new proof after verification
        proof = memTree.getProof(index, false, depthSizePair.maxDepth, false);
      }

      await verifyCNft({
        conn,
        payer,
        index,
        merkleTree,
        metadata,
        owner: receiver,
        proof: proof.proof.slice(0, proof.proof.length - canopyDepth),
      });

      return { index, assetId, leaf, metadata };
    }),
  );

  console.log('✅ setup done');

  return {
    merkleTree,
    memTree,
    leaves,
    treeOwner,
    traderA,
    traderB,
    collectionMint: collection.publicKey,
    traderACnfts: leaves.slice(0, cnftMintsToTraderA),
    traderBCnfts: leaves.slice(cnftMintsToTraderA),
    traderAPnfts,
    traderBPnfts,
    creators,
  };
};

export const calcCreatorFees = (
  amount: number,
  sellerFeeBasisPoints: number,
) => {
  return Math.trunc((amount * sellerFeeBasisPoints) / 1e4);
};

export const expectHasNftAsync = async (
  conn: Connection,
  mint: PublicKey,
  owner: PublicKey,
) => {
  expect(
    (
      await getAccount(conn, getAssociatedTokenAddressSync(mint, owner, true))
    ).amount.toString(),
  ).eq('1');
};
