#!/usr/bin/env bash
# Publishes the source of every deployed contract on the chain's Blockscout
# explorer, so the explorer (and wallets that read it) can show function
# names and decoded arguments instead of raw data. Safe to run again.
#
#   tools/verify-contracts.sh <chainId> <rpcUrl> <explorerApiUrl>
set -uo pipefail
CHAIN=$1 RPC=$2 API=$3
FILE="deployments/$CHAIN.json"
declare -A SOURCE=(
  [ENSRegistry]=contracts/registry/ENSRegistry.sol:ENSRegistry
  [BaseRegistrar]=contracts/hood/HoodBaseRegistrar.sol:HoodBaseRegistrar
  [ReverseRegistrar]=contracts/reverseRegistrar/ReverseRegistrar.sol:ReverseRegistrar
  [PublicResolver]=contracts/hood/HoodPublicResolver.sol:HoodPublicResolver
  [NameWrapper]=contracts/wrapper/NameWrapper.sol:NameWrapper
  [StaticMetadataService]=contracts/wrapper/StaticMetadataService.sol:StaticMetadataService
  [UniversalResolver]=contracts/hood/HoodUniversalResolver.sol:HoodUniversalResolver
  [GatewayProvider]=contracts/ccipRead/GatewayProvider.sol:GatewayProvider
  [HoodPriceOracle]=contracts/hood/HoodPriceOracle.sol:HoodPriceOracle
  [HoodResolverPolicy]=contracts/hood/HoodResolverPolicy.sol:HoodResolverPolicy
  [HoodNameLens]=contracts/hood/HoodNameLens.sol:HoodNameLens
  [HoodNameGuard]=contracts/hood/HoodNameGuard.sol:HoodNameGuard
  [HoodNameRules]=contracts/hood/HoodNameRules.sol:HoodNameRules
  [HoodPointsLedger]=contracts/hood/HoodPointsLedger.sol:HoodPointsLedger
  [HoodGiftCard]=contracts/hood/HoodGiftCard.sol:HoodGiftCard
  [HoodReferralHub]=contracts/hood/HoodReferralHub.sol:HoodReferralHub
  [HoodRegistrarController]=contracts/hood/HoodRegistrarController.sol:HoodRegistrarController
  [SignedDiscountValidator]=contracts/hood/DiscountValidators.sol:SignedDiscountValidator
  [Stablecoin]=contracts/testnet/TestUSD.sol:TestUSD
)
ok=0 failed=0
for KEY in "${!SOURCE[@]}"; do
  ADDR=$(jq -r ".${KEY} // empty" "$FILE")
  if [ -z "$ADDR" ] || [ "$ADDR" = "0x0000000000000000000000000000000000000000" ]; then continue; fi
  echo "::group::$KEY $ADDR"
  if forge verify-contract "$ADDR" "${SOURCE[$KEY]}" \
      --chain-id "$CHAIN" --rpc-url "$RPC" \
      --verifier blockscout --verifier-url "$API" \
      --guess-constructor-args --watch; then
    ok=$((ok + 1))
  else
    failed=$((failed + 1))
    echo "::warning::Could not verify $KEY at $ADDR"
  fi
  echo "::endgroup::"
done
echo "Verified: $ok, not verified: $failed"
