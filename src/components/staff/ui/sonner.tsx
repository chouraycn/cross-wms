// v1.7.187：员工提示代码已统一到主提示位置 src/contexts/ToastContext.tsx
// （用户要求：使用员工提示样式，删除重复代码，统一一套代码）
//
// 此文件仅作重新导出的兼容层，供员工侧 import { Toaster } from '@/components/staff/ui/sonner' 继续工作。
// 实际实现请查看 ../../contexts/ToastContext.tsx 中的 UnifiedToaster / Toaster 导出。

export { Toaster } from '../../../contexts/ToastContext.js';
export type { ToasterProps } from 'sonner';
