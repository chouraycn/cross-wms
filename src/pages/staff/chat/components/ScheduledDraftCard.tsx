import { useEffect, useState } from 'react';

import StaffdeckIcon from '../../../../components/staff/StaffdeckIcon.js';
import { Box } from '@mui/material';
import { Button } from '../../../../components/staff/ui/button.js';
import { Input } from '../../../../components/staff/ui/input.js';
import { Textarea } from '../../../../components/staff/ui/textarea.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/staff/ui/select.js';
import { notify } from '../../../../components/staff/ui/app-toast.js';
import { getClientTimeZone } from '../../../../components/staff/lib/timezone.js';
import { cn } from '../../../../components/staff/lib/utils.js';
import type { ScheduledTaskDraftRead, ScheduledTaskRead } from '../../../../components/staff/types/index.js';

import { chatTokens } from '../chatTokens.js';
import {
  draftScheduleForType,
  formatDraftSchedule,
  normalizeDraftScheduleType,
  scheduleEditValue,
  scheduleFromEditValue,
  scheduleTypeLabel,
} from '../chatHelpers.js';

type ScheduledDraftCardProps = {
  draft: ScheduledTaskDraftRead;
  createdTask?: ScheduledTaskRead;
  onConfirm: (draft: ScheduledTaskDraftRead) => void;
  onDismiss: () => void;
};

export default function ScheduledDraftCard({
  draft,
  createdTask,
  onConfirm,
  onDismiss,
}: ScheduledDraftCardProps) {
  const [editing, setEditing] = useState(false);
  const [editableDraft, setEditableDraft] = useState<ScheduledTaskDraftRead>(draft);
  const created = Boolean(createdTask);
  const currentTimezone = getClientTimeZone();
  const displayDraft = createdTask
    ? ({
        ...draft,
        title: createdTask.title,
        prompt: createdTask.prompt,
        description: createdTask.description || draft.description,
        schedule_type: createdTask.schedule_type,
        schedule: createdTask.schedule,
        timezone: createdTask.timezone,
        rrule: createdTask.rrule || draft.rrule,
      } as ScheduledTaskDraftRead)
    : editableDraft;

  useEffect(() => {
    setEditableDraft(draft);
    setEditing(false);
  }, [
    draft.agent_id,
    draft.title,
    draft.prompt,
    draft.description,
    draft.schedule_type,
    draft.timezone,
    draft.rrule,
    JSON.stringify(draft.schedule || {}),
    createdTask?.id,
  ]);

  const updateDraft = (patch: Partial<ScheduledTaskDraftRead>) => {
    setEditableDraft((current) => ({ ...current, ...patch }));
  };
  const scheduleValue = scheduleEditValue(editableDraft);
  const validateDraft = (nextDraft: ScheduledTaskDraftRead) => {
    if (!nextDraft.title.trim()) {
      notify.warning('请输入定时任务名称');
      return false;
    }
    if (!nextDraft.prompt.trim()) {
      notify.warning('请输入执行内容');
      return false;
    }
    if (!scheduleEditValue(nextDraft).trim()) {
      notify.warning('请输入执行计划');
      return false;
    }
    return true;
  };
  const updateScheduleType = (value: ScheduledTaskDraftRead['schedule_type']) => {
    setEditableDraft((current) => {
      const scheduleType = normalizeDraftScheduleType(value);
      const schedule = draftScheduleForType(current.schedule || {}, scheduleType);
      return { ...current, schedule_type: scheduleType, schedule };
    });
  };
  const updateScheduleValue = (value: string) => {
    setEditableDraft((current) => ({ ...current, schedule: scheduleFromEditValue(current, value) }));
  };
  const completeEdit = () => {
    if (!validateDraft(editableDraft)) return;
    setEditing(false);
  };
  const confirmDraft = () => {
    if (created) return;
    if (!validateDraft(editableDraft)) return;
    onConfirm(editableDraft);
  };

  return (
    <Box sx={[chatTokens.draftCard, ...(created ? [chatTokens.draftCardCreated] : [])]}>
      <Box sx={chatTokens.draftHeader}>
        <Box sx={chatTokens.draftIdentity}>
          <Box sx={chatTokens.draftIcon}>
            <StaffdeckIcon name={created ? 'check' : 'clock'} size={18} />
          </Box>
          <Box sx={{ display: 'grid', minWidth: 0, gap: '2px' }}>
            <Box sx={chatTokens.draftKicker}>{created ? '定时任务已创建' : '定时任务草案'}</Box>
            {editing ? (
              <Input
                className="h-[30px]"
                value={editableDraft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
              />
            ) : (
              <Box component="strong" sx={chatTokens.draftTitle}>{displayDraft.title}</Box>
            )}
          </Box>
        </Box>
        <Box sx={chatTokens.draftTopActions}>
          {created ? (
            <Box component="span" sx={chatTokens.draftCreatedBadge}>
              <StaffdeckIcon name="check" size={13} />
              已创建
            </Box>
          ) : editing ? (
            <>
              <Button size="sm" onClick={completeEdit}>完成</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditableDraft(draft);
                  setEditing(false);
                }}
              >
                取消
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <StaffdeckIcon name="edit" size={14} />
                编辑
              </Button>
              <Button size="sm" variant="ghost" onClick={onDismiss}>忽略</Button>
            </>
          )}
        </Box>
      </Box>
      {editing ? (
        <Box sx={chatTokens.draftEditor}>
          <label>
            <span>计划类型</span>
            <Select value={editableDraft.schedule_type} onValueChange={updateScheduleType}>
              <SelectTrigger className="h-[32px] w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">一次性</SelectItem>
                <SelectItem value="daily">每天</SelectItem>
                <SelectItem value="weekly">每周</SelectItem>
                <SelectItem value="monthly">每月</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label>
            <span>执行计划</span>
            <Input
              className="h-[32px]"
              value={scheduleValue}
              placeholder={editableDraft.schedule_type === 'once' ? 'YYYY-MM-DDTHH:mm:ss+08:00' : 'HH:mm'}
              onChange={(event) => updateScheduleValue(event.target.value)}
            />
          </label>
          <label>
            <span>时区</span>
            <Input
              className="h-[32px]"
              value={editableDraft.timezone || currentTimezone}
              onChange={(event) => updateDraft({ timezone: event.target.value })}
            />
          </label>
          <Box component="label" sx={chatTokens.draftEditorFull}>
            <span>执行内容</span>
            <Textarea
              rows={3}
              value={editableDraft.prompt}
              onChange={(event) => updateDraft({ prompt: event.target.value })}
            />
          </Box>
          <Box component="label" sx={chatTokens.draftEditorFull}>
            <span>说明</span>
            <Textarea
              rows={2}
              value={editableDraft.description || ''}
              placeholder="可补充任务目的、范围或结果要求"
              onChange={(event) => updateDraft({ description: event.target.value })}
            />
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: '12px' }}>
          <Box sx={chatTokens.draftMetaGrid}>
            <Box sx={chatTokens.draftMetaItem}>
              <span>计划</span>
              <strong>{formatDraftSchedule(displayDraft)}</strong>
            </Box>
            <Box sx={chatTokens.draftMetaItem}>
              <span>类型</span>
              <strong>{scheduleTypeLabel(displayDraft.schedule_type)}</strong>
            </Box>
            <Box sx={chatTokens.draftMetaItem}>
              <span>时区</span>
              <strong>{displayDraft.timezone || currentTimezone}</strong>
            </Box>
          </Box>
          <Box sx={chatTokens.draftPrompt}>
            <span>执行内容</span>
            <p>{displayDraft.prompt}</p>
          </Box>
          {displayDraft.description && (
            <Box sx={chatTokens.draftPrompt}>
              <span>说明</span>
              <p>{displayDraft.description}</p>
            </Box>
          )}
        </Box>
      )}
      {!created && (
        <Box sx={chatTokens.draftFooter}>
          {editing && <Button size="sm" variant="ghost" onClick={onDismiss}>忽略</Button>}
          <Button size="sm" onClick={confirmDraft}>确认创建</Button>
        </Box>
      )}
    </Box>
  );
}
