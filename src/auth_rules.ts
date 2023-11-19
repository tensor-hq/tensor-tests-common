import {
  createCreateOrUpdateInstruction,
  findRuleSetPDA,
} from '@metaplex-foundation/mpl-token-auth-rules';
import { encode } from '@msgpack/msgpack';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { AUTH_PROG_ID } from '@tensor-hq/tensor-common';
import { buildAndSendTx } from './txs';

export const createTokenAuthorizationRules = async ({
  conn,
  payer,
  name = 'a',
  data,
  whitelistedPrograms,
}: {
  conn: Connection;
  payer: Keypair;
  name?: string;
  data?: Uint8Array;
  whitelistedPrograms: PublicKey[];
}) => {
  const [ruleSetAddress] = await findRuleSetPDA(payer.publicKey, name);

  const programs = whitelistedPrograms.map((p) => Array.from(p.toBytes()));

  //ruleset relevant for transfers
  const ruleSet = {
    libVersion: 1,
    ruleSetName: name,
    owner: Array.from(payer.publicKey.toBytes()),
    operations: {
      'Transfer:Owner': {
        All: {
          rules: [
            //no space
            // {
            //   Amount: {
            //     amount: 1,
            //     operator: "Eq",
            //     field: "Amount",
            //   },
            // },
            {
              Any: {
                rules: [
                  {
                    ProgramOwnedList: {
                      programs,
                      field: 'Source',
                    },
                  },
                  {
                    ProgramOwnedList: {
                      programs,
                      field: 'Destination',
                    },
                  },
                  {
                    ProgramOwnedList: {
                      programs,
                      field: 'Authority',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      // DISABLE THESE IF YOU WANT A PNFT W/O A DELEGATE RULE
      // "Delegate:Transfer": {
      //   ProgramOwnedList: {
      //     programs: [Array.from(whitelistedProgram.toBytes())],
      //     field: "Delegate",
      //   },
      // },
      // "Transfer:TransferDelegate": {
      //   All: {
      //     rules: [
      //       //no space
      //       // {
      //       //   Amount: {
      //       //     amount: 1,
      //       //     operator: "Eq",
      //       //     field: "Amount",
      //       //   },
      //       // },
      //       {
      //         Any: {
      //           rules: [
      //             {
      //               ProgramOwnedList: {
      //                 programs: [Array.from(whitelistedProgram.toBytes())],
      //                 field: "Source",
      //               },
      //             },
      //             {
      //               ProgramOwnedList: {
      //                 programs: [Array.from(whitelistedProgram.toBytes())],
      //                 field: "Destination",
      //               },
      //             },
      //             {
      //               ProgramOwnedList: {
      //                 programs: [Array.from(whitelistedProgram.toBytes())],
      //                 field: "Authority",
      //               },
      //             },
      //           ],
      //         },
      //       },
      //     ],
      //   },
      // },
    },
  };

  // Encode the file using msgpack so the pre-encoded data can be written directly to a Solana program account
  let finalData = data ?? encode(ruleSet);

  let createIX = createCreateOrUpdateInstruction(
    {
      payer: payer.publicKey,
      ruleSetPda: ruleSetAddress,
      systemProgram: SystemProgram.programId,
    },
    {
      createOrUpdateArgs: { __kind: 'V1', serializedRuleSet: finalData },
    },
    AUTH_PROG_ID,
  );

  await buildAndSendTx({ conn, payer, ixs: [createIX] });

  return ruleSetAddress;
};
