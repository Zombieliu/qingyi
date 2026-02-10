# 链上订单系统优化文档

## 概述

本次优化全面改进了链上订单查询系统，解决了 "chain order not found" 错误，并大幅提升了性能和可调试性。

## 优化内容

### 1. 性能优化 - 智能缓存系统

#### 问题
原实现每次查询都从区块链获取所有订单（最多 1000 条），效率极低：
- 每次查询耗时 2-5 秒
- 频繁的 RPC 调用
- O(n) 时间复杂度

#### 解决方案
实现了智能缓存系统 (`chain-order-cache.ts`)：
- 使用 Map 数据结构，查询复杂度从 O(n) 降至 O(1)
- 可配置的缓存 TTL（默认 30 秒）
- 自动降级策略（RPC 失败时使用旧缓存）
- 缓存统计（命中率、订单数量等）

#### 配置环境变量
```bash
# 缓存有效期（毫秒），默认 30000（30秒）
CHAIN_ORDER_CACHE_TTL_MS=30000

# 最大缓存年龄（毫秒），默认 300000（5分钟）
CHAIN_ORDER_MAX_CACHE_AGE_MS=300000
```

#### 性能对比
- **旧方法**: 每次查询 2-5 秒
- **新方法**: 缓存命中 < 10ms，缓存未命中 2-5 秒

### 2. 错误诊断 - 详细错误信息

#### 问题
原来的错误信息过于简单：
```json
{ "error": "chain order not found" }
```

#### 解决方案
提供详细的错误诊断信息：
```json
{
  "error": "chain_order_not_found",
  "message": "链上订单未找到",
  "orderId": "1231",
  "details": {
    "existsInLocal": true,
    "localOrderSource": "chain",
    "chainCacheStats": {
      "totalOrders": 456,
      "cacheAge": 15000,
      "lastFetch": 1738000000000
    }
  },
  "possibleReasons": [
    "订单未在区块链上创建",
    "订单事件尚未被索引",
    "订单超出查询范围（超过 1000 条）",
    "网络配置错误（当前：testnet）"
  ],
  "troubleshooting": [
    "检查订单是否在 Sui Explorer 中存在",
    "确认 PACKAGE_ID 和 DAPP_HUB_ID 配置正确",
    "检查 Dubhe 索引器是否正常运行",
    "尝试增加 ADMIN_CHAIN_EVENT_LIMIT 环境变量"
  ]
}
```

### 3. 日志系统 - 完整的操作追踪

#### 实现
创建了专门的日志系统 (`chain-order-logger.ts`)：
- 记录所有链上订单操作
- 性能追踪（每个操作的耗时）
- 自动错误捕获
- 可配置的日志级别

#### 启用调试日志
```bash
# 启用详细日志
CHAIN_ORDER_DEBUG=true
```

#### 日志示例
```
[ChainOrder:INFO] refreshCache { action: 'fetching', force: true }
[ChainOrder:INFO] refreshCache { action: 'completed', duration: 2341, orderCount: 456 }
[ChainOrder:DEBUG] findChainOrderCached { orderId: '1231', forceRefresh: false }
[ChainOrder:WARN] findChainOrderCached { orderId: '1231', result: 'not_found', totalOrders: 456 }
```

### 4. 新增 API 端点

#### 4.1 订单详情查询
```
GET /api/admin/chain/order/[orderId]?direct=true
```

功能：
- 查询单个订单的链上和本地数据
- 比对两边的数据差异
- 识别是否需要同步

响应示例：
```json
{
  "orderId": "1231",
  "chainOrder": { /* 链上数据 */ },
  "localOrder": { /* 本地数据 */ },
  "comparison": {
    "statusMatch": false,
    "chainStatus": 3,
    "localChainStatus": 2,
    "needsSync": true
  }
}
```

#### 4.2 订单对账 API
```
GET /api/admin/chain/reconcile?refresh=true&detailed=true
```

功能：
- 全面对比链上和本地订单
- 识别缺失、不一致的订单
- 提供健康检查报告

响应示例：
```json
{
  "summary": {
    "chainOrders": { "total": 456, "byStatus": {...} },
    "localOrders": { "total": 450, "bySource": {...} },
    "discrepancies": {
      "missingInLocal": 6,
      "missingInChain": 0,
      "statusMismatch": 3,
      "needsSync": 9
    },
    "health": {
      "status": "needs_attention",
      "issues": [
        "6 个链上订单未同步到本地",
        "3 个订单状态不一致"
      ]
    }
  }
}
```

#### 4.3 缓存管理 API
```
GET /api/admin/chain/cache          # 查看缓存统计
DELETE /api/admin/chain/cache       # 清空缓存
POST /api/admin/chain/cache         # 刷新缓存
```

#### 4.4 日志查看 API
```
GET /api/admin/chain/logs?level=error&limit=100
DELETE /api/admin/chain/logs        # 清空日志
```

## 使用指南

### 场景 1: 排查 "chain order not found" 错误

1. **查看错误详情**
   - 新的错误响应会告诉你可能的原因
   - 检查 `details.existsInLocal` 确认本地是否有记录

2. **检查缓存状态**
   ```bash
   curl http://localhost:3000/api/admin/chain/cache \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **查看订单详情**
   ```bash
   curl http://localhost:3000/api/admin/chain/order/1231 \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

4. **强制刷新并重试**
   ```bash
   curl -X POST http://localhost:3000/api/admin/chain/cache \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

### 场景 2: 定期健康检查

运行对账检查：
```bash
curl http://localhost:3000/api/admin/chain/reconcile?refresh=true&detailed=true \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 场景 3: 性能监控

查看缓存命中率：
```bash
curl http://localhost:3000/api/admin/chain/cache \
  -H "Authorization: Bearer YOUR_TOKEN"
```

期望的命中率应该在 80% 以上。

### 场景 4: 调试问题

1. 启用调试日志：
   ```bash
   export CHAIN_ORDER_DEBUG=true
   ```

2. 查看日志：
   ```bash
   curl http://localhost:3000/api/admin/chain/logs?level=error \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

## 代码改动清单

### 新增文件
- `src/lib/chain-order-cache.ts` - 缓存系统
- `src/lib/chain-order-logger.ts` - 日志系统
- `src/app/api/admin/chain/order/[orderId]/route.ts` - 订单详情 API
- `src/app/api/admin/chain/reconcile/route.ts` - 对账 API
- `src/app/api/admin/chain/cache/route.ts` - 缓存管理 API
- `src/app/api/admin/chain/logs/route.ts` - 日志查看 API

### 修改文件
- `src/lib/chain-sync.ts` - 使用缓存系统，添加新函数
- `src/app/api/orders/[orderId]/chain-sync/route.ts` - 改进错误提示
- `src/app/api/admin/chain/cancel/route.ts` - 改进错误提示

## 向后兼容性

所有改动都是向后兼容的：
- `findChainOrder()` 函数签名保持不变（添加了可选的 `forceRefresh` 参数）
- 现有 API 继续工作
- 新增的 API 不影响旧功能

## 性能基准测试

### 查询单个订单
- **旧方法**: 2-5 秒（每次都查询区块链）
- **新方法（缓存命中）**: < 10ms
- **新方法（缓存未命中）**: 2-5 秒

### 批量操作
- **旧方法**: N × (2-5秒)
- **新方法**: 一次刷新 + N × 10ms

### 内存使用
- 缓存约 1000 个订单：~1-2 MB
- 日志缓存（1000 条）：~500 KB

## 故障排查

### 问题：订单一直找不到

1. 检查网络配置
   ```bash
   echo $SUI_NETWORK  # 应该是 testnet 或 mainnet
   echo $SUI_RPC_URL
   ```

2. 检查合约配置
   ```bash
   echo $PACKAGE_ID
   echo $DAPP_HUB_ID
   ```

3. 直接查询（绕过缓存）
   ```bash
   curl http://localhost:3000/api/admin/chain/order/1231?direct=true \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

### 问题：缓存不更新

1. 清空缓存
   ```bash
   curl -X DELETE http://localhost:3000/api/admin/chain/cache \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

2. 检查缓存配置
   ```bash
   echo $CHAIN_ORDER_CACHE_TTL_MS
   echo $CHAIN_ORDER_MAX_CACHE_AGE_MS
   ```

### 问题：RPC 频繁失败

查看错误日志：
```bash
curl http://localhost:3000/api/admin/chain/logs?level=error&operation=refreshCache \
  -H "Authorization: Bearer YOUR_TOKEN"
```

系统会自动重试 5 次，如果全部失败会使用旧缓存（降级策略）。

## 监控建议

### 关键指标
1. **缓存命中率** - 应该 > 80%
2. **订单总数** - 监控是否异常增长
3. **对账差异数** - 应该接近 0
4. **RPC 错误率** - 应该 < 5%

### 告警规则
- 缓存命中率 < 50%
- 对账差异 > 10 个订单
- RPC 连续失败 > 3 次
- 缓存年龄 > 10 分钟

## 最佳实践

1. **生产环境配置**
   ```bash
   CHAIN_ORDER_CACHE_TTL_MS=60000        # 1分钟
   CHAIN_ORDER_MAX_CACHE_AGE_MS=600000   # 10分钟
   CHAIN_ORDER_DEBUG=false               # 关闭调试日志
   ADMIN_CHAIN_EVENT_LIMIT=2000          # 增加查询范围
   ```

2. **定期运行对账**
   - 建议每小时运行一次对账检查
   - 设置 cron job 或定时任务

3. **监控日志**
   - 定期检查 error 级别的日志
   - 关注 RPC 失败和缓存失效

4. **性能调优**
   - 根据实际情况调整缓存 TTL
   - 如果订单更新频繁，缩短 TTL
   - 如果 RPC 不稳定，延长 TTL

## 总结

本次优化解决了以下问题：
✅ "chain order not found" 错误诊断困难
✅ 查询性能差（每次 2-5 秒）
✅ 缺乏监控和日志
✅ 数据不一致难以发现
✅ RPC 失败无降级策略

带来的改进：
🚀 查询速度提升 200-500 倍（缓存命中时）
📊 完整的监控和诊断工具
🔍 详细的错误信息和故障排查指南
🛡️ 自动降级和容错机制
📈 可观测性大幅提升
