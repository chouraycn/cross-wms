---
name: Oracle 数据库查询
id: oracle
description: 通过 sqlplus 执行 Oracle 数据库 SQL 查询与 PL/SQL 块
group: integration
requires:
  bins: ["sqlplus"]
userInvocable: true
gate: auto
sandboxScope: read
---

使用 `sqlplus` 连接 Oracle 数据库执行只读 SQL 查询与 PL/SQL 块。默认仅做查询，涉及变更的语句需用户确认后再执行。

## 连接方式

- 连接串：`sqlplus -S user/pass@host:port/service`
- 使用 TNS：`sqlplus -S user/pass@TNS_NAME`
- 通过钱包（免密）：`sqlplus -S /@TNS_NAME`
- 建议加 `-S`（静默模式）去除 banner，便于解析输出。
- 不要把口令回显到日志；优先从环境变量或 Oracle Wallet 读取凭证。

## 查询示例

- 执行脚本文件：
  - `sqlplus -S user/pass@db @query.sql`
- 内联 SQL（here-doc）：
  - `sqlplus -S user/pass@db <<'SQL'`
  - `SET PAGESIZE 50 FEEDBACK ON;`
  - `SELECT * FROM dual;`
  - `SQL`
- 格式化输出：
  - `SET COLSEP '|'`、`SET PAGESIZE 0`、`SET HEADING ON`
  - `COLUMN col_name FORMAT A20`

## PL/SQL 执行

- 执行匿名块：
  - `sqlplus -S user/pass@db <<'SQL'`
  - `SET SERVEROUTPUT ON;`
  - `BEGIN`
  - `  DBMS_OUTPUT.PUT_LINE('hello');`
  - `END;`
  - `/`
  - `SQL`
- 调用过程/函数：
  - `EXEC my_proc` 调用存储过程
  - 使用绑定变量传参：`VARIABLE n NUMBER; EXEC :n := 1;`

## 安全

- 默认只读：优先 `SELECT`，`DDL/DML` 需用户明确确认后再执行。
- 不在命令行明文暴露口令，凭证用环境变量或 Oracle Wallet。
- 限制返回行数（`ROWNUM` 或 `FETCH FIRST n ROWS ONLY`）避免结果过大。
