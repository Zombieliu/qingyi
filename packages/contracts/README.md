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

## Dubhe SDK 产物

- `dubhe.config.ts` 为配置源，`pnpm dubhe schemagen` 生成 `dubhe.config.json`
- `pnpm dubhe publish --network` 生成/更新 `metadata.json`
- `pnpm dubhe config-store --output-ts-path ./deployment.ts --network` 生成/更新部署常量

## Init

- 部署 Dubhe + qy 后，调用 `qy::genesis::run` 初始化表（传入 Dubhe `DappHub` 共享对象与 `Clock`）。
- 推荐脚本（仓库根目录执行）：
  - `pnpm chain:init-dapp`
  - `pnpm chain:init-ruleset`

## Notes

- 该版本为“链上记账型”设计：不收币、只维护余额数字。
- 后续可将 `ledger_balance` 替换为 `Balance<T>` 托管。
