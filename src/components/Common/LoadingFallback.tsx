import React from 'react';
import { Box, Skeleton } from '@mui/material';

/**
 * 路由懒加载 fallback 组件（防闪屏骨架屏）
 *
 * 设计原则：
 * 1) 背景色 / 高度 与真实页面 main 容器一致（白底、铺满），
 *    — 避免 fallback→真实内容切换时背景色/高度突变产生闪烁。
 * 2) 不使用突兀的居中 CircularProgress spinner，
 *    — 改成典型页面布局的骨架条（标题区 + 2~3 条卡片/列表骨架），
 *    — 让用户感觉"内容正在来"而不是"出了 loading 弹窗/转圈"。
 * 3) 只在 React.lazy 首次 resolve 的极短时间可见（一般 <300ms），
 *    — 因此刻意让骨架视觉与常见页面结构近似，切换时几乎无感。
 */
const LoadingFallback: React.FC = () => (
  <Box
    sx={{
      width: '100%',
      // 与 <main> 区域高度一致：铺满视窗内可用高度，不让页面高度在 fallback 时跳变
      minHeight: 'calc(100vh - 18px - 56px)',
      // 与常见内容页背景一致（白底），不要用透明或灰色
      bgcolor: '#FFFFFF',
      px: 3,
      py: 3,
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
    }}
  >
    {/* 标题条（典型页面 H3） */}
    <Skeleton
      variant="text"
      width="26%"
      height={32}
      sx={{ fontSize: '2rem', borderRadius: '6px' }}
    />

    {/* 顶部操作区骨架（面包屑 / 筛选 / 按钮组） */}
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      <Skeleton variant="text" width={180} height={22} sx={{ fontSize: '1rem', borderRadius: '4px' }} />
      <Skeleton variant="text" width={140} height={22} sx={{ fontSize: '1rem', borderRadius: '4px' }} />
      <Box sx={{ flex: 1 }} />
      <Skeleton variant="rounded" width={96} height={32} sx={{ borderRadius: '8px' }} />
      <Skeleton variant="rounded" width={96} height={32} sx={{ borderRadius: '8px' }} />
    </Box>

    {/* 卡片 1：表单/概览区 */}
    <Skeleton
      variant="rounded"
      width="100%"
      height={120}
      sx={{ borderRadius: '12px' }}
    />

    {/* 卡片 2：列表/表格区（更高） */}
    <Skeleton
      variant="rounded"
      width="100%"
      height={260}
      sx={{ borderRadius: '12px', flex: '0 0 auto' }}
    />

    {/* 列表行骨架：5~6 条细线 */}
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === 4 ? '50%' : undefined}
          height={20}
          sx={{ fontSize: '0.875rem', borderRadius: '4px' }}
        />
      ))}
    </Box>
  </Box>
);

export default LoadingFallback;
