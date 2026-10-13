import { useCallback, useState } from 'react';
import type { Abi, Address, Hex } from 'viem';
import { useConfig } from 'wagmi';
import { getAccount, switchChain, waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { useQueryClient } from '@tanstack/react-query';
import { chain } from '../config';
import { explain } from './errors';
import { describe } from './describe';
import { useReview } from '../components/Review';

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

export interface Step {
  label: string;
  args: () => Promise<WriteArgs> | WriteArgs;
}

export interface RunOptions {
  /** Called once the person has approved the review, before anything is sent. */
  onReviewed?: () => void;
  /** Called as soon as each transaction is broadcast, before it is mined. */
  onSent?: (index: number, hash: Hex) => void;
  /** Called after every step is mined, before the action counts as finished. */
  onSuccess?: () => void;
}

/**
 * Sends one or more transactions in order: works out every call, shows them
 * in plain language for review, then sends each from the reviewed account on
 * this site's chain and waits for it to be mined.
 */
export function useTx() {
  const config = useConfig();
  const queryClient = useQueryClient();
  const review = useReview();
  const [state, setState] = useState<TxState>({ busy: false });

  const run = useCallback(
    async (steps: Step[], options: RunOptions = {}) => {
      setState({ busy: true, step: 'Preparing' });
      try {
        const reviewer = getAccount(config).address;
        if (!reviewer) throw new Error('Connect a wallet first.');
        const calls: WriteArgs[] = [];
        for (const s of steps) calls.push(await s.args());
        const ok = await review(calls.map((c) => describe(c, reviewer)));
        if (!ok) {
          setState({ busy: false });
          return false;
        }
        options.onReviewed?.();

        let hash: Hex | undefined;
        for (let i = 0; i < steps.length; i++) {
          // Checked again before every transaction: the wallet may have
          // switched network or account while the review was open.
          let now = getAccount(config);
          if (now.chainId !== chain.id) {
            await switchChain(config, { chainId: chain.id });
            now = getAccount(config);
          }
          if (now.chainId !== chain.id) throw new Error(`Switch your wallet to ${chain.name} and try again.`);
          if (!now.address || now.address.toLowerCase() !== reviewer.toLowerCase())
            throw new Error('Your wallet switched to a different account. Review the steps again.');

          const label = steps.length > 1 ? `Step ${i + 1} of ${steps.length}: ${steps[i].label}` : steps[i].label;
          setState({ busy: true, step: label });
          hash = await writeContract(config, {
            ...(calls[i] as object),
            account: reviewer,
            chainId: chain.id,
          } as unknown as Parameters<typeof writeContract>[1]);
          options.onSent?.(i, hash);
          setState({ busy: true, step: label, hash });
          const receipt = await waitForTransactionReceipt(config, { hash, chainId: chain.id });
          if (receipt.status !== 'success') throw new Error('The transaction failed on-chain.');
        }
        options.onSuccess?.();
        setState({ busy: false, done: true, hash });
        void queryClient.invalidateQueries();
        return true;
      } catch (e) {
        setState({ busy: false, error: explain(e) });
        void queryClient.invalidateQueries();
        return false;
      }
    },
    [config, queryClient, review],
  );

  const reset = useCallback(() => setState({ busy: false }), []);
  return { state, run, reset };
}
