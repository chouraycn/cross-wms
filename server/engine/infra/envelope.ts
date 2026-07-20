// 移植自 openclaw/src/infra/outbound/envelope.ts
// 降级：ReplyPayload / OutboundDeliveryJson 等类型简化

export type OutboundDeliveryJson = {
  ok: boolean;
  channel?: string;
  target?: string;
  [key: string]: unknown;
};

export type OutboundPayloadJson = {
  text?: string;
  mediaUrl?: string;
  [key: string]: unknown;
};

export type OutboundResultEnvelope = {
  payloads?: OutboundPayloadJson[];
  meta?: unknown;
  delivery?: OutboundDeliveryJson;
};

/** Builds the outbound result envelope, flattening plain delivery-only results by default. */
export function buildOutboundResultEnvelope(params: {
  payloads?: readonly OutboundPayloadJson[];
  meta?: unknown;
  delivery?: OutboundDeliveryJson;
  flattenDelivery?: boolean;
}): OutboundResultEnvelope | OutboundDeliveryJson {
  const hasPayloads = params.payloads !== undefined && params.payloads.length > 0;
  const payloads = params.payloads;

  if (params.flattenDelivery !== false && params.delivery && !params.meta && !hasPayloads) {
    return params.delivery;
  }

  return {
    ...(hasPayloads ? { payloads: [...(payloads as readonly OutboundPayloadJson[])] } : {}),
    ...(params.meta ? { meta: params.meta } : {}),
    ...(params.delivery ? { delivery: params.delivery } : {}),
  };
}
