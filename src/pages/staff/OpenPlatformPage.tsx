// 开放广场平台页面：从 StaffDeck 移植，展示数字员工 / 知识库 / 技能 / SOP / 工具五种广场，
// 支持详情抽屉、复制到当前员工、从广场移除等流程。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  ClipboardList,
  FolderOpen,
  RefreshCw,
  Trash2,
  Users,
  Wand2,
} from 'lucide-react';

import AppHeader from '../../components/staff/AppHeader.js';
import { ConfirmDialog } from '../../components/staff/ConfirmDialog.js';
import EmployeeAvatar from '../../components/staff/EmployeeAvatar.js';
import { Button as UIButton } from '../../components/staff/ui/button.js';
import {
  OutlineActionButton,
  SearchCombo,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../components/staff/ui/index.js';
import { notify } from '../../components/staff/ui/app-toast.js';
import { staffTokens } from '../../components/staff/lib/staffTokens.js';
import {
  AGENT_SCOPE_CHANGE_EVENT,
  ENTERPRISE_AGENT_STORAGE_KEY,
} from '../../components/staff/lib/agent-scope-storage.js';
import { api, TENANT_ID } from '../../components/staff/api/client.js';
import {
  isEnterpriseAdmin,
  isGalleryEmployee,
  type EnterpriseAuthUser,
} from '../../components/staff/auth.js';
import {
  agentResourceCount,
  canManageEmployeeAgent,
  employeeDisplayNameWithCreator,
  employeeProfile,
  resourceDisplayNameWithCreator,
} from '../../components/staff/employee.js';
import type {
  AgentProfileRead,
  GeneralSkillRead,
  KnowledgeBaseRead,
  SkillRead,
  ToolRead,
} from '../../components/staff/types/index.js';

type PlatformKind = 'agents' | 'knowledge' | 'general-skills' | 'skills' | 'tools';

type PlatformConfig = {
  kind: PlatformKind;
  title: string;
  subtitle: string;
  detail: string;
  useLabel: string;
  metricLabel: string;
  signals: string[];
  icon: typeof Users;
};

type PlatformItem = {
  id: string;
  deleteKey?: string;
  title: string;
  description: string;
  meta: string;
  tags: string[];
  agent?: AgentProfileRead;
};

const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    kind: 'agents',
    title: '数字员工广场',
    subtitle: '已发布到广场，可在对话端直接使用。',
    detail: '选择一个数字员工查看能力、岗位和服务范围。',
    useLabel: '使用此员工',
    metricLabel: '数字员工',
    signals: ['聊天可用', '支持对话', '查看能力'],
    icon: Users,
  },
  {
    kind: 'knowledge',
    title: '知识库广场',
    subtitle: '发布到广场的知识库，可复制到你的数字员工。',
    detail: '从广场复制到当前数字员工的知识库。',
    useLabel: '复制到知识库',
    metricLabel: '知识库',
    signals: ['知识图谱', '引用来源', '可复制'],
    icon: FolderOpen,
  },
  {
    kind: 'general-skills',
    title: '技能广场',
    subtitle: '浏览器、MCP、查询工具等可复用能力。',
    detail: '从广场复制到当前数字员工的技能。',
    useLabel: '复制到技能',
    metricLabel: '技能',
    signals: ['运行测试', 'MCP/浏览器', '能力复用'],
    icon: Wand2,
  },
  {
    kind: 'skills',
    title: 'SOP 广场',
    subtitle: '可复制和复用的业务流程与执行规范。',
    detail: '从广场复制到当前数字员工的 SOP。',
    useLabel: '复制到 SOP',
    metricLabel: '业务 SOP',
    signals: ['流程推进', '执行规范', '可复制'],
    icon: ClipboardList,
  },
  {
    kind: 'tools',
    title: '工具广场',
    subtitle: '可开放给员工调用和测试的工具能力。',
    detail: '前往工具页按现有流程配置和测试工具。',
    useLabel: '前往工具页',
    metricLabel: '工具能力',
    signals: ['调用权限', '测试可用', '工具配置'],
    icon: Briefcase,
  },
];

const PLATFORM_BY_KIND = new Map(PLATFORM_CONFIGS.map((item) => [item.kind, item]));

function platformCountLabel(kind: PlatformKind): string {
  return kind === 'agents' ? '员工' : '内容';
}

function isEmptyDefaultKnowledgeBase(item: KnowledgeBaseRead): boolean {
  return (
    item.name === '默认知识库'
    && item.document_count === 0
    && item.bucket_count === 0
    && item.chunk_count === 0
  );
}

type OpenPlatformPageProps = {
  currentUser?: EnterpriseAuthUser;
  isAdmin?: boolean;
  onLogout?: () => void;
};

export default function OpenPlatformPage({
  currentUser,
  isAdmin = false,
  onLogout,
}: OpenPlatformPageProps = {}) {
  const navigate = useNavigate();
  const { kind } = useParams<{ kind?: PlatformKind }>();
  const selectedKind = kind && PLATFORM_BY_KIND.has(kind) ? kind : undefined;

  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRead[]>([]);
  const [generalSkills, setGeneralSkills] = useState<GeneralSkillRead[]>([]);
  const [skills, setSkills] = useState<SkillRead[]>([]);
  const [tools, setTools] = useState<ToolRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingItemKey, setDeletingItemKey] = useState('');
  const [agentId, setAgentId] = useState(
    () => window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY) || '',
  );
  const [detailItem, setDetailItem] = useState<{ kind: PlatformKind; item: PlatformItem } | null>(
    null,
  );
  const [confirmTarget, setConfirmTarget] = useState<{ kind: PlatformKind; item: PlatformItem } | null>(null);

  useEffect(() => {
    const onScopeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId?: string }>).detail;
      const nextAgentId =
        detail?.agentId
        || window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY)
        || '';
      setAgentId(nextAgentId);
    };
    window.addEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
    return () => window.removeEventListener(AGENT_SCOPE_CHANGE_EVENT, onScopeChange);
  }, []);

  const loadPlatformData = useCallback(async () => {
    setLoading(true);
    try {
      const agentRows = await api.get<AgentProfileRead[]>(
        `/agents?tenant_id=${TENANT_ID}`,
      );
      const overall = agentRows.find((item) => item.is_overall);
      const overallSuffix = overall ? `&agent_id=${encodeURIComponent(overall.id)}` : '';
      const [kbRows, generalRows, skillRows, toolRows] = await Promise.all([
        api.get<KnowledgeBaseRead[]>(
          `/knowledge-bases?tenant_id=${TENANT_ID}${overallSuffix}`,
        ),
        api.get<GeneralSkillRead[]>(
          `/general-skills?tenant_id=${TENANT_ID}${overallSuffix}`,
        ),
        overall
          ? api.get<SkillRead[]>(`/agents/${overall.id}/skills?tenant_id=${TENANT_ID}`)
          : Promise.resolve([] as SkillRead[]),
        api.get<ToolRead[]>(`/tools?tenant_id=${TENANT_ID}${overallSuffix}`),
      ]);
      setAgents(agentRows);
      setKnowledgeBases(kbRows);
      setGeneralSkills(generalRows);
      setSkills(skillRows);
      setTools(toolRows);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载开放广场失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlatformData();
  }, [loadPlatformData]);

  const visibleAgents = useMemo(
    () => agents.filter(
      (item) => !item.is_overall && item.status === 'active' && isGalleryEmployee(item),
    ),
    [agents],
  );
  const overallAgent = agents.find((item) => item.is_overall) || null;
  const canManagePlatform = isAdmin || isEnterpriseAdmin(currentUser);
  const currentAgent = agents.find((item) => item.id === agentId);
  const targetEmployee =
    currentAgent && canManageEmployeeAgent(currentAgent, currentUser)
      ? currentAgent
      : agents.find(
          (item) => canManageEmployeeAgent(item, currentUser) && !item.is_overall,
        );

  const platformItems = useMemo<Record<PlatformKind, PlatformItem[]>>(
    () => ({
      agents: visibleAgents.map((item) => {
        const profile = employeeProfile(item);
        return {
          id: item.id,
          deleteKey: item.id,
          title: employeeDisplayNameWithCreator(item),
          description: item.description || '广场开放的数字员工。',
          meta: profile.roleName,
          tags: [
            item.status === 'active' ? '在线' : '下线',
            `SOP ${agentResourceCount(item, 'skill')}`,
            `技能 ${agentResourceCount(item, 'general_skill')}`,
          ],
          agent: item,
        };
      }),
      knowledge: knowledgeBases
        .filter((item) => item.status === 'active' && !isEmptyDefaultKnowledgeBase(item))
        .map((item) => ({
          id: item.id,
          deleteKey: item.id,
          title: resourceDisplayNameWithCreator(item.name, item),
          description: item.description || '广场沉淀的知识库。',
          meta: `${item.document_count} 文档 / ${item.bucket_count} 目录 / ${item.chunk_count} 引用`,
          tags: [item.version || 'v1.0.0', item.branch_sync_state || '广场版'],
        })),
      'general-skills': generalSkills
        .filter((item) => item.status === 'published')
        .map((item) => ({
          id: item.id,
          deleteKey: item.slug,
          title: resourceDisplayNameWithCreator(item.name, item),
          description: item.description || '可复制到当前数字员工的技能。',
          meta: item.slug,
          tags: [item.homepage ? '外部能力' : '内置能力', '已启用'],
        })),
      skills: skills
        .filter((item) => item.status === 'published')
        .map((item) => ({
          id: item.id,
          deleteKey: item.skill_id,
          title: resourceDisplayNameWithCreator(item.name, item),
          description: item.description || '可复制和复用的业务 SOP。',
          meta: `${item.skill_id} / ${item.version}`,
          tags: [
            item.business_domain || '业务流程',
            `${item.total_call_count || item.call_count || 0} 次调用`,
          ],
        })),
      tools: tools
        .filter((item) => item.enabled)
        .map((item) => ({
          id: item.id,
          deleteKey: item.id,
          title: resourceDisplayNameWithCreator(item.display_name || item.name, item),
          description: item.description || '可配置到员工工具的工具。',
          meta: `${item.bucket || '工具'} / ${item.tool_type.toUpperCase()}`,
          tags: [item.method, item.enabled ? '已启用' : '已停用'],
        })),
    }),
    [generalSkills, knowledgeBases, skills, tools, visibleAgents],
  );

  const platformStats = PLATFORM_CONFIGS.map((config) => ({
    ...config,
    count: platformItems[config.kind].length,
  }));

  function ensureTargetEmployee(): boolean {
    if (!targetEmployee) {
      notify.warning('请先选择一个员工，再从广场复制资源。');
      return false;
    }
    if (targetEmployee.id !== agentId) {
      window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, targetEmployee.id);
      window.dispatchEvent(
        new CustomEvent(AGENT_SCOPE_CHANGE_EVENT, { detail: { agentId: targetEmployee.id } }),
      );
      setAgentId(targetEmployee.id);
    }
    return true;
  }

  async function markPlatformAgentUsed(agent: AgentProfileRead) {
    const metadata = agent.metadata || {};
    if (metadata.used_by_current_user !== true && metadata.chat_used_by_current_user !== true) {
      await api.post<AgentProfileRead>(`/chat/agents/${agent.id}/use?tenant_id=${TENANT_ID}`, {});
    }
    setAgents((current) => current.map(
      (item) => (item.id === agent.id
        ? {
          ...item,
          metadata: {
            ...(item.metadata || {}),
            used_by_current_user: true,
            chat_used_by_current_user: true,
          },
        }
        : item),
    ));
    window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, agent.id);
    window.dispatchEvent(
      new CustomEvent(AGENT_SCOPE_CHANGE_EVENT, { detail: { agentId: agent.id } }),
    );
    setAgentId(agent.id);
  }

  async function usePlatformItem(platformKind: PlatformKind, itemId?: string) {
    if (platformKind === 'agents') {
      const agent = visibleAgents.find((item) => item.id === itemId) || visibleAgents[0];
      if (!agent) {
        notify.warning('广场暂无可用数字员工');
        return;
      }
      try {
        await markPlatformAgentUsed(agent);
        navigate('/enterprise/dashboard');
      } catch (error) {
        notify.error(error instanceof Error ? error.message : '使用数字员工失败');
      }
      return;
    }
    if (!ensureTargetEmployee()) return;
    const resourceParam = itemId ? `&resourceId=${encodeURIComponent(itemId)}` : '';
    if (platformKind === 'knowledge') navigate(`/enterprise/knowledge?add=plaza${resourceParam}`);
    if (platformKind === 'general-skills') navigate(`/enterprise/general-skills?add=plaza${resourceParam}`);
    if (platformKind === 'skills') navigate(`/enterprise/skills?add=plaza${resourceParam}`);
    if (platformKind === 'tools') navigate('/enterprise/tools?add=plaza');
  }

  function platformItemDeleteKey(platformKind: PlatformKind, item: PlatformItem): string {
    return `${platformKind}:${item.deleteKey || item.id}`;
  }

  function platformDeleteUrl(platformKind: PlatformKind, item: PlatformItem): string {
    const resourceKey = encodeURIComponent(item.deleteKey || item.id);
    const overallSuffix = overallAgent ? `&agent_id=${encodeURIComponent(overallAgent.id)}` : '';
    if (platformKind === 'agents') return `/agents/${resourceKey}?tenant_id=${TENANT_ID}`;
    if (platformKind === 'knowledge') return `/knowledge-bases/${resourceKey}?tenant_id=${TENANT_ID}${overallSuffix}`;
    if (platformKind === 'general-skills') return `/general-skills/${resourceKey}?tenant_id=${TENANT_ID}${overallSuffix}`;
    if (platformKind === 'skills') return `/skills/${resourceKey}?tenant_id=${TENANT_ID}${overallSuffix}`;
    return `/tools/${resourceKey}?tenant_id=${TENANT_ID}${overallSuffix}`;
  }

  async function runDelete() {
    if (!confirmTarget) return;
    const { kind: platformKind, item } = confirmTarget;
    const key = platformItemDeleteKey(platformKind, item);
    setDeletingItemKey(key);
    try {
      if (platformKind === 'agents' && item.agent) {
        const metadata = { ...(item.agent.metadata || {}) };
        metadata.published_to_gallery = false;
        delete metadata.gallery_published_at;
        delete metadata.gallery_published_by;
        await api.put<AgentProfileRead>(`/agents/${item.agent.id}`, {
          tenant_id: TENANT_ID,
          metadata,
        });
      } else {
        await api.delete(platformDeleteUrl(platformKind, item));
      }
      notify.success('已从广场移除');
      setDetailItem((current) => (
        current && current.kind === platformKind && current.item.id === item.id ? null : current
      ));
      setConfirmTarget(null);
      await loadPlatformData();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      setDeletingItemKey('');
    }
  }

  function navigateDetailItem(offset: -1 | 1) {
    if (!detailItem) return;
    const items = platformItems[detailItem.kind];
    const currentIndex = items.findIndex((entry) => entry.id === detailItem.item.id);
    const nextItem = items[currentIndex + offset];
    if (!nextItem) return;
    setDetailItem({ kind: detailItem.kind, item: nextItem });
  }

  const detailConfig = detailItem ? PLATFORM_BY_KIND.get(detailItem.kind) : null;
  const _detailDeleteKey = detailItem ? platformItemDeleteKey(detailItem.kind, detailItem.item) : '';
  const detailDrawerItems = detailItem ? platformItems[detailItem.kind] : [];
  const detailDrawerIndex = detailItem
    ? detailDrawerItems.findIndex((entry) => entry.id === detailItem.item.id)
    : -1;

  // ---- Detail view (selected kind): list all items of one kind --------------
  if (selectedKind) {
    const config = PLATFORM_BY_KIND.get(selectedKind) || PLATFORM_CONFIGS[0];
    const PlatformIcon = config.icon;
    const items = platformItems[selectedKind];
    return (
      <div className="flex flex-col gap-[20px] px-[24px] py-[20px]">
        <AppHeader
          title={config.title}
          description={config.subtitle}
          onLogout={onLogout}
          userName={currentUser?.display_name || currentUser?.username}
          right={
            <div className="flex items-center gap-[8px]">
              <OutlineActionButton
                type="button"
                onClick={() => void loadPlatformData()}
                disabled={loading}
              >
                <RefreshCw className="size-[14px]" />
                刷新
              </OutlineActionButton>
              <OutlineActionButton
                type="button"
                onClick={() => navigate('/enterprise/platform')}
              >
                <ArrowLeft className="size-[14px]" />
                返回广场
              </OutlineActionButton>
            </div>
          }
        />
        <div className="flex items-center gap-[8px] text-[12px] text-[#858b9c]">
          <PlatformIcon className="size-[14px]" />
          <span>
            共 {items.length} {platformCountLabel(selectedKind)}
          </span>
          {config.signals.map((signal) => (
            <span
              key={signal}
              className="rounded-full border border-[#e3e7f1] bg-white px-[8px] py-[2px] text-[11px] text-[#464c5e]"
            >
              {signal}
            </span>
          ))}
        </div>
        {loading ? (
          <div className="rounded-[12px] border border-[#eceef1] bg-white p-[24px] text-center text-[13px] text-[#858b9c]">
            加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-[#e3e7f1] bg-[#fbfcfd] p-[32px] text-center text-[13px] text-[#858b9c]">
            暂无{config.metricLabel}内容
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setDetailItem({ kind: selectedKind, item })}
                className="flex min-h-[140px] w-full flex-col gap-[8px] rounded-[12px] border border-[#eceef1] bg-white p-[16px] text-left transition-colors hover:border-[#cbd3e6] hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
              >
                {selectedKind === 'agents' && item.agent ? (
                  <div className="flex items-center gap-[10px]">
                    <EmployeeAvatar agent={item.agent} size={40} radius={8} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-[#18181a]">{item.title}</p>
                      <p className="truncate text-[12px] text-[#858b9c]">{item.meta}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-[8px]">
                    <span className="grid size-[36px] place-items-center rounded-[8px] bg-[#f3f4f6] text-[#464c5e]">
                      <PlatformIcon className="size-[16px]" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#18181a]">
                      {item.title}
                    </p>
                  </div>
                )}
                <p className="line-clamp-2 text-[12px] leading-[1.55] text-[#858b9c]">
                  {item.description}
                </p>
                <p className="truncate text-[11px] text-[#464c5e]">{item.meta}</p>
                <div className="mt-auto flex flex-wrap gap-[4px]">
                  {item.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-[#e3e7f1] bg-[#f6f7fb] px-[7px] py-px text-[11px] text-[#464c5e]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
        {renderItemDrawer()}
        {renderConfirm()}
      </div>
    );
  }

  // ---- Plaza overview: 5 columns --------------------------------------------
  return (
    <div className="flex min-h-full flex-col box-border px-[48px] pt-[32px] pb-[43px] max-[900px]:px-[16px] xl:h-full xl:min-h-0 xl:overflow-hidden">
      <AppHeader
        className="mb-[24px]"
        onLogout={onLogout}
        userName={currentUser?.display_name || currentUser?.username}
        title="开放广场平台"
        description="浏览广场上的数字员工、知识库、技能、SOP 与工具。"
        right={
          <OutlineActionButton
            type="button"
            onClick={() => void loadPlatformData()}
            disabled={loading}
          >
            <RefreshCw className="size-[14px]" />
            刷新
          </OutlineActionButton>
        }
      />
      <div className="mx-auto grid w-full grid-cols-1 gap-[12px] sm:grid-cols-2 xl:min-h-0 xl:flex-1 xl:grid-cols-5 xl:grid-rows-1">
        {platformStats.map((platform) => {
          const items = platformItems[platform.kind];
          const previews = items.slice(0, 3);
          const PlatformIcon = platform.icon;
          return (
            <div
              key={platform.kind}
              className="flex min-h-0 flex-col rounded-[14px] border border-[#eceef1] bg-white p-[14px]"
            >
              <div className="flex items-center gap-[8px] pb-[10px]">
                <span className="grid size-[26px] place-items-center rounded-[8px] bg-[#f3f4f6] text-[#464c5e]">
                  <PlatformIcon className="size-[14px]" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#18181a]">
                  {platform.title}
                </span>
                <span className="text-[12px] text-[#858b9c]">
                  {platform.count} {platformCountLabel(platform.kind)}
                </span>
              </div>
              <div className="flex flex-wrap gap-[4px] pb-[8px]">
                {platform.signals.map((signal) => (
                  <span
                    key={signal}
                    className="rounded-full border border-[#e3e7f1] bg-[#f6f7fb] px-[7px] py-px text-[11px] text-[#464c5e]"
                  >
                    {signal}
                  </span>
                ))}
              </div>
              <div className="grid min-h-0 flex-1 content-start gap-[8px] overflow-y-auto pr-[2px]">
                {loading ? (
                  <div className="rounded-[10px] border border-dashed border-[#e3e7f1] bg-[#fbfcfd] p-[16px] text-center text-[12px] text-[#858b9c]">
                    加载中…
                  </div>
                ) : previews.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-[#e3e7f1] bg-[#fbfcfd] p-[16px] text-center text-[12px] text-[#858b9c]">
                    暂无内容
                  </div>
                ) : (
                  previews.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDetailItem({ kind: platform.kind, item })}
                      className="flex w-full flex-col gap-[4px] rounded-[10px] border border-[#eceef1] bg-white p-[10px] text-left transition-colors hover:border-[#cbd3e6] hover:bg-[#fbfcfd]"
                    >
                      {platform.kind === 'agents' && item.agent ? (
                        <div className="flex items-center gap-[8px]">
                          <EmployeeAvatar agent={item.agent} size={28} radius={6} />
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#18181a]">
                            {item.title}
                          </span>
                        </div>
                      ) : (
                        <span className="truncate text-[12px] font-medium text-[#18181a]">
                          {item.title}
                        </span>
                      )}
                      <span className="truncate text-[11px] text-[#858b9c]">{item.meta}</span>
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => navigate(`/enterprise/platform/${platform.kind}`)}
                disabled={platform.count === 0}
                className="mt-[10px] h-[28px] rounded-[8px] border border-[#e3e7f1] bg-white text-[12px] text-[#464c5e] transition-colors hover:border-[#cbd3e6] hover:bg-[#f6f7fb] hover:text-[#18181a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                查看全部 ({platform.count})
              </button>
            </div>
          );
        })}
      </div>
      {renderItemDrawer()}
      {renderConfirm()}
    </div>
  );

  function renderItemDrawer() {
    if (!detailItem || !detailConfig) return null;
    const { item } = detailItem;
    const deleteKey = platformItemDeleteKey(detailItem.kind, item);
    const isAgent = detailItem.kind === 'agents' && item.agent;
    const profile = isAgent ? employeeProfile(item.agent) : null;
    const detailText = isAgent
      ? (item.agent?.persona_prompt || item.agent?.description || detailConfig.detail)
      : detailConfig.detail;

    return (
      <Sheet
        open={Boolean(detailItem)}
        onOpenChange={(open) => { if (!open) setDetailItem(null); }}
      >
        <SheetContent
          side="right"
          className="flex w-[min(440px,100vw)] flex-col gap-0 p-0"
        >
          <SheetHeader className="flex flex-col gap-[8px] border-b border-[#eceef1] p-[20px]">
            <div className="flex items-center gap-[10px]">
              {isAgent ? (
                <EmployeeAvatar agent={item.agent} size={48} radius={10} />
              ) : (
                <span className="grid size-[40px] place-items-center rounded-[10px] bg-[#f3f4f6] text-[#464c5e]">
                  <detailConfig.icon className="size-[18px]" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate text-[16px] font-medium text-[#18181a]">
                  {item.title}
                </SheetTitle>
                <p className="truncate text-[12px] text-[#858b9c]">{detailConfig.title}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-[4px]">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[#e3e7f1] bg-[#f6f7fb] px-[7px] py-px text-[11px] text-[#464c5e]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </SheetHeader>

          <div className="grid min-h-0 flex-1 content-start gap-[16px] overflow-y-auto p-[20px]">
            <div className="grid gap-[6px]">
              <p className="text-[12px] font-semibold text-[#858b9c]">描述</p>
              <p className="whitespace-pre-wrap text-[13px] leading-[1.65] text-[#18181a]">
                {item.description}
              </p>
            </div>
            <div className="grid gap-[6px]">
              <p className="text-[12px] font-semibold text-[#858b9c]">分类信息</p>
              <p className="text-[13px] text-[#18181a]">{item.meta}</p>
            </div>
            <div className="grid gap-[6px]">
              <p className="text-[12px] font-semibold text-[#858b9c]">详情</p>
              <p className="whitespace-pre-wrap text-[13px] leading-[1.65] text-[#18181a]">
                {detailText}
              </p>
            </div>
            {isAgent && profile ? (
              <div className="grid gap-[6px]">
                <p className="text-[12px] font-semibold text-[#858b9c]">岗位</p>
                <p className="text-[13px] text-[#18181a]">{profile.roleName}</p>
              </div>
            ) : null}
            {isAgent ? (
              <div className="grid grid-cols-3 gap-[8px]">
                <PlatformStat
                  value={agentResourceCount(item.agent!, 'knowledge_base')}
                  label="资料"
                />
                <PlatformStat
                  value={agentResourceCount(item.agent!, 'general_skill')}
                  label="技能"
                />
                <PlatformStat
                  value={agentResourceCount(item.agent!, 'skill')}
                  label="SOP"
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-[8px] border-t border-[#eceef1] p-[16px]">
            <div className="flex items-center gap-[6px]">
              <button
                type="button"
                onClick={() => navigateDetailItem(-1)}
                disabled={detailDrawerIndex <= 0}
                className="inline-flex size-[28px] items-center justify-center rounded-[8px] border border-[#e3e7f1] bg-white text-[12px] text-[#464c5e] transition-colors hover:bg-[#f6f7fb] disabled:cursor-not-allowed disabled:opacity-50"
              >
                上一项
              </button>
              <button
                type="button"
                onClick={() => navigateDetailItem(1)}
                disabled={detailDrawerIndex < 0 || detailDrawerIndex >= detailDrawerItems.length - 1}
                className="inline-flex size-[28px] items-center justify-center rounded-[8px] border border-[#e3e7f1] bg-white text-[12px] text-[#464c5e] transition-colors hover:bg-[#f6f7fb] disabled:cursor-not-allowed disabled:opacity-50"
              >
                下一项
              </button>
            </div>
            <div className="flex items-center gap-[8px]">
              {canManagePlatform ? (
                <button
                  type="button"
                  onClick={() => setConfirmTarget({ kind: detailItem.kind, item })}
                  disabled={deletingItemKey === deleteKey}
                  className="inline-flex h-[32px] items-center gap-[4px] rounded-[10px] border border-[#fecaca] bg-white px-[12px] text-[12px] text-[#d20b0b] transition-colors hover:bg-[#fef2f2] disabled:opacity-50"
                >
                  <Trash2 className="size-[14px]" />
                  移除
                </button>
              ) : null}
              <UIButton
                sx={staffTokens.primaryButton}
                onClick={() => {
                  setDetailItem(null);
                  void usePlatformItem(detailItem.kind, item.id);
                }}
              >
                {detailConfig.useLabel}
              </UIButton>
            </div>
          </div>
          <SheetDescription className="sr-only">{detailConfig.detail}</SheetDescription>
        </SheetContent>
      </Sheet>
    );
  }

  function renderConfirm() {
    const config = confirmTarget ? PLATFORM_BY_KIND.get(confirmTarget.kind) : null;
    return (
      <ConfirmDialog
        open={Boolean(confirmTarget)}
        onOpenChange={(next) => { if (!next) setConfirmTarget(null); }}
        title={confirmTarget && config ? `删除${config.metricLabel}「${confirmTarget.item.title}」？` : ''}
        description={confirmTarget?.kind === 'agents'
          ? '删除后该数字员工会从广场和员工列表移除，相关资源绑定也会一并清理。'
          : '删除后该广场内容会从开放平台移除，已复制到员工侧的引用可能不再可同步。'}
        loading={Boolean(confirmTarget) && deletingItemKey === (confirmTarget ? platformItemDeleteKey(confirmTarget.kind, confirmTarget.item) : '')}
        onConfirm={() => void runDelete()}
      />
    );
  }
}

function PlatformStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-[2px] rounded-[10px] border border-[#eceef1] bg-[#fbfcfd] p-[8px]">
      <span className="text-[16px] font-semibold text-[#18181a]">{value}</span>
      <span className="text-[11px] text-[#858b9c]">{label}</span>
    </div>
  );
}
