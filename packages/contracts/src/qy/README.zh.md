# 情谊电竞合约（qy）

本合约为“链上记账型”设计：**不收币**，只维护余额数字与订单状态。前端通过 Sui SDK 调用 Move entry 完成下单、押金、争议与清算。

## 合约模块

- `ruleset_system`：规则集注册（hash + 争议窗口 + 平台费率）
- `ledger_system`：余额记账（管理员充值）
- `credit_receipt`：充值回执表（幂等记账）
- `order_system`：订单状态机与清算
- `genesis`：初始化表
- `events`：订单/结算事件

## 部署/初始化

- 发布合约后先执行 `qy::genesis::run`（参数：`DappHub` 共享对象 + `Clock`）。
- 再创建规则集：`qy::ruleset_system::create_ruleset`。
- 推荐脚本（仓库根目录执行）：
  - `pnpm chain:init-dapp`
  - `pnpm chain:init-ruleset`

## 状态机

```
Created -> Paid -> Deposited -> Completed -> (Disputed) -> Resolved
Cancelled: 仅允许 Created/Paid
```

状态码：
- 0 Created
- 1 Paid
- 2 Deposited
- 3 Completed
- 4 Disputed
- 5 Resolved
- 6 Cancelled

争议状态：
- 0 None
- 1 Open
- 2 Resolved

## 关键表结构

- ruleset: `rule_hash`, `dispute_window_ms`, `platform_fee_bps`
- ledger_balance: `owner`, `available`
- credit_receipt: `receipt_id`, `owner`, `amount`, `admin`, `timestamp_ms`
- order: 订单全量字段（见 `sources/codegen/resources/order.move`）

## 前端调用清单（Move entry）

### 规则集
- `qy::ruleset_system::create_ruleset(dapp_hub, rule_set_id, rule_hash, dispute_window_ms, platform_fee_bps)`
  - **用途**：管理员创建规则集

### 余额记账
- `qy::ledger_system::credit_balance_with_receipt(dapp_hub, owner, amount, receipt_id, clock)`
  - **用途**：管理员在确认二维码付款后记账充值（带回执，幂等）
  - **receipt_id**：建议使用支付平台订单号/交易号（UTF-8 字节）
  - **clock**：Sui 时钟对象（`0x6`）
- `qy::ledger_system::credit_balance(dapp_hub, owner, amount)`
  - **用途**：管理员在收到二维码付款后，为用户记账充值（不幂等，兼容）

### 订单流程
- `qy::order_system::create_order(dapp_hub, order_id, companion, rule_set_id, service_fee, deposit, clock)`
- `qy::order_system::claim_order(dapp_hub, order_id)`
- `qy::order_system::pay_service_fee(dapp_hub, order_id)`
- `qy::order_system::lock_deposit(dapp_hub, order_id)`
- `qy::order_system::mark_completed(dapp_hub, order_id, clock)`
- `qy::order_system::raise_dispute(dapp_hub, order_id, evidence_hash, clock)`
- `qy::order_system::finalize_no_dispute(dapp_hub, order_id, clock)`
- `qy::order_system::resolve_dispute(dapp_hub, order_id, service_refund_bps, deposit_slash_bps, clock)`
- `qy::order_system::cancel_order(dapp_hub, order_id)`

## 前端示例（Sui SDK）

> 这里用 `@mysten/sui`。Dubhe SDK 如果有封装，也可以用同样的 MoveCall 参数。

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

// 如果不知道 DappHub 的 shared 版本，可用：client.getObject({ id, options: { showOwner: true } })

// 创建订单
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
    // Clock object id is 0x6 on Sui. Let the client resolve shared version.
    tx.object("0x6"),
  ],
});

// 使用用户签名发送
// await client.signAndExecuteTransaction({ transaction: tx, signer });
```

## 事件订阅（可选）

- `qy::events::OrderCreated`
- `qy::events::OrderPaid`
- `qy::events::DepositLocked`
- `qy::events::OrderClaimed`
- `qy::events::OrderCompleted`
- `qy::events::OrderDisputed`
- `qy::events::OrderResolved`
- `qy::events::OrderFinalized`
- `qy::events::BalanceCredited`
- `qy::events::CreditReceiptRecorded`

## 注意事项

- 本版本为“记账型”合约，**清算不可逆**；争议必须在 `dispute_window_ms` 内提出。
- 争议期内仅用户可调用 `finalize_no_dispute` 作为放弃争议结算；争议期结束后可直接结算。
- `resolve_dispute` 仅管理员可调用。
- 生产环境建议优先使用 `credit_balance_with_receipt`，避免重复记账。
