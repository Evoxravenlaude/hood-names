#!/usr/bin/env bash
# Publishes the function and event signatures of the contracts to the public
# signature databases (cast's default service and 4byte.directory). Wallets look the
# first four bytes of a transaction up there to show a function name such as
# "registerWithPayment" instead of raw data. Safe to run again.
set -uo pipefail
for NAME in HoodRegistrarController HoodPublicResolver HoodGiftCard HoodResolverPolicy \
            ReverseRegistrar ENSRegistry HoodBaseRegistrar NameWrapper HoodReferralHub TestUSD; do
  FILE="out/$NAME.sol/$NAME.json"
  [ -f "$FILE" ] || continue
  cast upload-signature "$FILE" > /dev/null 2>&1 && echo "signature database: $NAME" || echo "::warning::signature upload failed for $NAME"
  jq -c '{contract_abi: (.abi | tostring)}' "$FILE" \
    | curl -sS -m 30 -o /dev/null -w "4byte: $NAME %{http_code}\n" -H 'Content-Type: application/json' \
        -X POST https://www.4byte.directory/api/v1/import-abi/ --data @- \
    || echo "::warning::4byte upload failed for $NAME"
done
