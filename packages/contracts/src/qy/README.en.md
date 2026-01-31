# QY Contracts

This package implements a **ledger-based** flow (no on-chain coins). It stores balances and order states; settlement is performed via Move entry calls.

## Modules

- `ruleset_system`: register rulesets (hash + dispute window + platform fee)
- `ledger_system`: admin credits balances
- `credit_receipt`: credit receipts (idempotent credits)
- `order_system`: order state machine & settlement
- `genesis`: initialize tables
- `events`: domain events

## State Machine

```
Created -> Paid -> Deposited -> Completed -> (Disputed) -> Resolved
Cancelled: only from Created/Paid
```

Status codes:
- 0 Created
- 1 Paid
- 2 Deposited
- 3 Completed
- 4 Disputed
- 5 Resolved
- 6 Cancelled

Dispute codes:
- 0 None
- 1 Open
- 2 Resolved

## Entry Functions

### Ruleset
- `qy::ruleset_system::create_ruleset(dapp_hub, rule_set_id, rule_hash, dispute_window_ms, platform_fee_bps)`

### Ledger
- `qy::ledger_system::credit_balance_with_receipt(dapp_hub, owner, amount, receipt_id, clock)`
  - **Use**: admin credit after QR payment (idempotent with receipt)
  - **receipt_id**: use payment order/transaction id (UTF-8 bytes)
  - **clock**: Sui clock object (`0x6`)
- `qy::ledger_system::credit_balance(dapp_hub, owner, amount)`

### Order Flow
- `qy::order_system::create_order(dapp_hub, order_id, companion, rule_set_id, service_fee, deposit, clock)`
- `qy::order_system::pay_service_fee(dapp_hub, order_id)`
- `qy::order_system::lock_deposit(dapp_hub, order_id)`
- `qy::order_system::mark_completed(dapp_hub, order_id, clock)`
- `qy::order_system::raise_dispute(dapp_hub, order_id, evidence_hash, clock)`
- `qy::order_system::finalize_no_dispute(dapp_hub, order_id, clock)`
- `qy::order_system::resolve_dispute(dapp_hub, order_id, service_refund_bps, deposit_slash_bps, clock)`
- `qy::order_system::cancel_order(dapp_hub, order_id)`

## Frontend Example (Sui SDK)

```ts
import { SuiClient } from "@mysten/sui/client";
import { Transaction, Inputs } from "@mysten/sui/transactions";

const client = new SuiClient({ url: process.env.SUI_RPC_URL! });
const packageId = process.env.SUI_PACKAGE_ID!;

const dappHub = Inputs.SharedObjectRef({
  objectId: process.env.SUI_DAPP_HUB_ID!,
  initialSharedVersion: BigInt(process.env.SUI_DAPP_HUB_INITIAL_SHARED_VERSION!),
  mutable: true,
});

// If you don't know shared version:
// client.getObject({ id, options: { showOwner: true } })

const tx = new Transaction();
tx.moveCall({
  target: `${packageId}::order_system::create_order`,
  arguments: [
    tx.object(dappHub),
    tx.pure.u64("10001"),
    tx.pure.address("0xCOMPANION"),
    tx.pure.u64("1"),
    tx.pure.u64("880"),
    tx.pure.u64("200"),
    // Clock object id is 0x6 on Sui
    tx.object("0x6"),
  ],
});

// await client.signAndExecuteTransaction({ transaction: tx, signer });
```

## Events

- `qy::events::OrderCreated`
- `qy::events::OrderPaid`
- `qy::events::DepositLocked`
- `qy::events::OrderCompleted`
- `qy::events::OrderDisputed`
- `qy::events::OrderResolved`
- `qy::events::OrderFinalized`
- `qy::events::BalanceCredited`
- `qy::events::CreditReceiptRecorded`

## Notes

- This is a **ledger** model (no on-chain coins). All QR payments are confirmed off-chain and then credited on-chain by admin.
- Disputes must be raised within `dispute_window_ms`.
- For production, prefer `credit_balance_with_receipt` to avoid duplicate credits.
