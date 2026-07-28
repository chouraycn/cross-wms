//
//
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
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

  //
  if (selectedKind) {
    const config = PLATFORM_BY_KIND.get(selectedKind) || PLATFORM_CONFIGS[0];
    const PlatformIcon = config.icon;
    const items = platformItems[selectedKind];
    return (
      <Box component="div" sx={{"display":"flex","flexDirection":"column","gap":'20px',"px":'24px',"py":'20px'}}>
        <AppHeader
          title={config.title}
          description={config.subtitle}
          onLogout={onLogout}
          userName={currentUser?.display_name || currentUser?.username}
          right={
            <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
              <OutlineActionButton
                type="button"
                onClick={() => void loadPlatformData()}
                disabled={loading}
              >
                <RefreshCw  size={14} />
                刷新
              </OutlineActionButton>
              <OutlineActionButton
                type="button"
                onClick={() => navigate('/enterprise/platform')}
              >
                <ArrowLeft  size={14} />
                返回广场
              </OutlineActionButton>
            </Box>
          }
         />
        <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px',"fontSize":'12px',"color":"#858b9c"}}>
          <PlatformIcon  size={14} />
          <span>
            共 {items.length} {platformCountLabel(selectedKind)}
          </span>
          {config.signals.map((signal) => (
            <Box component="span"
              key={signal}
             
             sx={{"borderRadius":'50%',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"px":'8px',"py":'2px',"fontSize":'11px',"color":"#464c5e"}}>
              {signal}
            </Box>
          ))}
        </Box>
        {loading ? (
          <Box component="div" sx={{"borderRadius":'12px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'24px',"textAlign":"center","fontSize":'13px',"color":"#858b9c"}}>
            加载中…
          </Box>
        ) : items.length === 0 ? (
          <Box component="div" sx={{"borderRadius":'12px',"border":"1px solid","borderStyle":"dashed","borderColor":'divider',"bgcolor":"#fbfcfd","p":'32px',"textAlign":"center","fontSize":'13px',"color":"#858b9c"}}>
            暂无{config.metricLabel}内容
          </Box>
        ) : (
          <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(1, minmax(0,1fr))","gap":'12px',"sm":{"gridTemplateColumns":"repeat(2, minmax(0,1fr))"},"lg":{"gridTemplateColumns":"repeat(3, minmax(0,1fr))"},"xl":{"gridTemplateColumns":"repeat(4, minmax(0,1fr))"}}}>
            {items.map((item) => (
              <Box component="button"
                key={item.id}
                type="button"
                onClick={() => setDetailItem({ kind: selectedKind, item })}
               
               sx={{"display":"flex","minHeight":'140px',"width":'100%',"flexDirection":"column","gap":'8px',"borderRadius":'12px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'16px',"textAlign":"left","transition":"background-color 0.2s","&:hover":{"borderColor":"#cbd3e6","boxShadow":"0 4px 16px rgba(0,0,0,0.04)"}}}>
                {selectedKind === 'agents' && item.agent ? (
                  <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'10px'}}>
                    <EmployeeAvatar agent={item.agent} size={40} radius={8}  />
                    <Box component="div" sx={{"minWidth":0,"flex":1}}>
                      <Box component="p" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'14px',"fontWeight":500,"color":"#18181a"}}>{item.title}</Box>
                      <Box component="p" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'12px',"color":"#858b9c"}}>{item.meta}</Box>
                    </Box>
                  </Box>
                ) : (
                  <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
                    <Box component="span" sx={{"display":"grid","width":'36px',"height":'36px',"placeItems":"center","borderRadius":'8px',"bgcolor":"#f3f4f6","color":"#464c5e"}}>
                      <PlatformIcon  size={16} />
                    </Box>
                    <Box component="p" sx={{"minWidth":0,"flex":1,"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'14px',"fontWeight":500,"color":"#18181a"}}>
                      {item.title}
                    </Box>
                  </Box>
                )}
                <Box component="p" sx={{"display":"-webkit-box","WebkitBoxOrient":"vertical","WebkitLineClamp":2,"overflow":"hidden","fontSize":'12px',"lineHeight":1.55,"color":"#858b9c"}}>
                  {item.description}
                </Box>
                <Box component="p" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'11px',"color":"#464c5e"}}>{item.meta}</Box>
                <Box component="div" sx={{"mt":"auto","display":"flex","flexWrap":"wrap","gap":'4px'}}>
                  {item.tags.slice(0, 2).map((tag) => (
                    <Box component="span"
                      key={tag}
                     
                     sx={{"borderRadius":'50%',"border":"1px solid","borderColor":'divider',"bgcolor":"#f6f7fb","px":'7px',"py":'1px',"fontSize":'11px',"color":"#464c5e"}}>
                      {tag}
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        )}
        {renderItemDrawer()}
        {renderConfirm()}
      </Box>
    );
  }

  //
  return (
    <Box component="div" sx={{"display":"flex","minHeight":'100%',"flexDirection":"column","boxSizing":"border-box","px":'48px',"pt":'32px',"pb":'43px',"@media (max-width:900px)":{"px":'16px'},"xl":{"height":'100%',"minHeight":0,"overflow":"hidden"}}}>
      <Box sx={{ mb: '24px' }}>
        <AppHeader
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
              <RefreshCw  size={14} />
              刷新
            </OutlineActionButton>
          }
         />
      </Box>
      <Box component="div" sx={{"mx":"auto","display":"grid","width":'100%',"gridTemplateColumns":"repeat(1, minmax(0,1fr))","gap":'12px',"sm":{"gridTemplateColumns":"repeat(2, minmax(0,1fr))"},"xl":{"minHeight":0,"flex":1,"gridTemplateColumns":"repeat(5, minmax(0,1fr))","gridTemplateRows":"repeat(1, minmax(0,1fr))"}}}>
        {platformStats.map((platform) => {
          const items = platformItems[platform.kind];
          const previews = items.slice(0, 3);
          const PlatformIcon = platform.icon;
          return (
            <Box component="div"
              key={platform.kind}
             
             sx={{"display":"flex","minHeight":0,"flexDirection":"column","borderRadius":'14px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'14px'}}>
              <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px',"pb":'10px'}}>
                <Box component="span" sx={{"display":"grid","width":'26px',"height":'26px',"placeItems":"center","borderRadius":'8px',"bgcolor":"#f3f4f6","color":"#464c5e"}}>
                  <PlatformIcon  size={14} />
                </Box>
                <Box component="span" sx={{"minWidth":0,"flex":1,"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'13px',"fontWeight":500,"color":"#18181a"}}>
                  {platform.title}
                </Box>
                <Box component="span" sx={{"fontSize":'12px',"color":"#858b9c"}}>
                  {platform.count} {platformCountLabel(platform.kind)}
                </Box>
              </Box>
              <Box component="div" sx={{"display":"flex","flexWrap":"wrap","gap":'4px',"pb":'8px'}}>
                {platform.signals.map((signal) => (
                  <Box component="span"
                    key={signal}
                   
                   sx={{"borderRadius":'50%',"border":"1px solid","borderColor":'divider',"bgcolor":"#f6f7fb","px":'7px',"py":'1px',"fontSize":'11px',"color":"#464c5e"}}>
                    {signal}
                  </Box>
                ))}
              </Box>
              <Box component="div" sx={{"display":"grid","minHeight":0,"flex":1,"alignContent":"start","gap":'8px',"overflowY":"auto","pr":'2px'}}>
                {loading ? (
                  <Box component="div" sx={{"borderRadius":'10px',"border":"1px solid","borderStyle":"dashed","borderColor":'divider',"bgcolor":"#fbfcfd","p":'16px',"textAlign":"center","fontSize":'12px',"color":"#858b9c"}}>
                    加载中…
                  </Box>
                ) : previews.length === 0 ? (
                  <Box component="div" sx={{"borderRadius":'10px',"border":"1px solid","borderStyle":"dashed","borderColor":'divider',"bgcolor":"#fbfcfd","p":'16px',"textAlign":"center","fontSize":'12px',"color":"#858b9c"}}>
                    暂无内容
                  </Box>
                ) : (
                  previews.map((item) => (
                    <Box component="button"
                      key={item.id}
                      type="button"
                      onClick={() => setDetailItem({ kind: platform.kind, item })}
                     
                     sx={{"display":"flex","width":'100%',"flexDirection":"column","gap":'4px',"borderRadius":'10px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"p":'10px',"textAlign":"left","transition":"background-color 0.2s","&:hover":{"borderColor":"#cbd3e6","bgcolor":"#fbfcfd"}}}>
                      {platform.kind === 'agents' && item.agent ? (
                        <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
                          <EmployeeAvatar agent={item.agent} size={28} radius={6}  />
                          <Box component="span" sx={{"minWidth":0,"flex":1,"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'12px',"fontWeight":500,"color":"#18181a"}}>
                            {item.title}
                          </Box>
                        </Box>
                      ) : (
                        <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'12px',"fontWeight":500,"color":"#18181a"}}>
                          {item.title}
                        </Box>
                      )}
                      <Box component="span" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'11px',"color":"#858b9c"}}>{item.meta}</Box>
                    </Box>
                  ))
                )}
              </Box>
              <Box component="button"
                type="button"
                onClick={() => navigate(`/enterprise/platform/${platform.kind}`)}
                disabled={platform.count === 0}
               
               sx={{"mt":'10px',"height":'28px',"borderRadius":'8px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'12px',"color":"#464c5e","transition":"background-color 0.2s","&:hover":{"borderColor":"#cbd3e6","bgcolor":"#f6f7fb","color":"#18181a"},"&:disabled":{"cursor":"not-allowed","opacity":0.5}}}>
                查看全部 ({platform.count})
              </Box>
            </Box>
          );
        })}
      </Box>
      {renderItemDrawer()}
      {renderConfirm()}
    </Box>
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
          sx={{ display: 'flex', width: 'min(440px,100vw)', flexDirection: 'column', gap: 0, p: 0 }}
        >
          <SheetHeader sx={{ display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '1px solid', borderColor: 'divider', p: '20px' }}>
            <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'10px'}}>
              {isAgent ? (
                <EmployeeAvatar agent={item.agent} size={48} radius={10}  />
              ) : (
                <Box component="span" sx={{"display":"grid","width":'40px',"height":'40px',"placeItems":"center","borderRadius":'10px',"bgcolor":"#f3f4f6","color":"#464c5e"}}>
                  <detailConfig.icon  size={18} />
                </Box>
              )}
              <Box component="div" sx={{"minWidth":0,"flex":1}}>
                <SheetTitle sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '16px', fontWeight: 500, color: '#18181a' }}>
                  {item.title}
                </SheetTitle>
                <Box component="p" sx={{"overflow":"hidden","textOverflow":"ellipsis","whiteSpace":"nowrap","fontSize":'12px',"color":"#858b9c"}}>{detailConfig.title}</Box>
              </Box>
            </Box>
            <Box component="div" sx={{"display":"flex","flexWrap":"wrap","gap":'4px'}}>
              {item.tags.map((tag) => (
                <Box component="span"
                  key={tag}
                 
                 sx={{"borderRadius":'50%',"border":"1px solid","borderColor":'divider',"bgcolor":"#f6f7fb","px":'7px',"py":'1px',"fontSize":'11px',"color":"#464c5e"}}>
                  {tag}
                </Box>
              ))}
            </Box>
          </SheetHeader>

          <Box component="div" sx={{"display":"grid","minHeight":0,"flex":1,"alignContent":"start","gap":'16px',"overflowY":"auto","p":'20px'}}>
            <Box component="div" sx={{"display":"grid","gap":'6px'}}>
              <Box component="p" sx={{"fontSize":'12px',"fontWeight":600,"color":"#858b9c"}}>描述</Box>
              <Box component="p" sx={{"whiteSpace":"pre-wrap","fontSize":'13px',"lineHeight":1.65,"color":"#18181a"}}>
                {item.description}
              </Box>
            </Box>
            <Box component="div" sx={{"display":"grid","gap":'6px'}}>
              <Box component="p" sx={{"fontSize":'12px',"fontWeight":600,"color":"#858b9c"}}>分类信息</Box>
              <Box component="p" sx={{"fontSize":'13px',"color":"#18181a"}}>{item.meta}</Box>
            </Box>
            <Box component="div" sx={{"display":"grid","gap":'6px'}}>
              <Box component="p" sx={{"fontSize":'12px',"fontWeight":600,"color":"#858b9c"}}>详情</Box>
              <Box component="p" sx={{"whiteSpace":"pre-wrap","fontSize":'13px',"lineHeight":1.65,"color":"#18181a"}}>
                {detailText}
              </Box>
            </Box>
            {isAgent && profile ? (
              <Box component="div" sx={{"display":"grid","gap":'6px'}}>
                <Box component="p" sx={{"fontSize":'12px',"fontWeight":600,"color":"#858b9c"}}>岗位</Box>
                <Box component="p" sx={{"fontSize":'13px',"color":"#18181a"}}>{profile.roleName}</Box>
              </Box>
            ) : null}
            {isAgent ? (
              <Box component="div" sx={{"display":"grid","gridTemplateColumns":"repeat(3, minmax(0,1fr))","gap":'8px'}}>
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
              </Box>
            ) : null}
          </Box>

          <Box component="div" sx={{"display":"flex","alignItems":"center","justifyContent":"space-between","gap":'8px',"borderTop":"1px solid","borderColor":'divider',"p":'16px'}}>
            <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'6px'}}>
              <Box component="button"
                type="button"
                onClick={() => navigateDetailItem(-1)}
                disabled={detailDrawerIndex <= 0}
               
               sx={{"display":"inline-flex","width":'28px',"height":'28px',"alignItems":"center","justifyContent":"center","borderRadius":'8px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'12px',"color":"#464c5e","transition":"background-color 0.2s","&:hover":{"bgcolor":"#f6f7fb"},"&:disabled":{"cursor":"not-allowed","opacity":0.5}}}>
                上一项
              </Box>
              <Box component="button"
                type="button"
                onClick={() => navigateDetailItem(1)}
                disabled={detailDrawerIndex < 0 || detailDrawerIndex >= detailDrawerItems.length - 1}
               
               sx={{"display":"inline-flex","width":'28px',"height":'28px',"alignItems":"center","justifyContent":"center","borderRadius":'8px',"border":"1px solid","borderColor":'divider',"bgcolor":'background.paper',"fontSize":'12px',"color":"#464c5e","transition":"background-color 0.2s","&:hover":{"bgcolor":"#f6f7fb"},"&:disabled":{"cursor":"not-allowed","opacity":0.5}}}>
                下一项
              </Box>
            </Box>
            <Box component="div" sx={{"display":"flex","alignItems":"center","gap":'8px'}}>
              {canManagePlatform ? (
                <Box component="button"
                  type="button"
                  onClick={() => setConfirmTarget({ kind: detailItem.kind, item })}
                  disabled={deletingItemKey === deleteKey}
                 
                 sx={{"display":"inline-flex","height":'32px',"alignItems":"center","gap":'4px',"borderRadius":'10px',"border":"1px solid","borderColor":"#fecaca","bgcolor":'background.paper',"px":'12px',"fontSize":'12px',"color":"#d20b0b","transition":"background-color 0.2s","&:hover":{"bgcolor":"#fef2f2"},"&:disabled":{"opacity":0.5}}}>
                  <Trash2  size={14} />
                  移除
                </Box>
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
            </Box>
          </Box>
          <SheetDescription sx={{ position: 'absolute', width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>{detailConfig.detail}</SheetDescription>
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
    <Box component="div" sx={{"display":"flex","flexDirection":"column","alignItems":"center","gap":'2px',"borderRadius":'10px',"border":"1px solid","borderColor":'divider',"bgcolor":"#fbfcfd","p":'8px'}}>
      <Box component="span" sx={{"fontSize":'16px',"fontWeight":600,"color":"#18181a"}}>{value}</Box>
      <Box component="span" sx={{"fontSize":'11px',"color":"#858b9c"}}>{label}</Box>
    </Box>
  );
}
