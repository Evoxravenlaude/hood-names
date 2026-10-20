import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem';
import { mark, t } from '../i18n';

const FRIENDLY: Record<string, string> = {
  NameNotAvailable: mark('That name is not available.'),
  NameReserved: mark('That name is reserved.'),
  NameTooSimilar: mark('That name looks too much like a name that is already registered.'),
  InvalidLabel: mark('That name is not allowed.'),
  CommitmentTooNew: mark('Still waiting: the first step needs about a minute to settle.'),
  CommitmentTooOld: mark('The reservation expired. Start again.'),
  CommitmentNotFound: mark('The reservation was not found. Start again.'),
  UnexpiredCommitmentExists: mark('This reservation already exists. Wait a moment and continue.'),
  InsufficientValue: mark('Not enough ETH was sent. The price may have moved; try again.'),
  MaxTokenAmountExceeded: mark('The price went up since you started. Try again.'),
  Paused: mark('Registration is paused right now.'),
  DurationTooShort: mark('The registration is too short.'),
  DurationTooLong: mark('That would run more than 10 years ahead.'),
  RenewalTooLongWhilePaused: mark('While sales are paused, a renewal can extend a name by up to a year.'),
  InvalidOwner: mark('That address cannot own a name.'),
  ReverseRecordNotForOwner: mark('A primary name can only be set when you register for yourself.'),
  Sanctioned: mark('This address cannot register names.'),
  TokenNotAccepted: mark('That token is not accepted.'),
  ShortTransfer: mark('The token delivered less than the price.'),
  NothingToWithdraw: mark('Nothing to withdraw.'),
  NotNameOwner: mark('Only the owner of the name can do this.'),
  MintTooLarge: mark('You can mint up to 1,000 test dollars at a time.'),
  NoLiveRate: mark('Gift cards cannot be bought with ETH right now. Pay with the stablecoin.'),
};

/** A short sentence for a failed call or transaction. */
export function explain(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return t('You cancelled it in your wallet.');
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && FRIENDLY[name]) return t(FRIENDLY[name]);
      if (name) return t('The contract refused: {reason}.', { reason: name });
      if (revert.reason) return revert.reason;
    }
    if (/insufficient funds/i.test(error.message)) return t('Not enough ETH in your wallet to cover this and the network fee.');
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : t('Something went wrong.');
}
