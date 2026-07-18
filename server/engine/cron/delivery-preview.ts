import type { CronDelivery, CronDeliveryPreview } from "./types.js";

export function buildDeliveryPreview(delivery: CronDelivery | undefined): CronDeliveryPreview {
  if (!delivery || delivery.mode === "none") {
    return {
      label: "无投递",
      detail: "任务完成后不发送通知",
    };
  }

  if (delivery.mode === "announce") {
    const parts: string[] = [];
    if (delivery.channel) {
      parts.push(delivery.channel);
    }
    if (delivery.to) {
      parts.push(delivery.to);
    }
    if (delivery.accountId) {
      parts.push(`账号: ${delivery.accountId}`);
    }

    return {
      label: "公告投递",
      detail: parts.length > 0 ? parts.join(" - ") : "默认通道",
    };
  }

  if (delivery.mode === "webhook") {
    return {
      label: "Webhook 投递",
      detail: delivery.to ?? "未配置目标",
    };
  }

  return {
    label: "未知模式",
    detail: "",
  };
}