# 情谊电竞链上落地状态（testnet）

更新时间：2026-02-11

## 1) 合约部署状态
- 已发布 qy 包（testnet）  
  - PACKAGE_ID: 0x566f2d639a29ac29c64fb5bb1a87415ec5ae45fcbcb5d9066539bff5801fd934
  - UpgradeCap: 0xabb8d68f2be23786f0666ecd6767cb839f32434824af595c769bd00d11efe211
  - Publish Tx: B21hLoYvQsvdFjFbQcHuwdu7P6QmUDuLytinXEkeAoQy
  - Deploy Hook Tx: EFQqRPW8FCGt8xmy3LysJyfXbL2sMS3gtaR5CQW1n7FD
- DappHub（Dubhe）  
  - DAPP_HUB_ID: 0xb65df6ea777f1ed0fb9a0d9173eec6b43f2ae1da4346af1b48f678d8af796379
  - DAPP_HUB_INITIAL_SHARED_VERSION: 593960969
- ruleset 已初始化  
  - rule_set_id=1, rule_hash="v1", dispute_window_ms=86400000, platform_fee_bps=1500
  - Init Tx: GaCvZgeiqJQTT23RGy1Ypczm6tVjws32Svp2F8oiMFqb

## 2) 前端链上接入现状
- 已接入链上下单（Passkey 签名）
  - `packages/app/src/app/(tabs)/schedule/page.tsx`
  - `packages/app/src/app/components/order-button.tsx`
- 已接入链上订单列表读取 + 用户/陪玩操作按钮
  - `packages/app/src/app/(tabs)/showcase/page.tsx`
- 安排页已显示链上状态与操作入口
  - `packages/app/src/app/(tabs)/schedule/page.tsx`

## 3) 链上工具与解析
- 链上工具与事件解析统一在：
  - `packages/app/src/lib/qy-chain.ts`
  - 支持：创建订单、支付撮合费、押金锁定、确认完成、争议、结算、取消
  - 通过 Dubhe `Dubhe_Store_SetRecord` 事件解码 order 表

## 4) 环境变量（本地）
- `.env.local` 已补齐：
  - SUI_RPC_URL / SUI_NETWORK / SUI_ADMIN_PRIVATE_KEY
  - SUI_PACKAGE_ID / SUI_DAPP_HUB_ID / SUI_DAPP_HUB_INITIAL_SHARED_VERSION
  - LEDGER_ADMIN_TOKEN
  - NEXT_PUBLIC_CHAIN_ORDERS=1
  - NEXT_PUBLIC_SUI_NETWORK / NEXT_PUBLIC_SUI_RPC_URL
  - NEXT_PUBLIC_QY_RULESET_ID / NEXT_PUBLIC_QY_DEFAULT_COMPANION

## 5) 已知限制 / 注意点
- 链上订单读取基于 Dubhe 事件索引（无独立后端索引器）
- 订单金额使用“分”为单位（前端金额 * 100）
- 只有与订单关联的地址（user/companion）才能推进状态

## 6) 待完成事项
- 校验端到端完整链路（至少 1 笔）
  - 用户：创建订单 -> 支付撮合费 -> 确认完成
  - 陪玩：锁定押金 -> 结算/争议
- 记账充值流程上链验证
  - 管理端 `/api/ledger/credit` 给 user/companion 充值后再推进状态
- 首页/订单入口链上状态对齐（可选）
  - 若需要在首页展示链上订单状态或入口
- 争议裁决（管理员）入口
  - 已接入：后台 `/admin/chain` + `/api/admin/chain/resolve`
- 后台链上同步
  - 已接入：`/api/cron/chain-sync`
- indexer/后端（可选）
  - 若需要全量订单列表或实时推送，可接 Dubhe indexer 或自建服务
