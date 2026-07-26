import { List, MoreHorizontal, Pause, Pencil, Play, Trash2 } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/staff/ui/index.js';
import type { ScheduledTaskRead } from '../../../components/staff/types/index.js';

const MENU_ITEM_CLASS =
  'w-[110px] cursor-pointer gap-[4px] rounded-[10px] px-[12px] py-[6px] text-[12px] text-[#858b9c] focus:text-[#18181a] [&_svg]:size-[14px]';
const MENU_ITEM_DANGER_CLASS =
  'w-[110px] cursor-pointer gap-[4px] rounded-[10px] px-[12px] py-[6px] text-[12px] text-[#d20b0b] focus:bg-[#fce7e7] focus:text-[#d20b0b] focus:[&_svg]:text-[#d20b0b]! [&_svg]:size-[14px]';

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
      <DropdownMenuContent
        align="end"
        className="flex w-auto min-w-0 flex-col gap-[4px] rounded-[14px] border-0 bg-white p-[4px] shadow-[0px_0px_8px_rgba(0,0,0,0.1)] ring-0 [--accent:#F6F6F6] [--accent-foreground:#18181A]"
      >
        <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => onViewRuns(task)}>
          <List />
          查看记录
        </DropdownMenuItem>
        {!isArchived && (
          <>
            <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => onEdit(task)}>
              <Pencil />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => onRunNow(task)}>
              <Play />
              立即执行
            </DropdownMenuItem>
            {!isCompleted && (
              <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => onToggleStatus(task)}>
                {task.status === 'active' ? <Pause /> : <Play />}
                {task.status === 'active' ? '暂停' : '启用'}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="my-[2px] bg-[#eef0f4]" />
            <DropdownMenuItem
              variant="destructive"
              className={MENU_ITEM_DANGER_CLASS}
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
