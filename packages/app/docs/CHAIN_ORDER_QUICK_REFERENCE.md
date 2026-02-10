# 链上订单系统 - 快速参考

## 常用 API

### 查询订单详情
```bash
GET /api/admin/chain/order/{orderId}?direct=true
```

### 同步订单
```bash
POST /api/orders/{orderId}/chain-sync
```

### 对账检查
```bash
GET /api/admin/chain/reconcile?refresh=true&detailed=true
```

### 缓存管理
```bash
GET /api/admin/chain/cache           # 查看统计
DELETE /api/admin/chain/cache        # 清空缓存
POST /api/admin/chain/cache          # 刷新缓存
```

### 日志查看
```bash
GET /api/admin/chain/logs?level=error&limit=100
```

## 环境变量

```bash
# 缓存配置
CHAIN_ORDER_CACHE_TTL_MS=30000          # 缓存有效期（毫秒）
CHAIN_ORDER_MAX_CACHE_AGE_MS=300000     # 最大缓存年龄（毫秒）

# 调试
CHAIN_ORDER_DEBUG=true                   # 启用详细日志

# 查询范围
ADMIN_CHAIN_EVENT_LIMIT=1000            # 查询订单数量限制
```

## 故障排查流程

### 问题：订单找不到

1. 查看详细错误信息（已自动包含）
2. 检查订单是否在本地：`GET /api/admin/chain/order/{orderId}`
3. 清空缓存重试：`DELETE /api/admin/chain/cache`
4. 检查对账报告：`GET /api/admin/chain/reconcile?detailed=true`
5. 查看错误日志：`GET /api/admin/chain/logs?level=error`

### 问题：订单状态不对

1. 强制刷新缓存：`POST /api/admin/chain/cache`
2. 同步订单：`POST /api/orders/{orderId}/chain-sync`
3. 检查对账差异：`GET /api/admin/chain/reconcile`

### 问题：性能慢

1. 查看缓存命中率：`GET /api/admin/chain/cache`
2. 如果命中率低，增加 `CHAIN_ORDER_CACHE_TTL_MS`
3. 查看 RPC 错误：`GET /api/admin/chain/logs?level=error`

## 代码示例

### 使用缓存查询订单
```typescript
import { findChainOrder } from "@/lib/chain-sync";

// 使用缓存（推荐）
const order = await findChainOrder(orderId);

// 强制刷新
const order = await findChainOrder(orderId, true);
```

### 批量查询
```typescript
import { findChainOrdersBatch } from "@/lib/chain-order-cache";

const orderIds = ["1", "2", "3"];
const results = await findChainOrdersBatch(orderIds);
```

### 获取统计信息
```typescript
import { getChainOrderStats } from "@/lib/chain-order-cache";

const stats = await getChainOrderStats();
console.log(stats.byStatus); // 按状态分组
```

### 记录日志
```typescript
import { chainOrderLogger } from "@/lib/chain-order-logger";

chainOrderLogger.info("订单处理", { orderId, action: "sync" });
chainOrderLogger.error("处理失败", error, { orderId });
```

## 监控指标

| 指标 | 健康值 | 告警阈值 |
|------|--------|----------|
| 缓存命中率 | > 80% | < 50% |
| 对账差异数 | 0 | > 10 |
| RPC 错误率 | < 1% | > 5% |
| 缓存年龄 | < 1分钟 | > 10分钟 |

## 调试技巧

### 1. 启用详细日志
```bash
export CHAIN_ORDER_DEBUG=true
npm run dev
```

### 2. 查看缓存状态
```bash
curl http://localhost:3000/api/admin/chain/cache \
  -H "Authorization: Bearer ${ADMIN_DASH_TOKEN}"
```

### 3. 直接查询区块链
```bash
curl "http://localhost:3000/api/admin/chain/order/1231?direct=true" \
  -H "Authorization: Bearer ${ADMIN_DASH_TOKEN}"
```

### 4. 完整对账
```bash
curl "http://localhost:3000/api/admin/chain/reconcile?refresh=true&detailed=true" \
  -H "Authorization: Bearer ${ADMIN_DASH_TOKEN}"
```

## 性能基准

- **缓存命中**: < 10ms
- **缓存未命中**: 2-5 秒
- **批量查询 100 个订单**: ~100ms（缓存命中）
- **对账检查**: 2-5 秒

## 最佳实践

1. ✅ 使用缓存查询（默认行为）
2. ✅ 定期运行对账检查（每小时）
3. ✅ 监控缓存命中率
4. ✅ 生产环境关闭 DEBUG 日志
5. ❌ 避免频繁清空缓存
6. ❌ 不要在循环中使用 `direct=true`
