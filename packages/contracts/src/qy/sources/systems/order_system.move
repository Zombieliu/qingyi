/// 订单流程（链上记账，不收币） / Order flow (ledger-based, no coins on-chain).
/// 角色 / Roles:
/// - user：支付服务费（余额扣减） / pays service fee (ledger debit)
/// - companion：缴押金（余额扣减） / locks deposit (ledger debit)
/// - admin：仲裁清算 / resolves disputes
/// 状态码 / Status codes:
/// 0 Created -> 1 Paid -> 2 Deposited -> 3 Completed -> (4 Disputed) -> 5 Resolved
/// 6 Cancelled（仅 Created/Paid） / (only from Created/Paid)
module qy::order_system {
  use dubhe::dapp_service::DappHub;
  use dubhe::dapp_system;
  use dubhe::dapp_metadata;
  use dubhe::type_info;
  use qy::dapp_key::DappKey;
  use qy::ruleset;
  use qy::order;
  use qy::ledger_system;
  use qy::events;
  use sui::clock::Clock;
  use sui::clock;
  use std::vector;

  const STATUS_CREATED: u8 = 0;
  const STATUS_PAID: u8 = 1;
  const STATUS_DEPOSITED: u8 = 2;
  const STATUS_COMPLETED: u8 = 3;
  const STATUS_DISPUTED: u8 = 4;
  const STATUS_RESOLVED: u8 = 5;
  const STATUS_CANCELLED: u8 = 6;

  const DISPUTE_NONE: u8 = 0;
  const DISPUTE_OPEN: u8 = 1;
  const DISPUTE_RESOLVED: u8 = 2;

  const E_ORDER_EXISTS: u64 = 20;
  const E_ORDER_NOT_FOUND: u64 = 21;
  const E_BAD_STATUS: u64 = 22;
  const E_NOT_OWNER: u64 = 23;
  const E_DISPUTE_WINDOW: u64 = 24;
  const E_INVALID_BPS: u64 = 25;

  /// 创建订单 / Create an order with selected ruleset and pricing.
  public entry fun create_order(
    dapp_hub: &mut DappHub,
    order_id: u64,
    companion: address,
    rule_set_id: u64,
    service_fee: u64,
    deposit: u64,
    clock: &Clock,
    ctx: &mut TxContext
  ) {
    assert!(!order::has(dapp_hub, order_id), E_ORDER_EXISTS);
    ruleset::ensure_has(dapp_hub, rule_set_id);

    let user = ctx.sender();
    let rs = ruleset::get_struct(dapp_hub, rule_set_id);
    let now = clock::timestamp_ms(clock);

    let order_struct = order::new(
      user,
      companion,
      rule_set_id,
      service_fee,
      deposit,
      ruleset::platform_fee_bps(&rs),
      STATUS_CREATED,
      now,
      0,
      0,
      0,
      0,
      vector::empty(),
      DISPUTE_NONE,
      @0x0,
      0
    );

    order::set_struct(dapp_hub, order_id, order_struct);
    events::emit_order_created(order_id, user, companion, rule_set_id, service_fee, deposit);
  }

  /// 用户支付服务费（扣减余额） / User pays service fee from ledger balance.
  public entry fun pay_service_fee(dapp_hub: &mut DappHub, order_id: u64, ctx: &mut TxContext) {
    order::ensure_has(dapp_hub, order_id);
    let mut ord = order::get_struct(dapp_hub, order_id);
    assert!(order::status(&ord) == STATUS_CREATED, E_BAD_STATUS);
    assert!(order::user(&ord) == ctx.sender(), E_NOT_OWNER);

    ledger_system::debit_balance(dapp_hub, order::user(&ord), order::service_fee(&ord));
    order::update_vault_service(&mut ord, order::service_fee(&ord));
    order::update_status(&mut ord, STATUS_PAID);
    let paid_fee = order::service_fee(&ord);
    order::set_struct(dapp_hub, order_id, ord);
    events::emit_order_paid(order_id, ctx.sender(), paid_fee);
  }

  /// 陪玩缴押金（扣减余额） / Companion locks deposit from ledger balance.
  public entry fun lock_deposit(dapp_hub: &mut DappHub, order_id: u64, ctx: &mut TxContext) {
    order::ensure_has(dapp_hub, order_id);
    let mut ord = order::get_struct(dapp_hub, order_id);
    assert!(order::status(&ord) == STATUS_PAID, E_BAD_STATUS);
    assert!(order::companion(&ord) == ctx.sender(), E_NOT_OWNER);

    ledger_system::debit_balance(dapp_hub, order::companion(&ord), order::deposit(&ord));
    order::update_vault_deposit(&mut ord, order::deposit(&ord));
    order::update_status(&mut ord, STATUS_DEPOSITED);
    let locked_deposit = order::deposit(&ord);
    order::set_struct(dapp_hub, order_id, ord);
    events::emit_deposit_locked(order_id, ctx.sender(), locked_deposit);
  }

  /// 用户标记完成，开启争议窗口 / User marks order completed; opens dispute window.
  public entry fun mark_completed(dapp_hub: &mut DappHub, order_id: u64, clock: &Clock, ctx: &mut TxContext) {
    order::ensure_has(dapp_hub, order_id);
    let mut ord = order::get_struct(dapp_hub, order_id);
    assert!(order::status(&ord) == STATUS_DEPOSITED, E_BAD_STATUS);
    assert!(order::user(&ord) == ctx.sender(), E_NOT_OWNER);

    let rs = ruleset::get_struct(dapp_hub, order::rule_set_id(&ord));
    let now = clock::timestamp_ms(clock);
    order::update_finish_at(&mut ord, now);
    let deadline = now + ruleset::dispute_window_ms(&rs);
    order::update_dispute_deadline(&mut ord, deadline);
    order::update_status(&mut ord, STATUS_COMPLETED);
    order::set_struct(dapp_hub, order_id, ord);
    events::emit_order_completed(order_id, ctx.sender(), now, deadline);
  }

  /// 争议期内任意一方可发起争议 / Either party can dispute within the dispute window.
  public entry fun raise_dispute(
    dapp_hub: &mut DappHub,
    order_id: u64,
    evidence_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext
  ) {
    order::ensure_has(dapp_hub, order_id);
    let mut ord = order::get_struct(dapp_hub, order_id);
    assert!(order::status(&ord) == STATUS_COMPLETED, E_BAD_STATUS);
    let now = clock::timestamp_ms(clock);
    assert!(now <= order::dispute_deadline(&ord), E_DISPUTE_WINDOW);

    let caller = ctx.sender();
    assert!(caller == order::user(&ord) || caller == order::companion(&ord), E_NOT_OWNER);

    order::update_status(&mut ord, STATUS_DISPUTED);
    order::update_dispute_status(&mut ord, DISPUTE_OPEN);
    order::update_evidence_hash(&mut ord, evidence_hash);
    let ev = order::evidence_hash(&ord);
    order::set_struct(dapp_hub, order_id, ord);
    events::emit_order_disputed(order_id, caller, ev);
  }

  /// 争议期后可结算（收平台费） / Anyone can finalize after dispute window; applies platform fee.
  public entry fun finalize_no_dispute(dapp_hub: &mut DappHub, order_id: u64, clock: &Clock) {
    order::ensure_has(dapp_hub, order_id);
    let mut ord = order::get_struct(dapp_hub, order_id);
    assert!(order::status(&ord) == STATUS_COMPLETED, E_BAD_STATUS);
    let now = clock::timestamp_ms(clock);
    assert!(now > order::dispute_deadline(&ord), E_DISPUTE_WINDOW);

    let platform_fee = (order::vault_service(&ord) * order::platform_fee_bps(&ord)) / 10000;
    let companion_service = order::vault_service(&ord) - platform_fee;

    let dapp_key = type_info::get_type_name_string<DappKey>();
    let admin = dapp_metadata::get_admin(dapp_hub, dapp_key);

    ledger_system::add_balance(dapp_hub, order::companion(&ord), companion_service + order::vault_deposit(&ord));
    ledger_system::add_balance(dapp_hub, admin, platform_fee);

    order::update_vault_service(&mut ord, 0);
    order::update_vault_deposit(&mut ord, 0);
    order::update_status(&mut ord, STATUS_RESOLVED);
    order::update_dispute_status(&mut ord, DISPUTE_NONE);
    order::set_struct(dapp_hub, order_id, ord);
    events::emit_order_finalized(order_id);
  }

  /// 管理员裁决（支持部分退款） / Admin resolves dispute with refund/slash ratios (bps).
  public entry fun resolve_dispute(
    dapp_hub: &mut DappHub,
    order_id: u64,
    service_refund_bps: u64,
    deposit_slash_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext
  ) {
    dapp_system::ensure_dapp_admin<DappKey>(dapp_hub, ctx.sender());
    assert!(service_refund_bps <= 10000 && deposit_slash_bps <= 10000, E_INVALID_BPS);

    order::ensure_has(dapp_hub, order_id);
    let mut ord = order::get_struct(dapp_hub, order_id);
    assert!(order::status(&ord) == STATUS_DISPUTED, E_BAD_STATUS);

    let refund_service = (order::vault_service(&ord) * service_refund_bps) / 10000;
    let user_from_deposit = (order::vault_deposit(&ord) * deposit_slash_bps) / 10000;
    let companion_service = order::vault_service(&ord) - refund_service;
    let companion_deposit = order::vault_deposit(&ord) - user_from_deposit;

    ledger_system::add_balance(dapp_hub, order::user(&ord), refund_service + user_from_deposit);
    ledger_system::add_balance(dapp_hub, order::companion(&ord), companion_service + companion_deposit);

    order::update_vault_service(&mut ord, 0);
    order::update_vault_deposit(&mut ord, 0);
    order::update_status(&mut ord, STATUS_RESOLVED);
    order::update_dispute_status(&mut ord, DISPUTE_RESOLVED);
    order::update_resolved_by(&mut ord, ctx.sender());
    order::update_resolved_at(&mut ord, clock::timestamp_ms(clock));
    order::set_struct(dapp_hub, order_id, ord);
    events::emit_order_resolved(order_id, ctx.sender(), service_refund_bps, deposit_slash_bps);
  }

  /// 用户在押金前取消 / User cancels before companion deposit; refunds service fee if paid.
  public entry fun cancel_order(dapp_hub: &mut DappHub, order_id: u64, ctx: &mut TxContext) {
    order::ensure_has(dapp_hub, order_id);
    let mut ord = order::get_struct(dapp_hub, order_id);
    assert!(order::user(&ord) == ctx.sender(), E_NOT_OWNER);

    if (order::status(&ord) == STATUS_CREATED) {
      order::update_status(&mut ord, STATUS_CANCELLED);
      order::set_struct(dapp_hub, order_id, ord);
      return
    };

    if (order::status(&ord) == STATUS_PAID) {
      ledger_system::add_balance(dapp_hub, order::user(&ord), order::vault_service(&ord));
      order::update_vault_service(&mut ord, 0);
      order::update_status(&mut ord, STATUS_CANCELLED);
      order::set_struct(dapp_hub, order_id, ord);
      return
    };

    assert!(false, E_BAD_STATUS);
  }
}
