import { mark } from '.';

/** Messages the site's own server functions send, so they can be shown translated. */
export const SERVER_MESSAGES = [
  mark('Use GET or POST.'),
  mark('This site has no faucet set up.'),
  mark('That is not a wallet address.'),
  mark('This wallet already has enough test ETH to get going.'),
  mark('The faucet is pointed at the wrong network.'),
  mark('The faucet could not reach the network. Try again shortly.'),
  mark('Already sent recently. Try again in a few hours, or use another faucet.'),
  mark('The faucet is busy. Try again shortly.'),
  mark('The faucet has run dry. Use one of the other faucets for now.'),
  mark('The faucet could not send right now. Try again shortly.'),
];
