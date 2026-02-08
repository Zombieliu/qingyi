/// 记账余额模块（管理员记账充值） / Ledger-based balances (admin credits off-chain payments).
module qy::ledger_system {
  use dubhe::dapp_service::DappHub;
  use dubhe::dapp_system;
  use qy::dapp_key;
  use qy::dapp_key::DappKey;
  use qy::ledger_balance;
  use qy::credit_receipt;
  use qy::events;
  use sui::clock::Clock;
  use sui::clock;

  const E_INSUFFICIENT: u64 = 10;
  const E_AMOUNT_ZERO: u64 = 11;
  const E_RECEIPT_EXISTS: u64 = 12;
  const E_RECEIPT_EMPTY: u64 = 13;

  fun clone_bytes(data: &vector<u8>): vector<u8> {
    let mut out = vector::empty<u8>();
    let mut i = 0;
    let len = vector::length(data);
    while (i < len) {
      let b = *vector::borrow(data, i);
      vector::push_back(&mut out, b);
      i = i + 1;
    };
    out
  }

  public fun get_balance(dapp_hub: &DappHub, owner: address): u64 {
    if (!ledger_balance::has(dapp_hub, dapp_key::to_string(), owner)) {
      return 0
    };
    ledger_balance::get(dapp_hub, dapp_key::to_string(), owner)
  }

  /// 管理员为用户记账充值 / Admin credits a user's balance (used after QR payment).
  public fun credit_balance(dapp_hub: &mut DappHub, owner: address, amount: u64, ctx: &mut TxContext) {
    dapp_system::ensure_dapp_admin<DappKey>(dapp_hub, ctx.sender());
    assert!(amount > 0, E_AMOUNT_ZERO);
    let next = get_balance(dapp_hub, owner) + amount;
    ledger_balance::set(dapp_hub, dapp_key::to_string(), owner, next, ctx);
    events::emit_balance_credited(owner, amount, ctx.sender());
  }

  /// 管理员记账充值（带回执，幂等） / Admin credits with receipt id (idempotent).
  public fun credit_balance_with_receipt(
    dapp_hub: &mut DappHub,
    owner: address,
    amount: u64,
    receipt_id: vector<u8>,
    clock_ref: &Clock,
    ctx: &mut TxContext
  ) {
    dapp_system::ensure_dapp_admin<DappKey>(dapp_hub, ctx.sender());
    assert!(amount > 0, E_AMOUNT_ZERO);
    assert!(vector::length(&receipt_id) > 0, E_RECEIPT_EMPTY);
    let receipt_id_copy = clone_bytes(&receipt_id);
    assert!(!credit_receipt::has(dapp_hub, dapp_key::to_string(), receipt_id_copy), E_RECEIPT_EXISTS);

    let next = get_balance(dapp_hub, owner) + amount;
    ledger_balance::set(dapp_hub, dapp_key::to_string(), owner, next, ctx);

    let ts = clock::timestamp_ms(clock_ref);
    let rec = credit_receipt::new(owner, amount, ctx.sender(), ts);
    credit_receipt::set_struct(dapp_hub, dapp_key::to_string(), receipt_id, rec, ctx);

    events::emit_balance_credited(owner, amount, ctx.sender());
    events::emit_credit_receipt(owner, amount, ctx.sender(), ts);
  }

  /// 内部扣减 / Internal: debit from balance (used by order flow).
  public fun debit_balance(dapp_hub: &mut DappHub, owner: address, amount: u64, ctx: &mut TxContext) {
    let cur = get_balance(dapp_hub, owner);
    assert!(cur >= amount, E_INSUFFICIENT);
    let next = cur - amount;
    ledger_balance::set(dapp_hub, dapp_key::to_string(), owner, next, ctx);
  }

  /// 内部加款 / Internal: add to balance (used by settlement).
  public fun add_balance(dapp_hub: &mut DappHub, owner: address, amount: u64, ctx: &mut TxContext) {
    let next = get_balance(dapp_hub, owner) + amount;
    ledger_balance::set(dapp_hub, dapp_key::to_string(), owner, next, ctx);
  }
}
