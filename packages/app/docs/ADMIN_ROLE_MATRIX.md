# 后台角色权限矩阵

角色层级：`admin > finance > ops > viewer`（高权限包含低权限）

## 页面权限

| 页面 | viewer | ops | finance | admin | 说明 |
| --- | --- | --- | --- | --- | --- |
| `/admin` 运营概览 | 查看 | 查看 | 查看 | 查看 | 只读指标 |
| `/admin/orders` 订单调度 | 查看 | 编辑/派单/删除/导出 | 同 ops | 查看 | viewer 只读，导出仅 ops+ |
| `/admin/players` 打手管理 | 查看 | 新增/编辑/删除 | 同 ops | 查看 | viewer 只读 |
| `/admin/announcements` 公告资讯 | 查看 | 发布/编辑/归档/删除 | 同 ops | 查看 | viewer 只读 |
| `/admin/support` 客服工单 | - | 查看/处理 | 同 ops | 查看 | 运营处理 |
| `/admin/coupons` 优惠卡券 | - | 查看/配置 | 同 ops | 查看 | 运营配置 |
| `/admin/vip` 会员管理 | - | 查看/处理 | 同 ops | 查看 | 会员/申请处理 |
| `/admin/guardians` 护航申请 | - | 查看/审核 | 同 ops | 查看 | 运营审核 |
| `/admin/analytics` 增长数据 | - | - | - | 查看 | 仅管理员 |
| `/admin/ledger` 记账中心 | - | - | 查看/操作 | 查看 | 财务处理 |
| `/admin/mantou` 馒头提现 | - | - | 查看/审核 | 查看 | 财务审核 |
| `/admin/invoices` 发票申请 | - | - | 查看/处理 | 查看 | 财务处理 |
| `/admin/chain` 订单对账 | - | - | 查看/裁决 | 查看 | 财务处理 |
| `/admin/payments` 支付事件 | - | - | 查看/核验 | 查看 | 财务处理 |
| `/admin/tokens` 密钥管理 | - | - | - | 查看/创建/禁用 | 仅管理员 |
| `/admin/audit` 审计日志 | - | - | - | 查看 | 仅管理员 |

## 说明

- finance 角色继承 ops 权限（层级式权限）。
- 前端页面已按角色做访问拦截与按钮级控制；服务端 API 以 `requireAdmin` 为准。
- 若需调整权限边界，请同步更新：`admin-shell` 导航、页面按钮、以及对应 API 的角色校验。
