/// 双陪订单流程（链上记账，不收币） / Duo order flow (ledger-based, no coins on-chain).
/// 两个 companion 平分收入 / Two companions split earnings evenly.
/// 状态码复用 / Status codes (same as single order):
/// 0 Created -> 1 Paid -> 2 Deposited -> 3 Completed -> (4 Disputed) -> 5 Resolved
/// 6 Cancelled（仅 Created/Paid） / (only from Created/Paid)
/// team_status: 0=等待组队 1=A缴押 2=B缴押 3=双人就位
module qy::duo_order_system {
  use dubhe::dapp_service::DappHub;
  use dubhe::dapp_system;
  use dubhe::dapp_metadata;
  use dubhe::type_info;
  use qy::dapp_key;
  use qy::dapp_key::DappKey;
  use qy::ruleset;
  use qy::duo_order;
  use qy::ledger_system;
  use qy::events;
  use sui::clock::Clock;
  use sui::clock;

  const STATUS_CREATED: u8 = 0;
  const STATUS_PAID: u8 = 1;
  const STATUS_DEPOSITED: u8 = 2;
  const STATUS_COMPLETED: u8 = 3;
  const STATUS_DISPUTED: u8 = 4;
  const STATUS_RESOLVED: u8 = 5;
  const STATUS_CANCELLED: u8 = 6;

  const TEAM_WAITING: u8 = 0;
  const TEAM_A_DEPOSITED: u8 = 1;
  const TEAM_B_DEPOSITED: u8 = 2;
  const TEAM_READY: u8 = 3;

  const DISPUTE_NONE: u8 = 0;
  const DISPUTE_OPEN: u8 = 1;
  const DISPUTE_RESOLVED: u8 = 2;

  const E_ORDER_EXISTS: u64 = 30;
  const E_BAD_STATUS: u64 = 32;
  const E_NOT_OWNER: u64 = 33;
  const E_DISPUTE_WINDOW: u64 = 34;
  const E_INVALID_BPS: u64 = 35;
  const E_SLOT_FULL: u64 = 36;
  const E_ALREADY_DEPOSITED: u64 = 37;
  const E_NOT_COMPANION: u64 = 38;
  const E_SAME_COMPANION: u64 = 39;
  const E_NOT_SLOT_COMPANION: u64 = 40;

  /// 创建双陪订单 / Create a duo order. companion_a/b can be @0x0 for open slots.
  public fun create_duo_order(
    dapp_hub: &mut DappHub,
    order_id: u64,
    companion_a: address,
    companion_b: address,
    rule_set_id: u64,
    service_fee: u64,
    deposit_per_companion: u64,
    clock: &Clock,
    ctx: &mut TxContext
  ) {
    assert!(!duo_order::has(dapp_hub, dapp_key::to_string(), order_id), E_ORDER_EXISTS);
    ruleset::ensure_has(dapp_hub, dapp_key::to_string(), rule_set_id);

    let user = ctx.sender();
    let rs = ruleset::get_struct(dapp_hub, dapp_key::to_string(), rule_set_id);
    let now = clock::timestamp_ms(clock);

    let order_struct = duo_order::new(
      user,
      companion_a,
      companion_b,
      rule_set_id,
      service_fee,
      deposit_per_companion,
      ruleset::platform_fee_bps(&rs),
      STATUS_CREATED,
      TEAM_WAITING,
      now,
      0, 0,
      0, 0, 0,
      vector::empty(),
      DISPUTE_NONE,
      @0x0,
      0
    );

    duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, order_struct, ctx);
    events::emit_duo_order_created(order_id, user, companion_a, companion_b, rule_set_id, service_fee, deposit_per_companion);
  }

  /// 用户支付服务费 / User pays service fee from ledger balance.
  public fun pay_service_fee(dapp_hub: &mut DappHub, order_id: u64, ctx: &mut TxContext) {
    duo_order::ensure_has(dapp_hub, dapp_key::to_string(), order_id);
    let mut ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
    assert!(duo_order::status(&ord) == STATUS_CREATED, E_BAD_STATUS);
    assert!(duo_order::user(&ord) == ctx.sender(), E_NOT_OWNER);

    let fee = duo_order::service_fee(&ord);
    let user = duo_order::user(&ord);
    ledger_system::debit_balance(dapp_hub, user, fee, ctx);
    duo_order::update_vault_service(&mut ord, fee);
    duo_order::update_status(&mut ord, STATUS_PAID);
    duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
  }

  /// 陪练认领空位 / Companion claims an open slot (A or B).
  public fun claim_slot(dapp_hub: &mut DappHub, order_id: u64, ctx: &mut TxContext) {
    duo_order::ensure_has(dapp_hub, dapp_key::to_string(), order_id);
    let mut ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
    let status = duo_order::status(&ord);
    assert!(status == STATUS_CREATED || status == STATUS_PAID, E_BAD_STATUS);

    let companion = ctx.sender();
    let a = duo_order::companion_a(&ord);
    let b = duo_order::companion_b(&ord);
    let zero = @0x0;

    if (a == zero) {
      assert!(b != companion, E_SAME_COMPANION);
      duo_order::update_companion_a(&mut ord, companion);
      duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
      events::emit_duo_slot_claimed(order_id, companion, 0);
    } else if (b == zero) {
      assert!(a != companion, E_SAME_COMPANION);
      duo_order::update_companion_b(&mut ord, companion);
      duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
      events::emit_duo_slot_claimed(order_id, companion, 1);
    } else {
      assert!(false, E_SLOT_FULL);
    };
  }

  /// 陪练缴押金 / Companion locks deposit. Updates team_status. When both deposited -> STATUS_DEPOSITED.
  public fun lock_deposit(dapp_hub: &mut DappHub, order_id: u64, ctx: &mut TxContext) {
    duo_order::ensure_has(dapp_hub, dapp_key::to_string(), order_id);
    let mut ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
    assert!(duo_order::status(&ord) == STATUS_PAID, E_BAD_STATUS);

    let caller = ctx.sender();
    let a = duo_order::companion_a(&ord);
    let b = duo_order::companion_b(&ord);
    assert!(caller == a || caller == b, E_NOT_COMPANION);

    let deposit = duo_order::deposit_per_companion(&ord);
    let ts = duo_order::team_status(&ord);

    if (caller == a) {
      assert!(ts == TEAM_WAITING || ts == TEAM_B_DEPOSITED, E_ALREADY_DEPOSITED);
      ledger_system::debit_balance(dapp_hub, caller, deposit, ctx);
      duo_order::update_vault_deposit_a(&mut ord, deposit);
      let new_ts = if (ts == TEAM_B_DEPOSITED) { TEAM_READY } else { TEAM_A_DEPOSITED };
      duo_order::update_team_status(&mut ord, new_ts);
      if (new_ts == TEAM_READY) {
        duo_order::update_status(&mut ord, STATUS_DEPOSITED);
      };
      duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
      events::emit_duo_deposit_locked(order_id, caller, deposit, new_ts);
    } else {
      assert!(ts == TEAM_WAITING || ts == TEAM_A_DEPOSITED, E_ALREADY_DEPOSITED);
      ledger_system::debit_balance(dapp_hub, caller, deposit, ctx);
      duo_order::update_vault_deposit_b(&mut ord, deposit);
      let new_ts = if (ts == TEAM_A_DEPOSITED) { TEAM_READY } else { TEAM_B_DEPOSITED };
      duo_order::update_team_status(&mut ord, new_ts);
      if (new_ts == TEAM_READY) {
        duo_order::update_status(&mut ord, STATUS_DEPOSITED);
      };
      duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
      events::emit_duo_deposit_locked(order_id, caller, deposit, new_ts);
    };
  }

  /// 用户标记完成 / User marks duo order completed; opens dispute window.
  public fun mark_completed(dapp_hub: &mut DappHub, order_id: u64, clock: &Clock, ctx: &mut TxContext) {
    duo_order::ensure_has(dapp_hub, dapp_key::to_string(), order_id);
    let mut ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
    assert!(duo_order::status(&ord) == STATUS_DEPOSITED, E_BAD_STATUS);
    assert!(duo_order::user(&ord) == ctx.sender(), E_NOT_OWNER);

    let rs = ruleset::get_struct(dapp_hub, dapp_key::to_string(), duo_order::rule_set_id(&ord));
    let now = clock::timestamp_ms(clock);
    duo_order::update_finish_at(&mut ord, now);
    let deadline = now + ruleset::dispute_window_ms(&rs);
    duo_order::update_dispute_deadline(&mut ord, deadline);
    duo_order::update_status(&mut ord, STATUS_COMPLETED);
    duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
    events::emit_duo_order_completed(order_id, ctx.sender(), now, deadline);
  }

  /// 管理员标记完成 / Admin marks duo order completed (auto-confirm timeout).
  public fun admin_mark_completed(dapp_hub: &mut DappHub, order_id: u64, clock: &Clock, ctx: &mut TxContext) {
    dapp_system::ensure_dapp_admin<DappKey>(dapp_hub, ctx.sender());
    duo_order::ensure_has(dapp_hub, dapp_key::to_string(), order_id);
    let mut ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
    assert!(duo_order::status(&ord) == STATUS_DEPOSITED, E_BAD_STATUS);

    let rs = ruleset::get_struct(dapp_hub, dapp_key::to_string(), duo_order::rule_set_id(&ord));
    let now = clock::timestamp_ms(clock);
    duo_order::update_finish_at(&mut ord, now);
    let deadline = now + ruleset::dispute_window_ms(&rs);
    duo_order::update_dispute_deadline(&mut ord, deadline);
    duo_order::update_status(&mut ord, STATUS_COMPLETED);
    duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
    events::emit_duo_order_completed(order_id, ctx.sender(), now, deadline);
  }

  /// 争议 / Either party can dispute within the dispute window.
  public fun raise_dispute(
    dapp_hub: &mut DappHub, order_id: u64, evidence_hash: vector<u8>,
    clock: &Clock, ctx: &mut TxContext
  ) {
    duo_order::ensure_has(dapp_hub, dapp_key::to_string(), order_id);
    let mut ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
    assert!(duo_order::status(&ord) == STATUS_COMPLETED, E_BAD_STATUS);
    let now = clock::timestamp_ms(clock);
    assert!(now <= duo_order::dispute_deadline(&ord), E_DISPUTE_WINDOW);

    let caller = ctx.sender();
    assert!(
      caller == duo_order::user(&ord) ||
      caller == duo_order::companion_a(&ord) ||
      caller == duo_order::companion_b(&ord),
      E_NOT_OWNER
    );

    duo_order::update_status(&mut ord, STATUS_DISPUTED);
    duo_order::update_dispute_status(&mut ord, DISPUTE_OPEN);
    duo_order::update_evidence_hash(&mut ord, evidence_hash);
    let ev = duo_order::evidence_hash(&ord);
    duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
    events::emit_duo_order_disputed(order_id, caller, ev);
  }

  /// 无争议结算（平分） / Finalize without dispute — split earnings evenly.
  public fun finalize_no_dispute(dapp_hub: &mut DappHub, order_id: u64, clock: &Clock, ctx: &mut TxContext) {
    duo_order::ensure_has(dapp_hub, dapp_key::to_string(), order_id);
    let mut ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
    assert!(duo_order::status(&ord) == STATUS_COMPLETED, E_BAD_STATUS);
    let now = clock::timestamp_ms(clock);
    if (now <= duo_order::dispute_deadline(&ord)) {
      assert!(duo_order::user(&ord) == ctx.sender(), E_NOT_OWNER);
    };

    let platform_fee = (duo_order::vault_service(&ord) * duo_order::platform_fee_bps(&ord)) / 10000;
    let companion_total = duo_order::vault_service(&ord) - platform_fee;
    let each_share = companion_total / 2;
    let remainder = companion_total % 2;

    let dapp_key = type_info::get_type_name_string<DappKey>();
    let admin = dapp_metadata::get_admin(dapp_hub, dapp_key);

    // A gets: each_share + remainder + deposit_a
    ledger_system::add_balance(dapp_hub, duo_order::companion_a(&ord), each_share + remainder + duo_order::vault_deposit_a(&ord), ctx);
    // B gets: each_share + deposit_b
    ledger_system::add_balance(dapp_hub, duo_order::companion_b(&ord), each_share + duo_order::vault_deposit_b(&ord), ctx);
    // Admin gets: platform_fee
    ledger_system::add_balance(dapp_hub, admin, platform_fee, ctx);

    duo_order::update_vault_service(&mut ord, 0);
    duo_order::update_vault_deposit_a(&mut ord, 0);
    duo_order::update_vault_deposit_b(&mut ord, 0);
    duo_order::update_status(&mut ord, STATUS_RESOLVED);
    duo_order::update_dispute_status(&mut ord, DISPUTE_NONE);
    duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
    events::emit_duo_order_finalized(order_id);
  }

  /// 管理员裁决争议（平分退款/罚没） / Admin resolves dispute with refund/slash ratios.
  public fun resolve_dispute(
    dapp_hub: &mut DappHub, order_id: u64,
    service_refund_bps: u64, deposit_slash_bps: u64,
    clock: &Clock, ctx: &mut TxContext
  ) {
    dapp_system::ensure_dapp_admin<DappKey>(dapp_hub, ctx.sender());
    assert!(service_refund_bps <= 10000 && deposit_slash_bps <= 10000, E_INVALID_BPS);

    duo_order::ensure_has(dapp_hub, dapp_key::to_string(), order_id);
    let mut ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
    assert!(duo_order::status(&ord) == STATUS_DISPUTED, E_BAD_STATUS);

    let refund_service = (duo_order::vault_service(&ord) * service_refund_bps) / 10000;
    let total_deposit = duo_order::vault_deposit_a(&ord) + duo_order::vault_deposit_b(&ord);
    let user_from_deposit = (total_deposit * deposit_slash_bps) / 10000;
    let companion_service = duo_order::vault_service(&ord) - refund_service;
    let companion_deposit_remaining = total_deposit - user_from_deposit;

    // Refund user
    ledger_system::add_balance(dapp_hub, duo_order::user(&ord), refund_service + user_from_deposit, ctx);
    // Split remaining service + deposit evenly between companions
    let each_service = companion_service / 2;
    let service_remainder = companion_service % 2;
    let each_deposit = companion_deposit_remaining / 2;
    let deposit_remainder = companion_deposit_remaining % 2;
    ledger_system::add_balance(dapp_hub, duo_order::companion_a(&ord), each_service + service_remainder + each_deposit + deposit_remainder, ctx);
    ledger_system::add_balance(dapp_hub, duo_order::companion_b(&ord), each_service + each_deposit, ctx);

    duo_order::update_vault_service(&mut ord, 0);
    duo_order::update_vault_deposit_a(&mut ord, 0);
    duo_order::update_vault_deposit_b(&mut ord, 0);
    duo_order::update_status(&mut ord, STATUS_RESOLVED);
    duo_order::update_dispute_status(&mut ord, DISPUTE_RESOLVED);
    duo_order::update_resolved_by(&mut ord, ctx.sender());
    duo_order::update_resolved_at(&mut ord, clock::timestamp_ms(clock));
    duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
    events::emit_duo_order_resolved(order_id, ctx.sender(), service_refund_bps, deposit_slash_bps);
  }

  /// 用户取消（押金前） / User cancels before deposit; refunds service fee if paid.
  public fun cancel_order(dapp_hub: &mut DappHub, order_id: u64, ctx: &mut TxContext) {
    duo_order::ensure_has(dapp_hub, dapp_key::to_string(), order_id);
    let mut ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
    assert!(duo_order::user(&ord) == ctx.sender(), E_NOT_OWNER);

    if (duo_order::status(&ord) == STATUS_CREATED) {
      duo_order::update_status(&mut ord, STATUS_CANCELLED);
      duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
      return
    };

    if (duo_order::status(&ord) == STATUS_PAID) {
      // Refund service fee to user
      ledger_system::add_balance(dapp_hub, duo_order::user(&ord), duo_order::vault_service(&ord), ctx);
      duo_order::update_vault_service(&mut ord, 0);
      // Refund any partial deposits
      let da = duo_order::vault_deposit_a(&ord);
      if (da > 0) {
        ledger_system::add_balance(dapp_hub, duo_order::companion_a(&ord), da, ctx);
        duo_order::update_vault_deposit_a(&mut ord, 0);
      };
      let db = duo_order::vault_deposit_b(&ord);
      if (db > 0) {
        ledger_system::add_balance(dapp_hub, duo_order::companion_b(&ord), db, ctx);
        duo_order::update_vault_deposit_b(&mut ord, 0);
      };
      duo_order::update_status(&mut ord, STATUS_CANCELLED);
      duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
      return
    };

    assert!(false, E_BAD_STATUS);
  }

  /// 管理员强制取消 / Admin cancels before full deposit.
  public fun admin_cancel_order(dapp_hub: &mut DappHub, order_id: u64, ctx: &mut TxContext) {
    dapp_system::ensure_dapp_admin<DappKey>(dapp_hub, ctx.sender());
    duo_order::ensure_has(dapp_hub, dapp_key::to_string(), order_id);
    let mut ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);

    if (duo_order::status(&ord) == STATUS_CREATED) {
      duo_order::update_status(&mut ord, STATUS_CANCELLED);
      duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
      return
    };

    if (duo_order::status(&ord) == STATUS_PAID) {
      ledger_system::add_balance(dapp_hub, duo_order::user(&ord), duo_order::vault_service(&ord), ctx);
      duo_order::update_vault_service(&mut ord, 0);
      let da = duo_order::vault_deposit_a(&ord);
      if (da > 0) {
        ledger_system::add_balance(dapp_hub, duo_order::companion_a(&ord), da, ctx);
        duo_order::update_vault_deposit_a(&mut ord, 0);
      };
      let db = duo_order::vault_deposit_b(&ord);
      if (db > 0) {
        ledger_system::add_balance(dapp_hub, duo_order::companion_b(&ord), db, ctx);
        duo_order::update_vault_deposit_b(&mut ord, 0);
      };
      duo_order::update_status(&mut ord, STATUS_CANCELLED);
      duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
      return
    };

    assert!(false, E_BAD_STATUS);
  }

  /// 内部释放槽位 / Internal: release a companion slot, refund deposit, adjust team_status.
  fun do_release_slot(dapp_hub: &mut DappHub, order_id: u64, slot: u8, ctx: &mut TxContext) {
    let mut ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
    let status = duo_order::status(&ord);
    assert!(status <= STATUS_DEPOSITED, E_BAD_STATUS);

    let ts = duo_order::team_status(&ord);

    if (slot == 0) {
      // Release slot A
      let da = duo_order::vault_deposit_a(&ord);
      if (da > 0) {
        ledger_system::add_balance(dapp_hub, duo_order::companion_a(&ord), da, ctx);
        duo_order::update_vault_deposit_a(&mut ord, 0);
      };
      duo_order::update_companion_a(&mut ord, @0x0);
      if (ts == TEAM_A_DEPOSITED) {
        duo_order::update_team_status(&mut ord, TEAM_WAITING);
      } else if (ts == TEAM_READY) {
        duo_order::update_team_status(&mut ord, TEAM_B_DEPOSITED);
      };
    } else {
      // Release slot B
      let db = duo_order::vault_deposit_b(&ord);
      if (db > 0) {
        ledger_system::add_balance(dapp_hub, duo_order::companion_b(&ord), db, ctx);
        duo_order::update_vault_deposit_b(&mut ord, 0);
      };
      duo_order::update_companion_b(&mut ord, @0x0);
      if (ts == TEAM_B_DEPOSITED) {
        duo_order::update_team_status(&mut ord, TEAM_WAITING);
      } else if (ts == TEAM_READY) {
        duo_order::update_team_status(&mut ord, TEAM_A_DEPOSITED);
      };
    };

    // If was DEPOSITED(2), roll back to PAID(1)
    if (status == STATUS_DEPOSITED) {
      duo_order::update_status(&mut ord, STATUS_PAID);
    };

    duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord, ctx);
  }

  /// 陪练自助释放槽位 / Companion releases their own slot.
  public fun release_slot(dapp_hub: &mut DappHub, order_id: u64, ctx: &mut TxContext) {
    duo_order::ensure_has(dapp_hub, dapp_key::to_string(), order_id);
    let ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
    let caller = ctx.sender();
    let a = duo_order::companion_a(&ord);
    let b = duo_order::companion_b(&ord);

    if (caller == a) {
      do_release_slot(dapp_hub, order_id, 0, ctx);
      events::emit_duo_slot_released(order_id, caller, 0);
    } else if (caller == b) {
      do_release_slot(dapp_hub, order_id, 1, ctx);
      events::emit_duo_slot_released(order_id, caller, 1);
    } else {
      assert!(false, E_NOT_SLOT_COMPANION);
    };
  }

  /// 管理员释放槽位（可选替换） / Admin releases a slot, optionally assigning a new companion.
  public fun admin_release_slot(
    dapp_hub: &mut DappHub, order_id: u64, slot: u8, new_companion: address, ctx: &mut TxContext
  ) {
    dapp_system::ensure_dapp_admin<DappKey>(dapp_hub, ctx.sender());
    duo_order::ensure_has(dapp_hub, dapp_key::to_string(), order_id);
    let ord = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
    let old_companion = if (slot == 0) { duo_order::companion_a(&ord) } else { duo_order::companion_b(&ord) };

    do_release_slot(dapp_hub, order_id, slot, ctx);
    events::emit_duo_slot_released(order_id, old_companion, slot);

    // Optionally assign new companion
    if (new_companion != @0x0) {
      let mut ord2 = duo_order::get_struct(dapp_hub, dapp_key::to_string(), order_id);
      if (slot == 0) {
        duo_order::update_companion_a(&mut ord2, new_companion);
      } else {
        duo_order::update_companion_b(&mut ord2, new_companion);
      };
      duo_order::set_struct(dapp_hub, dapp_key::to_string(), order_id, ord2, ctx);
      events::emit_duo_slot_claimed(order_id, new_companion, slot);
    };
  }
}
