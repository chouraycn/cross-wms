import { List, MoreHorizontal, Pause, Pencil, Play, Trash2 } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/staff/ui/index.js';
import type { ScheduledTaskRead } from '../../../components/staff/types/index.js';
import { staffTokens } from '../../../components/staff/lib/staffTokens.js';

export type TaskActionsMenuProps = {
  task: ScheduledTaskRead;
  onViewRuns: (task: ScheduledTaskRead) => void;
  onEdit: (task: ScheduledTaskRead) => void;
  onRunNow: (task: ScheduledTaskRead) => void;
  onToggleStatus: (task: ScheduledTaskRead) => void;
  onDelete: (task: ScheduledTaskRead) => void;
};

/** 定时任务行操作下拉菜单。 */
export function TaskActionsMenu({
  task,
  onViewRuns,
  onEdit,
  onRunNow,
  onToggleStatus,
  onDelete,
}: TaskActionsMenuProps) {
  const isArchived = task.status === 'archived';
  const isCompleted = task.status === 'completed';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="操作"
        className="grid size-7 place-items-center rounded-[8px] text-[#1a71ff] transition-colors outline-none hover:bg-black/5 hover:text-[#4a8dff] focus-visible:bg-black/5"
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sx={staffTokens.menuContent}>
        <DropdownMenuItem onSelect={() => onViewRuns(task)}>
          <List />
          查看记录
        </DropdownMenuItem>
        {!isArchived && (
          <>
            <DropdownMenuItem onSelect={() => onEdit(task)}>
              <Pencil />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRunNow(task)}>
              <Play />
              立即执行
            </DropdownMenuItem>
            {!isCompleted && (
              <DropdownMenuItem onSelect={() => onToggleStatus(task)}>
                {task.status === 'active' ? <Pause /> : <Play />}
                {task.status === 'active' ? '暂停' : '启用'}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="my-[2px] bg-[#eef0f4]" />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete(task)}
            >
              <Trash2 />
              删除
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
