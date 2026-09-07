import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { RUN_STATUS_BADGE, TASK_STATUS_BADGE, type BadgeTone } from './shared';

export function StatusBadge({ tone, children, className }: { tone: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <Badge
      variant={tone}
      className={cn(
        '!inline-flex !items-center !justify-center !rounded-full !px-[12px] !py-[4px] !text-[10px] !h-auto !capitalize !whitespace-nowrap !border-transparent',
        className,
      )}
    >
      {children}
    </Badge>
  );
}

export function TaskStatusBadge({ status }: { status: string }) {
  const { tone, text } = TASK_STATUS_BADGE[status] || TASK_STATUS_BADGE.archived;
  return <StatusBadge tone={tone}>{text}</StatusBadge>;
}

export function TaskRunResultBadge({ status }: { status: string }) {
  const preset = RUN_STATUS_BADGE[status] || { tone: 'gray' as BadgeTone, text: status || '暂无' };
  return <StatusBadge tone={preset.tone}>{preset.text}</StatusBadge>;
}
