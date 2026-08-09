from __future__ import annotations

import os
from typing import Any

from app.capabilities.contracts import KnowledgeRuntime
from app.capabilities.local_knowledge import LocalKnowledgeRuntime
from app.capabilities.registry import (
    CapabilityBinding,
    CapabilityRegistry,
    DurableCapabilityBinding,
)
from app.knowledge import KnowledgeService

LOCAL_KNOWLEDGE_DEPLOYMENT = "local-process"
LOCAL_KNOWLEDGE_CONFIG_REVISION = "legacy-local-v1"
LOCAL_KNOWLEDGE_CONTRACT = "knowledge.v1"
LOCAL_KNOWLEDGE_OPERATIONS = {
    "knowledge.scopes": "knowledge.scopes.v1",
    "knowledge.search": "knowledge.search.v1",
    "knowledge.citation": "knowledge.citation.v1",
}


def _model_config_revision(model_config: Any | None) -> str:
    if model_config is None:
        return "none"
    config_id = str(getattr(model_config, "id", "inline"))
    revision = str(getattr(model_config, "config_revision", "inline"))
    return f"{config_id}:{revision}"


def build_local_capability_registry(
    db: Any,
    model_config: Any | None = None,
    *,
    service_factory: Any = KnowledgeService,
) -> CapabilityRegistry:
    """Build explicit Local bindings; this function does not touch AgentLoop."""

    runtime = LocalKnowledgeRuntime(service_factory, db, model_config)
    registry = CapabilityRegistry()
    config_revision = f"{LOCAL_KNOWLEDGE_CONFIG_REVISION}:{_model_config_revision(model_config)}"
    for capability, operation_version in LOCAL_KNOWLEDGE_OPERATIONS.items():
        registry.register(
            CapabilityBinding(
                capability=capability,
                provider_id=runtime.provider_id,
                provider_deployment_id=LOCAL_KNOWLEDGE_DEPLOYMENT,
                service_contract_version=LOCAL_KNOWLEDGE_CONTRACT,
                provider=runtime,
                operation_versions=((capability, operation_version),),
                config_revision=config_revision,
            )
        )

    def rehydrate(binding: DurableCapabilityBinding) -> KnowledgeRuntime:
        if (
            binding.service_contract_version != LOCAL_KNOWLEDGE_CONTRACT
            or binding.config_revision != config_revision
            or binding.capability not in LOCAL_KNOWLEDGE_OPERATIONS
            or dict(binding.operation_versions)
            != {binding.capability: LOCAL_KNOWLEDGE_OPERATIONS[binding.capability]}
        ):
            raise LookupError("local Knowledge binding revision is retired")
        restored = LocalKnowledgeRuntime(service_factory, db, model_config)
        if restored.provider_id != "local_knowledge":
            raise LookupError("local Knowledge provider identity is unavailable")
        return restored

    registry.register_rehydrator(
        runtime.provider_id,
        LOCAL_KNOWLEDGE_DEPLOYMENT,
        rehydrate,
    )

    # ------------------------------------------------------------------
    # WMS 业务能力族（可选，默认关闭）。
    #
    # 启用：STAFFDECK_WMS_CAPABILITIES=1
    # 作用：把仓库/调拨/库存/入库/出库/在途/报表以 CapabilityBinding 形式接入
    #       registry，使数字员工后端可经 WmsRuntime 代理调用主引擎 /api/*。
    # 注意：仅注册不足以让 agent loop 真正调用——还需在 agent loop 中增加把
    #       wms.* 能力路由到 WmsRuntime 方法的分发逻辑（后续接线）。
    # ------------------------------------------------------------------
    if os.environ.get("STAFFDECK_WMS_CAPABILITIES", "0") == "1":
        from app.capabilities.wms_runtime import WmsRuntime, build_wms_runtime

        wms_runtime = WmsRuntime()
        wms_config_revision = "wms-v1"
        WMS_OPERATIONS: dict[str, str] = {
            "wms.warehouse": "wms.warehouse.v1",
            "wms.transfer": "wms.transfer.v1",
            "wms.inventory": "wms.inventory.v1",
            "wms.inbound": "wms.inbound.v1",
            "wms.outbound": "wms.outbound.v1",
            "wms.transit": "wms.transit.v1",
            "wms.reports": "wms.reports.v1",
        }
        for capability, op_version in WMS_OPERATIONS.items():
            registry.register(
                CapabilityBinding(
                    capability=capability,
                    provider_id=wms_runtime.provider_id,
                    provider_deployment_id=wms_runtime.deployment_id,
                    service_contract_version=wms_runtime.contract_version,
                    provider=wms_runtime,
                    operation_versions=((capability, op_version),),
                    config_revision=wms_config_revision,
                )
            )

        def rehydrate_wms(binding: DurableCapabilityBinding) -> WmsRuntime:
            if binding.service_contract_version != wms_runtime.contract_version:
                raise LookupError("wms binding contract version is retired")
            return build_wms_runtime()

        registry.register_rehydrator(
            wms_runtime.provider_id,
            wms_runtime.deployment_id,
            rehydrate_wms,
        )

    registry.seal()
    return registry
