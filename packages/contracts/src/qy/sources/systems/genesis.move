/// 初始化 qy 表结构 / Initializes tables and metadata for the qy package.
module qy::genesis {
  use dubhe::dapp_service::DappHub;
  use dubhe::dapp_system;
  use qy::dapp_key::DappKey;
  use qy::ruleset;
  use qy::ledger_balance;
  use qy::credit_receipt;
  use qy::order;
  use std::ascii::{String, string};
  use sui::clock::Clock;

  const DAPP_NAME: vector<u8> = b"qingyi";
  const DAPP_DESCRIPTION: vector<u8> = b"qingyi ledger";

  /// Dubhe CLI deploy hook entry / CLI 发布后回调入口
  public fun run(dapp_hub: &mut DappHub, clock: &Clock, ctx: &mut TxContext) {
    init_dapp(dapp_hub, string(DAPP_NAME), string(DAPP_DESCRIPTION), clock, ctx);
  }

  public fun init_dapp(
    dapp_hub: &mut DappHub,
    name: String,
    description: String,
    clock: &Clock,
    ctx: &mut TxContext
  ) {
    dapp_system::create_dapp<DappKey>(dapp_hub, qy::dapp_key::new(), name, description, clock, ctx);
    ruleset::register_table(dapp_hub, ctx);
    ledger_balance::register_table(dapp_hub, ctx);
    credit_receipt::register_table(dapp_hub, ctx);
    order::register_table(dapp_hub, ctx);
  }
}
