/// 前端/索引器事件 / Domain events for frontend/indexer consumption.
module qy::events {
  use sui::event;

  public struct OrderCreated has copy, drop {
    order_id: u64,
    user: address,
    companion: address,
    rule_set_id: u64,
    service_fee: u64,
    deposit: u64,
  }

  public struct OrderPaid has copy, drop {
    order_id: u64,
    user: address,
    service_fee: u64,
  }

  public struct DepositLocked has copy, drop {
    order_id: u64,
    companion: address,
    deposit: u64,
  }

  public struct OrderCompleted has copy, drop {
    order_id: u64,
    user: address,
    finish_at: u64,
    dispute_deadline: u64,
  }

  public struct OrderDisputed has copy, drop {
    order_id: u64,
    claimant: address,
    evidence_hash: vector<u8>,
  }

  public struct OrderResolved has copy, drop {
    order_id: u64,
    resolved_by: address,
    service_refund_bps: u64,
    deposit_slash_bps: u64,
  }

  public struct OrderFinalized has copy, drop {
    order_id: u64,
  }

  public struct BalanceCredited has copy, drop {
    owner: address,
    amount: u64,
    admin: address,
  }

  public struct CreditReceiptRecorded has copy, drop {
    owner: address,
    amount: u64,
    admin: address,
    timestamp_ms: u64,
  }

  public fun emit_order_created(order_id: u64, user: address, companion: address, rule_set_id: u64, service_fee: u64, deposit: u64) {
    event::emit(OrderCreated { order_id, user, companion, rule_set_id, service_fee, deposit });
  }

  public fun emit_order_paid(order_id: u64, user: address, service_fee: u64) {
    event::emit(OrderPaid { order_id, user, service_fee });
  }

  public fun emit_deposit_locked(order_id: u64, companion: address, deposit: u64) {
    event::emit(DepositLocked { order_id, companion, deposit });
  }

  public fun emit_order_completed(order_id: u64, user: address, finish_at: u64, dispute_deadline: u64) {
    event::emit(OrderCompleted { order_id, user, finish_at, dispute_deadline });
  }

  public fun emit_order_disputed(order_id: u64, claimant: address, evidence_hash: vector<u8>) {
    event::emit(OrderDisputed { order_id, claimant, evidence_hash });
  }

  public fun emit_order_resolved(order_id: u64, resolved_by: address, service_refund_bps: u64, deposit_slash_bps: u64) {
    event::emit(OrderResolved { order_id, resolved_by, service_refund_bps, deposit_slash_bps });
  }

  public fun emit_order_finalized(order_id: u64) {
    event::emit(OrderFinalized { order_id });
  }

  public fun emit_balance_credited(owner: address, amount: u64, admin: address) {
    event::emit(BalanceCredited { owner, amount, admin });
  }

  public fun emit_credit_receipt(owner: address, amount: u64, admin: address, timestamp_ms: u64) {
    event::emit(CreditReceiptRecorded { owner, amount, admin, timestamp_ms });
  }
}
