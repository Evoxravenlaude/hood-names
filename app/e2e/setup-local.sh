#!/usr/bin/env bash
# Starts a local chain and deploys everything to it, the same steps the
# testnet workflow runs. Run from the repository root.
set -euo pipefail
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # anvil's public test key
RPC=http://127.0.0.1:8545
pkill anvil 2>/dev/null || true
anvil --block-time 1 > /tmp/anvil.log 2>&1 &
sleep 2
rm -f deployments/31337.json
ENABLE_REFERRALS=true ENABLE_GIFT_CARDS=true TEST_STABLECOIN=true \
  forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --slow
forge script script/ReserveNames.s.sol --rpc-url $RPC --broadcast --slow
forge script script/OpenRegistration.s.sol --rpc-url $RPC --broadcast
forge script script/SetUpGiftCards.s.sol --rpc-url $RPC --broadcast
echo "Local chain ready. Now: cd app && VITE_CHAIN_ID=31337 npm run dev"
