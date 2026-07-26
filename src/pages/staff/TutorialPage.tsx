import { useEffect } from 'react';

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
    body: '在「模型」页面新建模型配置，填入 API 协议、Base URL、Model 与 API Key，点击测试通过后设为默认。',
    outcome: '平台获得可用的 LLM 调用能力。',
  },
  {
    title: '2. 创建数字员工',
    body: '在「员工」页面创建新员工，填写姓名、岗位描述，绑定所需的技能、知识库与工具。',
    outcome: '一个可对话、可调度资源的数字员工就绪。',
  },
  {
    title: '3. 对话与治理',
    body: '进入工作台与员工对话，查看执行 Trace；在 Dashboard 查看工作记录、定时任务与对话日志。',
    outcome: '形成「执行—观测—优化」的运营闭环。',
  },
];

export default function TutorialPage() {
  useEffect(() => {
    // 简单的目录锚点高亮：当前实现仅占位，完整实现可基于 IntersectionObserver。
    // TODO: 完整实现目录联动高亮
  }, []);

  return (
    <div className="tutorial-page mx-auto flex w-full max-w-[1200px] gap-[32px] px-[32px] py-[40px] max-[900px]:flex-col max-[900px]:px-[16px]">
      <aside className="sticky top-[40px] h-fit w-[220px] shrink-0 max-[900px]:w-full">
        <nav aria-label="目录">
          {TOC_GROUPS.map((group) => (
            <div key={group.title} className="mb-[20px]">
              <div className="mb-[8px] text-[12px] font-semibold uppercase tracking-wide text-[#858b9c]">
                {group.title}
              </div>
              <ul className="m-0 list-none space-y-[6px] p-0">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="block text-[13px] text-[#464c5e] transition-colors hover:text-[#18181a]"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <article className="min-w-0 flex-1">
        <section id="intro" className="mb-[40px] scroll-mt-[40px]">
          <h2 className="m-0 text-[24px] font-semibold text-[#18181a]">项目简介</h2>
          <p className="mt-[12px] text-[14px] leading-[22px] text-[#464c5e]">
            StaffDeck 是一个数字员工运营平台：把大模型、技能、知识库与工具组合成可独立运营的「数字员工」，
            覆盖从对话执行到反馈治理的完整闭环。本教程帮助你在几分钟内完成首次部署并理解核心概念。
          </p>
        </section>

        <section id="install" className="mb-[40px] scroll-mt-[40px]">
          <h2 className="m-0 text-[24px] font-semibold text-[#18181a]">安装说明</h2>
          <p className="mt-[12px] text-[14px] leading-[22px] text-[#464c5e]">
            前端基于 React + Vite，后端提供 <code className="rounded bg-[#f2f3f7] px-[4px] py-[2px] text-[12px]">/api/staffdeck</code> 接口。
            首次启动后使用默认账号 <code className="rounded bg-[#f2f3f7] px-[4px] py-[2px] text-[12px]">admin / admin</code> 登录，并在「模型」页面配置可用的 LLM。
          </p>
        </section>

        <section id="quickstart" className="mb-[40px] scroll-mt-[40px]">
          <h2 className="m-0 text-[24px] font-semibold text-[#18181a]">快速开始</h2>
          <ol className="mt-[12px] m-0 list-none space-y-[16px] p-0">
            {QUICK_STEPS.map((step) => (
              <li key={step.title} className="rounded-[12px] border border-[#eef0f4] bg-white p-[16px]">
                <div className="text-[15px] font-semibold text-[#18181a]">{step.title}</div>
                <p className="mt-[6px] text-[13px] leading-[20px] text-[#464c5e]">{step.body}</p>
                <p className="mt-[6px] text-[12px] text-[#858b9c]">预期结果：{step.outcome}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="core-features" className="mb-[40px] scroll-mt-[40px]">
          <h2 className="m-0 text-[24px] font-semibold text-[#18181a]">能力总览</h2>
          <div className="mt-[16px] grid gap-[16px] sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-[12px] border border-[#eef0f4] bg-white p-[16px]">
                <div className="text-[15px] font-semibold text-[#18181a]">{feature.title}</div>
                <div className="mt-[2px] text-[12px] text-[#858b9c]">{feature.subtitle}</div>
                <p className="mt-[8px] text-[13px] leading-[20px] text-[#464c5e]">{feature.body}</p>
                <p className="mt-[8px] text-[12px] text-[#1a71ff]">{feature.proof}</p>
              </div>
            ))}
          </div>
        </section>

        {/* TODO: 完整实现 runtime / governance / architecture / flow / reference / development / showcase / faq 章节 */}
        <section id="runtime" className="mb-[40px] scroll-mt-[40px]">
          <h2 className="m-0 text-[24px] font-semibold text-[#18181a]">运行闭环</h2>
          <p className="mt-[12px] text-[14px] leading-[22px] text-[#858b9c]">
            运行闭环详细说明待补充。
          </p>
        </section>

        <section id="faq" className="mb-[40px] scroll-mt-[40px]">
          <h2 className="m-0 text-[24px] font-semibold text-[#18181a]">常见问题</h2>
          <p className="mt-[12px] text-[14px] leading-[22px] text-[#858b9c]">
            常见问题与排障指南待补充。
          </p>
        </section>
      </article>
    </div>
  );
}
