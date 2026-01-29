# Contracts

- Move packages:
  - `src/dubhe` (Dubhe framework, vendored for local builds)
  - `src/qy` (情谊电竞链上记账与仲裁合约)

## qy 使用说明

- 中文：`packages/contracts/src/qy/README.md`
- English: `packages/contracts/src/qy/README.en.md`

## Build

```bash
cd packages/contracts/src/qy
sui move build
```

## Init

- 部署 Dubhe + qy 后，调用 `qy::genesis::init` 初始化表。
- 需要传入 Dubhe `DappHub` 共享对象与 `Clock`。

## Notes

- 该版本为“链上记账型”设计：不收币、只维护余额数字。
- 后续可将 `ledger_balance` 替换为 `Balance<T>` 托管。
