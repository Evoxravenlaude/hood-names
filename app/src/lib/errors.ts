import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem';

const FRIENDLY: Record<string, string> = {
  NameNotAvailable: 'That name is not available.',
  NameReserved: 'That name is reserved.',
  NameTooSimilar: 'That name looks too much like a name that is already registered.',
  InvalidLabel: 'That name is not allowed.',
  CommitmentTooNew: 'Still waiting: the first step needs about a minute to settle.',
  CommitmentTooOld: 'The reservation expired. Start again.',
  CommitmentNotFound: 'The reservation was not found. Start again.',
  UnexpiredCommitmentExists: 'This reservation already exists. Wait a moment and continue.',
  InsufficientValue: 'Not enough ETH was sent. The price may have moved; try again.',
  MaxTokenAmountExceeded: 'The price went up since you started. Try again.',
  Paused: 'Registration is paused right now.',
  DurationTooShort: 'The registration is too short.',
  DurationTooLong: 'That would run more than 10 years ahead.',
  RenewalTooLongWhilePaused: 'While sales are paused, a renewal can extend a name by up to a year.',
  InvalidOwner: 'That address cannot own a name.',
  ReverseRecordNotForOwner: 'A primary name can only be set when you register for yourself.',
  Sanctioned: 'This address cannot register names.',
  TokenNotAccepted: 'That token is not accepted.',
  ShortTransfer: 'The token delivered less than the price.',
  NothingToWithdraw: 'Nothing to withdraw.',
  NotNameOwner: 'Only the owner of the name can do this.',
  MintTooLarge: 'You can mint up to 1,000 test dollars at a time.',
  NoLiveRate: 'Gift cards cannot be bought with ETH right now. Pay with the stablecoin.',
};

/** A short sentence for a failed call or transaction. */
export function explain(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return 'You cancelled it in your wallet.';
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && FRIENDLY[name]) return FRIENDLY[name];
      if (name) return `The contract refused: ${name}.`;
      if (revert.reason) return revert.reason;
    }
    if (/insufficient funds/i.test(error.message)) return 'Not enough ETH in your wallet to cover this and the network fee.';
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}
