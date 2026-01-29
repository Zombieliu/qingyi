/// 初始化 qy 表结构 / Initializes tables and metadata for the qy package.
module qy::genesis {
  use dubhe::dapp_service::DappHub;
  use dubhe::dapp_system;
  use qy::dapp_key::DappKey;
  use qy::ruleset;
  use qy::ledger_balance;
  use qy::order;
  use std::ascii::String;
  use sui::clock::Clock;

  public entry fun init(
    dapp_hub: &mut DappHub,
    name: String,
    description: String,
    clock: &Clock,
    ctx: &mut TxContext
  ) {
    dapp_system::create_dapp<DappKey>(dapp_hub, qy::dapp_key::new(), name, description, clock, ctx);
    ruleset::register_table(dapp_hub, ctx);
    ledger_balance::register_table(dapp_hub, ctx);
    order::register_table(dapp_hub, ctx);
  }
}
