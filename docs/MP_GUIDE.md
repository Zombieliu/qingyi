# 小程序协作指南（Taro）

面向新人：知道小程序代码在哪里、怎么改、怎么联调。

## 1) 目录入口

- 入口：`packages/mp/src/app.ts`
- 页面：`packages/mp/src/pages/**`
- 请求封装：`packages/mp/src/utils/request.ts`
- 平台适配：`packages/mp/src/utils/platform.ts`

## 2) 常见改动场景

### A. 新增页面
1. 新建 `packages/mp/src/pages/<page>/index.tsx`
2. 在 `app.config.ts` 注册页面

### B. 调整 API 请求
1. 修改 `src/utils/request.ts` 统一处理
2. 确认后端 API 可用

### C. 登录/授权问题
- 平台登录封装在 `utils/platform.ts`
- 相关 API 在后端 `/api/auth/*`

## 3) 自测建议

- 使用各平台开发者工具预览
- 重点回归登录、下单、余额/提现
