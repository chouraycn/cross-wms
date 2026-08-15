/**
 * EmployeeCapabilitiesDialog — 员工能力清单（技能 / 工具 / MCP）
 *
 * 数据源：GET /api/enterprise/agents/:agentId/capabilities（后端聚合
 * sd_agent_resource_bindings + sd_skills + sd_tools，能力清单 LLM 可自动发现，
 * 标准见 deliverables/2026-08-15-数字员工能力闭环标准.md §3）。
 */
import { useEffect, useState } from 'react';
import { notify } from '@/components/ui/app-toast';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { api, TENANT_ID } from '../api/client';

export type AgentCapabilities = {
  agentId: string;
  skills: Array<{
    id: string;
    name: string;
    description: string;
    version?: string;
    status?: string;
    triggers?: string[];
  }>;
  tools: Array<{
    id: string;
    name: string;
    description: string;
    toolType: string;
    method?: string;
    url?: string;
    mcpServerId?: string | null;
    mcpToolName?: string | null;
  }>;
  mcps: Array<{
    serverId: string;
    tools: Array<{ name: string; description: string }>;
  }>;
};

const SECTION_TITLE_CLASS = 'text-[13px] font-semibold text-[#18181A]';
const SECTION_COUNT_CLASS = 'text-[11px] text-[#757F9C]';
const ITEM_ROW_CLASS = 'rounded-[12px] border border-[#eef0f4] bg-white px-[12px] py-[10px]';
const TAG_CLASS = 'rounded-[6px] bg-[#f6f6f6] px-[6px] py-px text-[11px] text-[#757F9C]';

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-[6px]">
      <span className={SECTION_TITLE_CLASS}>{title}</span>
      <span className={SECTION_COUNT_CLASS}>{count} 项</span>
    </div>
  );
}

export default function EmployeeCapabilitiesDialog({
  agentId,
  agentName,
  open,
  onClose,
}: {
  agentId: string | null;
  agentName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [caps, setCaps] = useState<AgentCapabilities | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !agentId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setCaps(null);
    api
      .get<AgentCapabilities>(`/api/enterprise/agents/${encodeURIComponent(agentId)}/capabilities?tenant_id=${TENANT_ID}`)
      .then((data) => {
        if (cancelled) return;
        setCaps(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载能力清单失败');
        notify.error(err instanceof Error ? err.message : '加载能力清单失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, agentId]);

  const skillCount = caps?.skills.length ?? 0;
  const toolCount = caps?.tools.length ?? 0;
  const mcpCount = caps?.mcps.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[80vh] w-[640px] max-w-[92vw] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>能力清单</DialogTitle>
          <DialogDescription>
            {agentName} 的可执行能力（技能 / 工具 / MCP），由系统实时聚合
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col gap-[12px] py-[24px]">
            <div className="h-[14px] w-[120px] animate-pulse rounded-[6px] bg-[#f0f1f4]" />
            <div className="h-[64px] animate-pulse rounded-[12px] bg-[#f6f6f8]" />
            <div className="h-[64px] animate-pulse rounded-[12px] bg-[#f6f6f8]" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-[12px] bg-[#fef2f2] px-[12px] py-[10px] text-[12px] text-[#d20b0b]">
            {error}
          </div>
        )}

        {!loading && !error && caps && (
          <div className="flex flex-col gap-[20px]">
            {/* 技能 */}
            <section className="flex flex-col gap-[8px]">
              <SectionHeader title="技能" count={skillCount} />
              {skillCount === 0 && (
                <p className="text-[12px] text-[#a7adbb]">未绑定技能（可在「技能」页为员工挂载 SOP/领域技能）</p>
              )}
              {caps.skills.map((skill) => (
                <div key={skill.id} className={ITEM_ROW_CLASS}>
                  <div className="flex items-center gap-[6px]">
                    <span className="text-[12px] font-medium text-[#18181A]">{skill.name}</span>
                    {skill.version && <span className={TAG_CLASS}>v{skill.version}</span>}
                    {skill.status === 'available' && <span className={TAG_CLASS}>已停用</span>}
                  </div>
                  {skill.description && (
                    <p className="mt-[4px] line-clamp-2 text-[11px] leading-[16px] text-[#757F9C]">
                      {skill.description}
                    </p>
                  )}
                  {skill.triggers && skill.triggers.length > 0 && (
                    <div className="mt-[6px] flex flex-wrap gap-[6px]">
                      {skill.triggers.map((trigger) => (
                        <span key={trigger} className={TAG_CLASS}>
                          {trigger}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>

            {/* 工具 */}
            <section className="flex flex-col gap-[8px]">
              <SectionHeader title="工具" count={toolCount} />
              {toolCount === 0 && (
                <p className="text-[12px] text-[#a7adbb]">员工工具目录为空（内置工具可在「工具」页配置）</p>
              )}
              {caps.tools.map((tool) => (
                <div key={tool.id} className={ITEM_ROW_CLASS}>
                  <div className="flex items-center gap-[6px]">
                    <span className="text-[12px] font-medium text-[#18181A]">{tool.name}</span>
                    {tool.method && <span className={TAG_CLASS}>{tool.method}</span>}
                    {tool.toolType && <span className={TAG_CLASS}>{tool.toolType}</span>}
                  </div>
                  {tool.description && (
                    <p className="mt-[4px] line-clamp-2 text-[11px] leading-[16px] text-[#757F9C]">
                      {tool.description}
                    </p>
                  )}
                </div>
              ))}
            </section>

            {/* MCP */}
            <section className="flex flex-col gap-[8px]">
              <SectionHeader title="MCP 服务" count={mcpCount} />
              {mcpCount === 0 && (
                <p className="text-[12px] text-[#a7adbb]">未绑定 MCP 服务（可在「MCP」页为员工接入）</p>
              )}
              {caps.mcps.map((mcp) => (
                <div key={mcp.serverId} className={ITEM_ROW_CLASS}>
                  <div className="flex items-center gap-[6px]">
                    <span className="text-[12px] font-medium text-[#18181A]">{mcp.serverId}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {mcp.tools.length} 工具
                    </Badge>
                  </div>
                  {mcp.tools.length > 0 && (
                    <div className="mt-[6px] flex flex-wrap gap-[6px]">
                      {mcp.tools.map((leaf) => (
                        <span key={leaf.name} className={TAG_CLASS} title={leaf.description || undefined}>
                          {leaf.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>

            {skillCount === 0 && toolCount === 0 && mcpCount === 0 && (
              <p className="text-center text-[12px] text-[#a7adbb]">
                该员工暂无可执行能力，请先在「技能 / 工具 / MCP」页完成装配
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
