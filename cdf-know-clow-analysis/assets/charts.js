(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var accent3 = style.getPropertyValue('--accent3').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var bg3 = style.getPropertyValue('--bg3').trim();

  // --- Chart: Codebase Size ---
  var chart1 = echarts.init(document.getElementById('chart-codebase'), null, { renderer: 'svg' });
  chart1.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true, backgroundColor: bg3, borderColor: rule, textStyle: { color: ink } },
    legend: { data: ['前端 (src/)', '后端 (server/)'], top: 0, textStyle: { color: muted, fontSize: 12 } },
    grid: { left: 60, right: 30, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: ['组件', '页面', 'Hooks', '服务', '工具', '类型', '路由', '引擎', 'DAO', '业务服务'],
      axisLabel: { color: muted, fontSize: 11, rotate: 30 },
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '文件数',
      nameTextStyle: { color: muted, fontSize: 11 },
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } },
      axisLine: { show: false }
    },
    series: [
      {
        name: '前端 (src/)',
        type: 'bar',
        stack: 'total',
        data: [120, 26, 4, 8, 7, 12, 0, 0, 0, 0],
        itemStyle: { color: accent, borderRadius: [0, 0, 0, 0] },
        barWidth: '50%'
      },
      {
        name: '后端 (server/)',
        type: 'bar',
        stack: 'total',
        data: [0, 0, 0, 0, 0, 0, 45, 55, 20, 19],
        itemStyle: { color: accent2, borderRadius: [4, 4, 0, 0] },
        barWidth: '50%'
      }
    ]
  });
  window.addEventListener('resize', function() { chart1.resize(); });

  // --- Chart: Module Distribution ---
  var chart2 = echarts.init(document.getElementById('chart-modules'), null, { renderer: 'svg' });
  chart2.setOption({
    animation: false,
    tooltip: { trigger: 'item', appendToBody: true, backgroundColor: bg3, borderColor: rule, textStyle: { color: ink } },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '55%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: bg2, borderWidth: 2 },
      label: { color: ink, fontSize: 11 },
      labelLine: { lineStyle: { color: rule } },
      data: [
        { value: 20000, name: 'AI 引擎 (engine/)', itemStyle: { color: accent } },
        { value: 18000, name: '路由层 (routes/)', itemStyle: { color: accent2 } },
        { value: 15000, name: 'UI 组件 (components/)', itemStyle: { color: accent3 } },
        { value: 8500, name: '业务服务 (services/)', itemStyle: { color: '#fbbf24' } },
        { value: 7000, name: '数据访问 (dao/)', itemStyle: { color: '#f87171' } },
        { value: 12000, name: '页面/工具/其他', itemStyle: { color: '#94a3b8' } }
      ]
    }]
  });
  window.addEventListener('resize', function() { chart2.resize(); });

  // --- Mermaid Init ---
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({ startOnLoad: true, theme: 'dark', securityLevel: 'loose', themeVariables: { primaryColor: '#1e293b', primaryTextColor: '#f1f5f9', primaryBorderColor: '#38bdf8', lineColor: '#94a3b8', secondaryColor: '#111827', tertiaryColor: '#0a0f1a' } });
  }
})();
