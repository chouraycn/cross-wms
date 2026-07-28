import { List, MoreHorizontal, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import Box from '@mui/material/Box';

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
      <DropdownMenuTrigger asChild>
        <Box
          component="button"
          type="button"
          aria-label="操作"
          sx={{
            display: 'grid',
            width: '28px',
            height: '28px',
            placeItems: 'center',
            borderRadius: '8px',
            color: '#1a71ff',
            transition: 'background-color 0.15s, color 0.15s',
            outline: 'none',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.05)', color: '#4a8dff' },
            '&:focus-visible': { bgcolor: 'rgba(0,0,0,0.05)' },
          }}
        >
          <MoreHorizontal size={14} />
        </Box>
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
            <DropdownMenuSeparator sx={{ my: '2px', bgcolor: '#eef0f4' }} />
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
