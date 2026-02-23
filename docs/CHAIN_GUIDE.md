# 链上协作指南（Sui + Dubhe）

面向新人：知道合约在哪里、怎么改、如何与应用联动。

## 1) 目录入口

- 合约源码：`packages/contracts/src/**`
- Dubhe 配置：`packages/contracts/dubhe.config.ts`
- 部署常量：`packages/contracts/deployment.ts`
- 后端链上逻辑：`packages/app/src/lib/chain/**`

## 2) 常见改动场景

### A. 修改 Move 合约
1. 在 `packages/contracts/src/**` 修改
2. 重新发布合约（Dubhe CLI）
3. 更新 `deployment.ts` 与 `metadata.json`
4. 在应用侧更新依赖（`qy-chain.ts` 或 `qy-chain-lite.ts`）

### B. 调整链上订单流程
- 状态机映射：`packages/app/src/lib/chain/chain-status.ts`
- 同步逻辑：`packages/app/src/lib/chain/chain-sync.ts`
- 代付逻辑：`packages/app/src/lib/chain/chain-sponsor.ts`

## 3) 对应用影响

- 订单创建与同步：`/api/orders/*` + `/api/orders/[id]/chain-sync`
- 链上事件同步：`/api/cron/chain-sync`
- 链上异常/重试：`chain-error.ts` + `qy-chain.ts`

## 4) 自测建议

- 需要 Sui 私钥与 RPC
- 链上端到端脚本：`npm run test:chain:script`
- 相关环境变量：`SUI_RPC_URL`、`SUI_NETWORK`、`SUI_ADMIN_PRIVATE_KEY`
