# 小程序多端导入与预览（dist 分目录）

从现在开始，Taro 会按平台输出到 `dist/{平台}`，并自动把对应平台的项目配置复制进去：
- 微信：`dist/weapp`
- 抖音：`dist/tt`
- 支付宝：`dist/alipay`

## 1. 先编译目标平台

在仓库根目录执行其一：

```bash
pnpm -C packages/mp dev:weapp
pnpm -C packages/mp dev:tt
pnpm -C packages/mp dev:alipay
```

## 2. 导入到对应开发者工具

### 微信开发者工具
有两种方式：

方式 A（推荐）：导入项目时选择 `packages/mp/dist/weapp`

方式 B：导入 `packages/mp` 根目录  
`project.config.json` 里已指向 `dist/weapp`

> 如果你“选不了 dist 目录”，通常是因为没先编译，或 `dist/weapp` 里没有 `project.config.json`。

### 抖音开发者工具
导入目录：`packages/mp/dist/tt`（内置 `project.config.json`）

### 支付宝开发者工具
导入目录：`packages/mp/dist/alipay`（内置 `mini.project.json`）

## 3. 常见问题

- **提示缺少配置文件 / 目录不可选**
  - 先跑一次对应平台的构建命令
  - 微信/抖音：确认 `dist/{平台}` 下有 `project.config.json`
  - 支付宝：确认 `dist/alipay` 下有 `mini.project.json`

- **切换平台没变化**
  - 记得切换并重启对应平台的 `dev:*` 命令
  - 同时打开多个平台，请分别保持各自的 watch 进程

- **appid**
  - 当前默认 `touristappid` 仅用于本地预览
  - 抖音/支付宝使用 `testAppId` 占位，真机/支付请替换成真实 AppID
