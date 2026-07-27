/**
 * 执行链路接入状态徽章。
 * 绿色「已接入执行链路」表示该项已接入员工执行链路（可被真实调用）；
 * 灰色「未接入」表示尚未接入。
 */
export function ExecutionBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="inline-flex items-center gap-[4px] rounded-full bg-[#ecfdf3] px-[8px] py-[2px] text-[11px] font-medium text-[#067647]">
      <span className="size-[5px] rounded-full bg-[#12b76a]" />
      已接入执行链路
    </span>
  ) : (
    <span className="inline-flex items-center gap-[4px] rounded-full bg-[#f2f3f7] px-[8px] py-[2px] text-[11px] font-medium text-[#858b9c]">
      未接入
    </span>
  );
}

/** 执行链路状态响应（与 /api/staffdeck/execution-runtime 对齐） */
export type ExecutionRuntimeResponse = {
  code: number;
  data: {
    generalSkills: Record<string, boolean>;
    mcpServers: Array<{ id: string; name: string; enabled: boolean; connected: boolean }>;
  };
  message: string;
};
