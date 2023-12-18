import {
  anyV2,
  createOrUpdateV1,
  findRuleSetPda,
  notV2,
  passV2,
  programOwnedListV2,
  RuleSetRevisionV2,
} from '@metaplex-foundation/mpl-token-auth-rules';
import type { Umi } from '@metaplex-foundation/umi';
import { PublicKey } from '@solana/web3.js';

export const createDefaultRuleSet = async ({
  umi,
  name = 'a',
  data,
  blocked,
  enableDelegate,
}: {
  umi: Umi;
  name?: string;
  data?: Uint8Array;
  blocked?: PublicKey[];
  enableDelegate?: boolean;
}) => {
  const [ruleSetPda] = findRuleSetPda(umi, {
    owner: umi.identity.publicKey,
    name,
  });
  const denyList = (fields: string[]) =>
    notV2(anyV2(fields.map((f) => programOwnedListV2(f, blocked ?? []))));

  //ruleset relevant for transfers
  const ruleSet: RuleSetRevisionV2 = {
    libVersion: 2,
    name,
    owner: umi.identity.publicKey,
    operations: {
      'Transfer:Owner': denyList(['Source', 'Destination', 'Authority']),
      ...(enableDelegate
        ? {
            'Delegate:Transfer': denyList(['Delegate']),
            'Transfer:SaleDelegate': denyList([
              'Source',
              'Destination',
              'Authority',
            ]),
            'Transfer:TransferDelegate': denyList([
              'Source',
              'Destination',
              'Authority',
            ]),
          }
        : undefined),
      ...Object.fromEntries(
        [
          'Transfer:WalletToWallet',
          'Transfer:MigrationDelegate',
          'Delegate:LockedTransfer',
          'Delegate:Update',
          'Delegate:Utility',
          'Delegate:Staking',
          'Delegate:Authority',
          'Delegate:Collection',
          'Delegate:Use',
          'Delegate:Sale',
        ].map((t) => [t, passV2()]),
      ),
    },
  };

  let createIx = createOrUpdateV1(umi, {
    payer: umi.identity,
    ruleSetPda,
    ruleSetRevision: {
      __option: 'Some',
      value: ruleSet,
    },
  });

  await createIx.sendAndConfirm(umi);

  return ruleSetPda;
};
