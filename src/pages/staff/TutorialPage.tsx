import Box from '@mui/material/Box';
import { useEffect, useRef, useState } from 'react';

type TocGroup = {
  title: string;
  items: Array<{ id: string; label: string }>;
};

const TOC_GROUPS: TocGroup[] = [
  {
    title: '开始使用',
    items: [
      { id: 'intro', label: '项目简介' },
      { id: 'install', label: '安装说明' },
      { id: 'quickstart', label: '快速开始' },
    ],
  },
  {
    title: '核心功能',
    items: [
      { id: 'core-features', label: '能力总览' },
      { id: 'runtime', label: '运行闭环' },
      { id: 'governance', label: '治理与复盘' },
    ],
  },
  {
    title: '架构说明',
    items: [
      { id: 'architecture', label: '架构概览' },
      { id: 'flow', label: '执行流程' },
    ],
  },
  {
    title: '参考与案例',
    items: [
      { id: 'reference', label: '配置参考' },
      { id: 'development', label: '开发指南' },
      { id: 'showcase', label: '案例展示' },
      { id: 'faq', label: '常见问题' },
    ],
  },
];

const ALL_TOC_IDS = TOC_GROUPS.flatMap((group) => group.items.map((item) => item.id));

type Feature = {
  title: string;
  subtitle: string;
  body: string;
  proof: string;
};

const FEATURES: Feature[] = [
  {
    title: '数字员工编排',
    subtitle: '岗位人设 + 资源绑定',
    body: '为每个数字员工配置岗位人设，绑定技能、通用技能、知识库与工具，形成可独立运营的岗位画像。',
    proof: '支持多员工并行运营，岗位间资源隔离与共享兼顾。',
  },
  {
    title: '对话运行闭环',
    subtitle: '路由 → 技能 → 工具 → 反思',
    body: '用户消息进入路由决策，命中技能后逐步执行节点，按需调用工具，并在反思阶段检查结果质量。',
    proof: '内置思考链、技能执行、工具调用与知识引用的完整 Trace。',
  },
  {
    title: '治理与复盘',
    subtitle: '反馈分析 + 工作记录',
    body: '采集每轮对话的正负反馈，自动归因分桶，结合工作记录回顾员工近期表现。',
    proof: '支持按员工、按时间维度查看反馈分布与执行历史。',
  },
];

type QuickStep = {
  title: string;
  body: string;
  outcome: string;
};

const QUICK_STEPS: QuickStep[] = [
  {
    title: '1. 配置模型',
    body: '在「模型配置」页面新建模型配置，填入 API 协议、Base URL、Model 与 API Key，点击测试通过后设为默认。',
    outcome: '平台获得可用的 LLM 调用能力。',
  },
  {
    title: '2. 创建数字员工',
    body: '在「我的数字员工」页面创建新员工，填写姓名、岗位描述，绑定所需的技能、知识库与工具。',
    outcome: '一个可对话、可调度资源的数字员工就绪。',
  },
  {
    title: '3. 对话与治理',
    body: '进入工作台与员工对话，查看执行 Trace；在「员工档案」查看工作记录、定时任务与对话日志。',
    outcome: '形成「执行—观测—优化」的运营闭环。',
  },
];

export default function TutorialPage() {
  const [activeId, setActiveId] = useState<string>(ALL_TOC_IDS[0] || '');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sections = ALL_TOC_IDS.map((id) => document.getElementById(id)).filter(
      (element): element is HTMLElement => Boolean(element),
    );
    if (sections.length === 0) return;

    const visibility = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        // 选取当前视口内最靠上的可见章节作为高亮项
        let bestId = '';
        let bestTop = Number.POSITIVE_INFINITY;
        for (const element of sections) {
          const rect = element.getBoundingClientRect();
          if (rect.top < bestTop && (visibility.get(element.id) ?? 0) > 0) {
            bestTop = rect.top;
            bestId = element.id;
          }
        }
        if (bestId) setActiveId(bestId);
      },
      { rootMargin: '-80px 0px -65% 0px', threshold: [0, 0.25, 0.5, 1] },
    );
    sections.forEach((element) => observer.observe(element));
    observerRef.current = observer;
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      className="tutorial-page"
      sx={{
        mx: 'auto',
        display: 'flex',
        width: '100%',
        maxWidth: '1200px',
        gap: '32px',
        px: '32px',
        py: '40px',
        '@media (max-width: 900px)': { flexDirection: 'column', px: '16px' },
      }}
    >
      <Box
        component="aside"
        sx={{
          position: 'sticky',
          top: '40px',
          height: 'fit-content',
          width: '220px',
          flexShrink: 0,
          '@media (max-width: 900px)': { width: '100%' },
        }}
      >
        <nav aria-label="目录">
          {TOC_GROUPS.map((group) => (
            <Box key={group.title} sx={{ mb: '20px' }}>
              <Box sx={{ mb: '8px', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em', color: '#858b9c' }}>
                {group.title}
              </Box>
              <Box component="ul" sx={{ m: 0, listStyle: 'none', p: 0, '& > * + *': { mt: '6px' } }}>
                {group.items.map((item) => (
                  <Box component="li" key={item.id}>
                    <Box
                      component="a"
                      href={`#${item.id}`}
                      sx={{
                        display: 'block',
                        fontSize: '13px',
                        transition: 'background-color 0.15s, color 0.15s',
                        ...(activeId === item.id
                          ? { fontWeight: 500, color: '#3a4fbf' }
                          : { color: '#464c5e', '&:hover': { color: '#18181a' } }),
                      }}
                    >
                      {item.label}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </nav>
      </Box>

      <Box component="article" sx={{ minWidth: 0, flex: 1 }}>
        <Box component="section" id="intro" sx={{ mb: '40px', scrollMarginTop: '40px' }}>
          <Box component="h2" sx={{ m: 0, fontSize: '24px', fontWeight: 600, color: '#18181a' }}>项目简介</Box>
          <Box component="p" sx={{ mt: '12px', fontSize: '14px', lineHeight: '22px', color: '#464c5e' }}>
            StaffDeck 是一个数字员工运营平台：把大模型、技能、知识库与工具组合成可独立运营的「数字员工」，
            覆盖从对话执行到反馈治理的完整闭环。本教程帮助你在几分钟内完成首次部署并理解核心概念。
          </Box>
        </Box>

        <Box component="section" id="install" sx={{ mb: '40px', scrollMarginTop: '40px' }}>
          <Box component="h2" sx={{ m: 0, fontSize: '24px', fontWeight: 600, color: '#18181a' }}>安装说明</Box>
          <Box component="p" sx={{ mt: '12px', fontSize: '14px', lineHeight: '22px', color: '#464c5e' }}>
            前端基于 React + Vite，后端提供 <Box component="code" sx={{ borderRadius: '4px', bgcolor: '#f2f3f7', px: '4px', py: '2px', fontSize: '12px' }}>/api/staffdeck</Box> 接口，
            作为 CrossWMS 桌面应用的子模块随主程序启动。
          </Box>
          <Box component="p" sx={{ mt: '12px', fontSize: '14px', lineHeight: '22px', color: '#464c5e' }}>
            模块采用与主应用一致的「无登录门」模式：进入「数字员工」即自动获得默认桌面身份，
            <strong>无需 admin 登录</strong>。首次使用前，请先在「模型配置」页面配置一个可用的 LLM，否则对话与定时任务会以占位模式运行。
          </Box>
        </Box>

        <Box component="section" id="quickstart" sx={{ mb: '40px', scrollMarginTop: '40px' }}>
          <Box component="h2" sx={{ m: 0, fontSize: '24px', fontWeight: 600, color: '#18181a' }}>快速开始</Box>
          <Box component="ol" sx={{ mt: '12px', m: 0, listStyle: 'none', p: 0, '& > * + *': { mt: '16px' } }}>
            {QUICK_STEPS.map((step) => (
              <Box component="li" key={step.title} sx={{ borderRadius: '12px', border: '1px solid #eef0f4', bgcolor: 'background.paper', p: '16px' }}>
                <Box sx={{ fontSize: '15px', fontWeight: 600, color: '#18181a' }}>{step.title}</Box>
                <Box component="p" sx={{ mt: '6px', fontSize: '13px', lineHeight: '20px', color: '#464c5e' }}>{step.body}</Box>
                <Box component="p" sx={{ mt: '6px', fontSize: '12px', color: '#858b9c' }}>预期结果：{step.outcome}</Box>
              </Box>
            ))}
          </Box>
        </Box>

        <Box component="section" id="core-features" sx={{ mb: '40px', scrollMarginTop: '40px' }}>
          <Box component="h2" sx={{ m: 0, fontSize: '24px', fontWeight: 600, color: '#18181a' }}>能力总览</Box>
          <Box sx={{ mt: '16px', display: 'grid', gap: '16px', '@media (min-width: 640px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, '@media (min-width: 1024px)': { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } }}>
            {FEATURES.map((feature) => (
              <Box key={feature.title} sx={{ borderRadius: '12px', border: '1px solid #eef0f4', bgcolor: 'background.paper', p: '16px' }}>
                <Box sx={{ fontSize: '15px', fontWeight: 600, color: '#18181a' }}>{feature.title}</Box>
                <Box sx={{ mt: '2px', fontSize: '12px', color: '#858b9c' }}>{feature.subtitle}</Box>
                <Box component="p" sx={{ mt: '8px', fontSize: '13px', lineHeight: '20px', color: '#464c5e' }}>{feature.body}</Box>
                <Box component="p" sx={{ mt: '8px', fontSize: '12px', color: '#1a71ff' }}>{feature.proof}</Box>
              </Box>
            ))}
          </Box>
        </Box>

        <Box component="section" id="runtime" sx={{ mb: '40px', scrollMarginTop: '40px' }}>
          <Box component="h2" sx={{ m: 0, fontSize: '24px', fontWeight: 600, color: '#18181a' }}>运行闭环</Box>
          <Box component="p" sx={{ mt: '12px', fontSize: '14px', lineHeight: '22px', color: '#464c5e' }}>
            每一轮对话都遵循「路由决策 → 技能执行 → 工具调用 → 反思校验」的闭环。后端由
            <Box component="code" sx={{ mx: '4px', borderRadius: '4px', bgcolor: '#f2f3f7', px: '4px', py: '2px', fontSize: '12px' }}>staffChatExecutor</Box>
            驱动，按当前数字员工的岗位人设、绑定的技能 SOP 与实时检索的知识上下文组装系统提示词，
            再交由 REACT 模式的执行器完成推理与动作。
          </Box>
          <Box component="ul" sx={{ mt: '12px', listStyle: 'disc', pl: '20px', fontSize: '14px', lineHeight: '22px', color: '#464c5e', '& > * + *': { mt: '8px' } }}>
            <li><strong>路由</strong>：判断用户意图，选择合适的技能或直连通用能力。</li>
            <li><strong>技能执行</strong>：按 SOP 节点逐步推进，支持多步串联。</li>
            <li><strong>工具调用</strong>：在需要时使用已绑定的工具（HTTP / MCP / 浏览器等）。</li>
            <li><strong>反思</strong>：反思轮数内检查技能与工具结果质量，必要时重试或换路径。</li>
            <li><strong>知识引用</strong>：开启知识库后，检索结果以向量余弦相似度排序并注入上下文。</li>
          </Box>
          <Box component="p" sx={{ mt: '12px', fontSize: '13px', lineHeight: '20px', color: '#858b9c' }}>
            未配置可用模型时，闭环以占位流式响应运行，用于验证链路连通性，不会返回真实推理结果。
          </Box>
        </Box>

        <Box component="section" id="governance" sx={{ mb: '40px', scrollMarginTop: '40px' }}>
          <Box component="h2" sx={{ m: 0, fontSize: '24px', fontWeight: 600, color: '#18181a' }}>治理与复盘</Box>
          <Box component="p" sx={{ mt: '12px', fontSize: '14px', lineHeight: '22px', color: '#464c5e' }}>
            平台提供三类治理入口，帮助你在运营中持续优化数字员工：
          </Box>
          <Box component="ul" sx={{ mt: '12px', listStyle: 'disc', pl: '20px', fontSize: '14px', lineHeight: '22px', color: '#464c5e', '& > * + *': { mt: '8px' } }}>
            <li><strong>对话日志</strong>（「对话日志」）：按会话查看消息、反馈与重新分析归因结果。</li>
            <li><strong>工作记录</strong>（「员工档案 → 工作记录」）：以时间线展示近期执行、调用与反馈分布。</li>
            <li><strong>反馈分析</strong>：对标记为负面或需复盘的对话提交重新分析；已配置模型时执行真实归因，否则诚实提示尚未启用。</li>
          </Box>
        </Box>

        <Box component="section" id="architecture" sx={{ mb: '40px', scrollMarginTop: '40px' }}>
          <Box component="h2" sx={{ m: 0, fontSize: '24px', fontWeight: 600, color: '#18181a' }}>架构概览</Box>
          <Box component="p" sx={{ mt: '12px', fontSize: '14px', lineHeight: '22px', color: '#464c5e' }}>
            数字员工模块沿用了 CrossWMS 的整体架构：
          </Box>
          <Box component="ul" sx={{ mt: '12px', listStyle: 'disc', pl: '20px', fontSize: '14px', lineHeight: '22px', color: '#464c5e', '& > * + *': { mt: '8px' } }}>
            <li><strong>前端</strong>：React + Vite 单页应用，数字员工相关页面挂载在 <Box component="code" sx={{ borderRadius: '4px', bgcolor: '#f2f3f7', px: '4px', py: '2px', fontSize: '12px' }}>/enterprise/*</Box> 与 <Box component="code" sx={{ borderRadius: '4px', bgcolor: '#f2f3f7', px: '4px', py: '2px', fontSize: '12px' }}>/workspace/*</Box> 下。</li>
            <li><strong>后端</strong>：TypeScript/Express，所有接口统一前缀 <Box component="code" sx={{ borderRadius: '4px', bgcolor: '#f2f3f7', px: '4px', py: '2px', fontSize: '12px' }}>/api/staffdeck</Box>（含模型配置、技能、知识库、工具、对话流式、定时任务等）。</li>
            <li><strong>存储</strong>：SQLite，业务数据存储在 <Box component="code" sx={{ borderRadius: '4px', bgcolor: '#f2f3f7', px: '4px', py: '2px', fontSize: '12px' }}>sd_*</Box> 系列表中（员工、会话、消息、事件 Trace、知识分块等）。</li>
            <li><strong>运行载体</strong>：通过 PyWebView 打包为桌面应用，数字员工作为子模块随主程序启动。</li>
          </Box>
        </Box>

        <Box component="section" id="flow" sx={{ mb: '40px', scrollMarginTop: '40px' }}>
          <Box component="h2" sx={{ m: 0, fontSize: '24px', fontWeight: 600, color: '#18181a' }}>执行流程</Box>
          <Box component="ol" sx={{ mt: '12px', m: 0, listStyle: 'decimal', p: 0, pl: '20px', fontSize: '14px', lineHeight: '22px', color: '#464c5e', '& > * + *': { mt: '10px' } }}>
            <li>组装上下文：读取岗位人设，加载绑定的技能 SOP 与知识库。</li>
            <li>检索增强：对用户问题做向量检索，取相关分块注入系统提示词。</li>
            <li>路由决策：选择匹配的技能或通用能力。</li>
            <li>技能执行：按 SOP 节点逐步推进，必要时调用工具。</li>
            <li>反思校验：在反思轮数内检查中间结果质量，决定是否重试。</li>
            <li>流式回写：将思考链、工具调用与最终回复以 SSE 流式推送至前端渲染。</li>
          </Box>
        </Box>

        <Box component="section" id="reference" sx={{ mb: '40px', scrollMarginTop: '40px' }}>
          <Box component="h2" sx={{ m: 0, fontSize: '24px', fontWeight: 600, color: '#18181a' }}>配置参考</Box>
          <Box component="ul" sx={{ mt: '12px', listStyle: 'disc', pl: '20px', fontSize: '14px', lineHeight: '22px', color: '#464c5e', '& > * + *': { mt: '8px' } }}>
            <li><strong>模型配置</strong>：协议（OpenAI / 兼容）、Base URL、Model、API Key；可测试连通性并设为默认。</li>
            <li><strong>岗位人设</strong>：每名员工可设置独立的系统提示词，组织级「岗位人设」作为全局默认。</li>
            <li><strong>展示设置</strong>：开启/关闭「思考状态」「执行技能」「工具调用」渲染；设置反思轮数（0 关闭）与单轮最大动作数（防循环）。</li>
          </Box>
        </Box>

        <Box component="section" id="development" sx={{ mb: '40px', scrollMarginTop: '40px' }}>
          <Box component="h2" sx={{ m: 0, fontSize: '24px', fontWeight: 600, color: '#18181a' }}>开发指南</Box>
          <Box component="p" sx={{ mt: '12px', fontSize: '14px', lineHeight: '22px', color: '#464c5e' }}>
            扩展数字员工能力主要有三类方式：
          </Box>
          <Box component="ul" sx={{ mt: '12px', listStyle: 'disc', pl: '20px', fontSize: '14px', lineHeight: '22px', color: '#464c5e', '& > * + *': { mt: '8px' } }}>
            <li><strong>技能（SOP）</strong>：以结构化步骤描述的业务流程，可版本化（同步 / 提升 / 回滚）与跨员工复制。</li>
            <li><strong>通用技能</strong>：可复用的原子能力，如浏览器操作、MCP 调用、查询工具等。</li>
            <li><strong>知识库</strong>：上传文档后自动切分、向量化并入库，对话时按语义检索注入。</li>
            <li><strong>工具</strong>：HTTP 接口或 MCP Server，开放给员工在闭环中调用与测试。</li>
          </Box>
        </Box>

        <Box component="section" id="showcase" sx={{ mb: '40px', scrollMarginTop: '40px' }}>
          <Box component="h2" sx={{ m: 0, fontSize: '24px', fontWeight: 600, color: '#18181a' }}>案例展示</Box>
          <Box component="ul" sx={{ mt: '12px', listStyle: 'disc', pl: '20px', fontSize: '14px', lineHeight: '22px', color: '#464c5e', '& > * + *': { mt: '8px' } }}>
            <li><strong>跨境支付客服</strong>：绑定知识库（费率 / 申报规则）+ 工具（订单查询），在对话中引用来源并调用接口。</li>
            <li><strong>内部知识助手</strong>：以通用技能检索文档，配合反思校验提升答案准确率。</li>
            <li><strong>定时运营播报</strong>：用定时任务周期性触发对话闭环，自动产出日报并留存工作记录。</li>
          </Box>
        </Box>

        <Box component="section" id="faq" sx={{ mb: '40px', scrollMarginTop: '40px' }}>
          <Box component="h2" sx={{ m: 0, fontSize: '24px', fontWeight: 600, color: '#18181a' }}>常见问题</Box>
          <Box component="dl" sx={{ mt: '12px', '& > * + *': { mt: '14px' } }}>
            <div>
              <Box component="dt" sx={{ fontSize: '14px', fontWeight: 600, color: '#18181a' }}>需要登录吗？</Box>
              <Box component="dd" sx={{ mt: '4px', fontSize: '14px', lineHeight: '22px', color: '#464c5e' }}>
                不需要。数字员工作为桌面应用子模块，进入即获得默认桌面身份，无 admin 登录门。
              </Box>
            </div>
            <div>
              <Box component="dt" sx={{ fontSize: '14px', fontWeight: 600, color: '#18181a' }}>对话没有任何回复 / 一直是占位内容？</Box>
              <Box component="dd" sx={{ mt: '4px', fontSize: '14px', lineHeight: '22px', color: '#464c5e' }}>
                通常是尚未在「模型配置」中配置可用 LLM。配置并测试通过、设为默认后即可返回真实推理结果。
              </Box>
            </div>
            <div>
              <Box component="dt" sx={{ fontSize: '14px', fontWeight: 600, color: '#18181a' }}>知识库内容没有被引用？</Box>
              <Box component="dd" sx={{ mt: '4px', fontSize: '14px', lineHeight: '22px', color: '#464c5e' }}>
                请确认文档已通过「新增文档」入库完成向量化，且已在对应员工下绑定该知识库。
              </Box>
            </div>
            <div>
              <Box component="dt" sx={{ fontSize: '14px', fontWeight: 600, color: '#18181a' }}>数据存在哪里？</Box>
              <Box component="dd" sx={{ mt: '4px', fontSize: '14px', lineHeight: '22px', color: '#464c5e' }}>
                全部存储在本地 SQLite 的 <Box component="code" sx={{ borderRadius: '4px', bgcolor: '#f2f3f7', px: '4px', py: '2px', fontSize: '12px' }}>sd_*</Box> 表中，随桌面应用数据目录本地保存。
              </Box>
            </div>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
