from __future__ import annotations

import json
import os
from typing import Any, Mapping

import httpx

"""
WMS 能力 provider（数字员工侧）。

把数字员工的 WMS 业务能力族（仓库 / 调拨 / 库存 / 入库 / 出库 / 在途 / 报表）
以 CapabilityBinding 的形式接入 CapabilityRegistry，使其后端能调用主引擎
（CDF Know Claw）已实现并验证存在的 /api/* 端点。

设计为无状态 HTTP 代理：
  - 构造期不发起任何网络请求（仅创建 httpx.Client），因此注册到 registry 不会
    在启动期产生副作用；
  - 实际调用在 agent loop 分发到 wms.* 能力时才发生；
  - 主引擎不可达时返回结构化错误，不抛异常中断调用方。

启用方式：设置环境变量 STAFFDECK_WMS_CAPABILITIES=1（默认关闭），并在 agent
loop 中增加把 wms.* 能力路由到本 provider 方法的分发逻辑（见 local_registry.py
顶部注释）。
"""

WMS_ENGINE_BASE_URL = os.environ.get("CDFKNOW_ENGINE_BASE_URL", "http://127.0.0.1:3001")
WMS_ENGINE_TIMEOUT = float(os.environ.get("CDFKNOW_ENGINE_TIMEOUT", "15"))


class WmsRuntime:
    """Proxy provider forwarding WMS capability operations to the main engine API."""

    provider_id = "wms_engine_proxy"
    contract_version = "wms.v1"
    deployment_id = "engine-http"

    def __init__(self, base_url: str | None = None, timeout: float | None = None) -> None:
        self.base_url = base_url or WMS_ENGINE_BASE_URL
        self.timeout = timeout or WMS_ENGINE_TIMEOUT
        self._client = httpx.Client(base_url=self.base_url, timeout=self.timeout)

    # ---- generic dispatcher -------------------------------------------------
    def call(
        self,
        method: str,
        path: str,
        *,
        params: Mapping[str, Any] | None = None,
        json_body: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> dict[str, Any]:
        try:
            resp = self._client.request(
                method, path, params=params, json=json_body, headers=headers
            )
            resp.raise_for_status()
            try:
                return {"ok": True, "data": resp.json()}
            except ValueError:
                return {"ok": True, "data": {"text": resp.text}}
        except httpx.HTTPStatusError as exc:
            return {
                "ok": False,
                "status_code": exc.response.status_code,
                "detail": exc.response.text[:500],
            }
        except httpx.HTTPError as exc:
            return {"ok": False, "error": str(exc)}

    # ---- domain helpers (mirror server/routes real endpoints) --------------
    def list_warehouses(self, **params: Any) -> dict[str, Any]:
        return self.call("GET", "/api/warehouses", params=params)

    def get_warehouse(self, warehouse_id: str) -> dict[str, Any]:
        return self.call("GET", f"/api/warehouses/{warehouse_id}")

    def create_warehouse(self, body: Mapping[str, Any]) -> dict[str, Any]:
        return self.call("POST", "/api/warehouses", json_body=body)

    def update_warehouse(self, warehouse_id: str, body: Mapping[str, Any]) -> dict[str, Any]:
        return self.call("PUT", f"/api/warehouses/{warehouse_id}", json_body=body)

    def list_transfer_orders(self, **params: Any) -> dict[str, Any]:
        return self.call("GET", "/api/transfer-orders", params=params)

    def create_transfer_order(self, body: Mapping[str, Any]) -> dict[str, Any]:
        return self.call("POST", "/api/transfer-orders", json_body=body)

    def submit_transfer_order(self, transfer_id: str) -> dict[str, Any]:
        return self.call("POST", f"/api/transfer-orders/{transfer_id}/submit")

    def receive_transfer_order(self, transfer_id: str) -> dict[str, Any]:
        return self.call("POST", f"/api/transfer-orders/{transfer_id}/receive")

    # 以下域在主引擎有独立路由文件（inventory/inbound/outbound/transit/metrics/reports），
    # 通过通用 dispatcher 透传；具体子路径以各路由文件实际实现为准。
    def proxy(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        return self.call(method, path, **kwargs)


def build_wms_runtime() -> WmsRuntime:
    """Rehydration factory used by the registry rehydrator."""
    return WmsRuntime()
