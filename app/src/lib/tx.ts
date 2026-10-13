import { useCallback, useState } from 'react';
import type { Abi, Address, Hex } from 'viem';
import { useAccount, useConfig } from 'wagmi';
import { switchChain, waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { useQueryClient } from '@tanstack/react-query';
import { chain } from '../config';
import { explain } from './errors';

/** One contract call. Typed loosely so steps with different ABIs can share a list. */
export interface WriteArgs {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export interface TxState {
  busy: boolean;
  step?: string;
  hash?: Hex;
  error?: string;
  done?: boolean;
}

/**
 * Sends one or more transactions in order, waiting for each to be mined,
 * and refreshes every on-chain read afterwards.
 */
export function useTx() {
  const config = useConfig();
  const { chainId } = useAccount();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>({ busy: false });

  const run = useCallback(
    async (steps: { label: string; args: () => Promise<WriteArgs> | WriteArgs }[]) => {
      setState({ busy: true });
      try {
        if (chainId !== chain.id) await switchChain(config, { chainId: chain.id });
        let hash: Hex | undefined;
        for (const s of steps) {
          setState({ busy: true, step: s.label });
          const args = await s.args();
          hash = await writeContract(config, args as unknown as Parameters<typeof writeContract>[1]);
          setState({ busy: true, step: s.label, hash });
          const receipt = await waitForTransactionReceipt(config, { hash });
          if (receipt.status !== 'success') throw new Error('The transaction failed on-chain.');
        }
        setState({ busy: false, done: true, hash });
        await queryClient.invalidateQueries();
        return true;
      } catch (e) {
        setState({ busy: false, error: explain(e) });
        await queryClient.invalidateQueries();
        return false;
      }
    },
    [config, chainId, queryClient],
  );

  const reset = useCallback(() => setState({ busy: false }), []);
  return { state, run, reset };
}
