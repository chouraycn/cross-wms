# 测试报告 — CrossWMS「自然语言库存查询」功能

**QA 工程师**: 严过关 (Yan)
**测试日期**: 2026-05-25
**测试框架**: Vitest 3.0.5
**测试轮次**: Round 2（最终轮）

---

## 总览

| 指标 | 数值 |
|------|------|
| 新增测试文件 | 3 |
| 新增测试用例 | 56 |
| 通过 | 56 ✅ |
| 失败 | 0 |
| 全量回归测试 | 961 tests / 33 files — 全部通过 |
| 覆盖模块 | 3/3（后端服务 / API 路由 / UI 组件） |
| 路由决策 | **→ 工程师（源码 Bug）** |

---

## 测试文件清单

### 1. `server/services/__tests__/inventoryQueryService.test.ts` — 31 tests ✅

| 测试分组 | 用例数 | 状态 |
|---------|--------|------|
| SQL 安全校验 (SQL Security Validation) | 14 | ✅ |
| LIMIT 强制执行 (LIMIT Enforcement) | 6 | ✅ |
| SQL 执行 (SQL Execution) | 11 | ✅ |

**覆盖要点**：
- ✅ SELECT 语句正常放行
- ✅ INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE 关键字拦截
- ✅ ATTACH/PRAGMA 等数据库操作关键字拦截
- ✅ 大小写混合关键字检测
- ✅ 分号注入防护
- ✅ 非 SELECT 语句拒绝（如 SHOW TABLES）
- ✅ 无 LIMIT 时自动追加 LIMIT 200
- ✅ LIMIT 超过 500 时截断为 LIMIT 500
- ✅ LIMIT 边界值（200、500）
- ✅ 尾部分号处理
- ✅ 正常查询返回结果
- ✅ SQL 语法错误 → 友好提示
- ✅ 表/字段不存在 → 友好提示
- ✅ rowCount=LIMIT 时 truncated=true
- ✅ rowCount<LIMIT 时 truncated=false
- ✅ 从 stmt.source 推断列名（空行集时）
- ✅ chartType/chartConfig 透传
- ✅ 响应中不含原始 SQL（安全）
- ✅ 未知错误 → 通用错误消息

### 2. `server/routes/__tests__/inventory-nl-query.test.ts` — 12 tests ✅

| 测试分组 | 用例数 | 状态 |
|---------|--------|------|
| 请求体校验 | 4 | ✅ |
| 成功响应 | 1 | ✅ |
| SQL 预处理 | 1 | ✅ |
| chartType 处理 | 3 | ✅ |
| 错误码映射 | 2 | ✅ |
| chartConfig 透传 | 1 | ✅ |

**覆盖要点**：
- ✅ 缺少 sql → 400
- ✅ 空 sql → 400
- ✅ 纯空白 sql → 400
- ✅ 非 string 类型 sql → 400
- ✅ 成功查询 → 200 + code: 0
- ✅ SQL 自动 trim
- ✅ 默认 chartType 为 "table"
- ✅ 合法 chartType 透传
- ✅ 无效 chartType 降级为 "table"
- ✅ SQL 校验失败 → 403
- ✅ SQL 语法错误 → 500
- ✅ chartConfig 透传

### 3. `src/components/CrossWmsChat/__tests__/QueryResultRenderer.test.tsx` — 13 tests ✅

| 测试分组 | 用例数 | 状态 |
|---------|--------|------|
| 表格渲染 | 2 | ✅ |
| 图表渲染 | 3 | ✅ |
| 降级/空状态 | 3 | ✅ |
| 加载状态 | 2 | ✅ |
| CSV 导出 | 2 | ✅ |
| 截断提示 | 1 | ✅ |

**覆盖要点**：
- ✅ 表格渲染（MUI DataGrid）
- ✅ 行数显示
- ✅ 柱状图/折线图/饼图渲染（Recharts）
- ✅ 未知 chartType 降级为表格
- ✅ 空行数据处理
- ✅ 空列数据处理
- ✅ 加载中 spinner 显示
- ✅ 加载时隐藏结果
- ✅ CSV 导出按钮（aria-label 定位）
- ✅ 导出点击触发 createObjectURL
- ✅ 截断行数提示

---

## 🐛 源码 Bug 报告（→ 路由至工程师 Alex 修复）

### Bug #1: `executeSafely()` 中的死代码导致双重 `stmt.all()` 调用及未处理 Promise 拒绝

**文件**: `server/services/inventoryQueryService.ts`
**行号**: 154-172
**严重级别**: 🔴 High（生产环境下可能导致未捕获异常）

**问题描述**:
`executeSafely()` 方法中存在一段**死代码**——一个 `executionPromise`（第 154-172 行）以及配套的 `timeoutPromise`（第 174-178 行）。这些 Promise 被创建后**从未被 await 或 .catch()**，且 `executionPromise` 的执行器中调用了 `db.prepare(sql).stmt.all()`。

实际的查询执行发生在第 184 行的 `this.executeWithTimeout(sql)` 调用中。这导致：

1. **双重 `stmt.all()` 调用**：每次 `executeSafely()` 执行时，`stmt.all()` 会被调用两次——一次在 `executionPromise` 内（死代码路径），一次在 `executeWithTimeout()` 内（实际执行路径）。第二次调用是无意义的重复 I/O。

2. **未处理的 Promise 拒绝**：当 SQL 执行出错时，`executionPromise` 内的 `stmt.all()` 抛出异常，导致 Promise reject。但该 Promise 从未被 await 或 .catch()，产生 **UnhandledPromiseRejection** 警告。在 Node.js 未来版本中，未处理的 Promise 拒绝可能终止进程。

3. **超时逻辑失效**：`timeoutPromise` 和 `Promise.race` 的设计意图是实现查询超时控制，但由于 `better-sqlite3` 是同步 API，同步调用 `stmt.all()` 会阻塞事件循环，`Promise.race` 永远无法在同步执行期间介入超时。整个 `executionPromise` + `timeoutPromise` + `Promise.race` 的设计对同步 API 无效。

**测试中的规避措施**:
测试通过让 mock `stmt.all` 在第一次调用（死代码路径）返回正常结果，第二次调用（实际执行路径）才抛出错误，规避了未处理拒绝问题。但这不是生产环境的解决方案。

**建议修复**:
删除第 154-178 行（`executionPromise` 和 `timeoutPromise` 声明），保留第 184 行的 `this.executeWithTimeout(sql)` 作为唯一执行路径。`executeWithTimeout()` 已正确实现了查询执行逻辑。如需真正的超时控制，应考虑 worker_thread 或 process 隔离方案。

```typescript
// 修复后的 executeSafely 方法
private executeSafely(sql: string): SafeQueryResult | { error: string } {
  try {
    // 直接调用 executeWithTimeout，移除无效的 Promise 包装
    const result = this.executeWithTimeout(sql);
    return result;
  } catch (err) {
    // ... 错误处理保持不变
  }
}
```

---

## 已知限制

1. **超时控制**：当前 `executeWithTimeout()` 方法名含"timeout"但实际无超时机制（better-sqlite3 同步阻塞无法被 Promise.race 中断）。这是架构层面的限制，非本次测试范围。
2. **jsdom 限制**：CSV 导出的实际文件下载行为（`<a>` 标签 click → navigation）在 jsdom 中不可用，测试仅验证到 `createObjectURL` 调用。

---

## 结论

**56 个新增测试全部通过，961 个全量回归测试全部通过，零回归。**

源码存在 1 个高严重级别 Bug（死代码导致双重调用 + 未处理 Promise 拒绝），需路由至工程师 Alex 修复。修复后建议运行回归测试验证。
