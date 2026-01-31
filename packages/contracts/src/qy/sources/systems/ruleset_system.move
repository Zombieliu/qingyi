/// 规则集注册（hash + 争议窗口 + 平台费率） / Ruleset registry (hash + dispute window + platform fee).
module qy::ruleset_system {
  use dubhe::dapp_service::DappHub;
  use dubhe::dapp_system;
  use qy::dapp_key::DappKey;
  use qy::ruleset;

  const E_RULESET_EXISTS: u64 = 1;
  const E_INVALID_BPS: u64 = 2;

  public fun get_ruleset(dapp_hub: &DappHub, rule_set_id: u64): ruleset::Ruleset {
    ruleset::get_struct(dapp_hub, rule_set_id)
  }

  /// 管理员创建规则集 / Admin registers a ruleset by id.
  public fun create_ruleset(
    dapp_hub: &mut DappHub,
    rule_set_id: u64,
    rule_hash: vector<u8>,
    dispute_window_ms: u64,
    platform_fee_bps: u64,
    ctx: &mut TxContext
  ) {
    dapp_system::ensure_dapp_admin<DappKey>(dapp_hub, ctx.sender());
    assert!(!ruleset::has(dapp_hub, rule_set_id), E_RULESET_EXISTS);
    assert!(platform_fee_bps <= 10000, E_INVALID_BPS);
    let rs = ruleset::new(rule_hash, dispute_window_ms, platform_fee_bps);
    ruleset::set_struct(dapp_hub, rule_set_id, rs);
  }
}
