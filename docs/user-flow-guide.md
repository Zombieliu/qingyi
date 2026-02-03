# 情谊电竞用户全流程使用指南（链上版本）

> 说明：本流程为“前端触发的真人操作模拟”，同一个 Passkey 地址同时扮演用户与陪玩（仅用于演示/测试）。
> 录屏与截图来自最近一次链上 E2E 流程执行，时间：2026-02-03。

## 0. 前置条件
- 浏览器环境支持 Passkey（HTTPS 或 localhost）。
- 已配置链上环境（`NEXT_PUBLIC_CHAIN_ORDERS=1`）。
- 具备链上测试资金（Sui Testnet）。

---

## 1. Passkey 注册/登录
首次进入系统，点击 Passkey 登录按钮创建钱包并登录。

![](assets/user-flow/01-passkey-login.png)

要点：
- 首次登录即创建 Passkey 地址。
- 成功后会解锁全站功能。

---

## 2. 选择服务并打开托管弹窗
进入「安排」页，选择服务后点击「先托管再呼叫」。

![](assets/user-flow/02-open-escrow.png)

要点：
- 这是用户发起订单入口。
- 会进入托管费用确认弹窗。

---

## 3. 托管费用并创建链上订单
勾选“使用钻石托管费用”，点击“扣减钻石并派单”。

![](assets/user-flow/03-order-created.png)

要点：
- 扣减钻石成功后自动创建链上订单。
- 前端进入“派单中”状态。

---

## 4. 链上订单状态检查
切换到「展示」页，点击“刷新链上订单”查看订单状态（页面每 30 秒自动刷新一次，并显示上次刷新时间）。

![](assets/user-flow/04-chain-order.png)

要点：
- 链上订单会显示订单号与状态。
- 初始状态为“已托管费用”。

---

## 5. 打手接单（付押金）
由陪玩（演示中为同一 Passkey 地址）点击“付押金接单”（会弹出二次确认）。

![](assets/user-flow/05-deposit-locked.png)

要点：
- 成功后订单状态变为“押金已锁定”。
- 表示陪玩已接单。

---

## 6. 用户确认完成
用户点击“确认完成”（会弹出二次确认），订单进入待结算状态。

![](assets/user-flow/06-user-confirmed.png)

要点：
- 成功后状态为“已完成待结算”。
- 进入争议/结算窗口期。

---

## 7. 发起争议
用户点击“发起争议”并填写争议说明（弹窗提交）。

![](assets/user-flow/07-dispute-raised.png)

要点：
- 状态变为“争议中”。
- 需要后台裁决。

---

## 8. 后台裁决
进入后台「链上对账」，找到争议订单并提交裁决。

![](assets/user-flow/08-admin-dispute.png)

要点：
- 可输入服务退款 / 押金扣罚比例。
- 提交后链上执行裁决。

---

## 9. 结算完成
回到前台刷新链上订单，状态变为“已结算”。

![](assets/user-flow/09-settled.png)

要点：
- 订单生命周期结束。
- 资金结算完成。

---

## 附录：录屏与测试产物
- 录屏：`test-results/chain.e2e-chain-e2e-passke-f7a0b-and-resolves-order-on-chain-Chain-E2E---Chromium/video.webm`
- 自动截图：`docs/assets/user-flow/*.png`

## 备注
- 本指南是“链上流程”版本；如需“非链上版本”，可另出一份。
- 当前演示用同一 Passkey 地址扮演用户与陪玩，仅用于测试流程打通。
