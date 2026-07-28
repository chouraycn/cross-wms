import StaffdeckIcon from '../../../../components/staff/StaffdeckIcon.js';
import { Box } from '@mui/material';
import { cn } from '../../../../components/staff/lib/utils.js';
import type {
  ChatAttachmentRead,
  ChatMessage,
  KnowledgeCitation,
  ScheduledTaskDraftRead,
  ScheduledTaskRead,
} from '../../../../components/staff/types/index.js';

import {
  chatBubbleSx,
  chatRowSx,
  chatTokens,
} from '../chatTokens.js';
import {
  MarkdownMessage,
  attachmentTypeLabel,
  canRateMessage,
  citationDisplayTitle,
} from '../chatHelpers.js';
import type { TraceLine } from '../chatTypes.js';
import type { UseChatSession } from '../useChatSession.js';
import ExecutionRecord from './ExecutionRecord.js';
import ScheduledDraftCard from './ScheduledDraftCard.js';

export type MessageRender = {
  traceTurnId: string;
  summary: { text: string; state: TraceLine['state'] } | null;
  details: TraceLine[];
  expanded: boolean;
  showInlineTrace: boolean;
  visibleContent: string;
  citations: KnowledgeCitation[];
  scheduledDraft: ScheduledTaskDraftRead | null;
  createdTask?: ScheduledTaskRead;
  scheduledTaskPrompt: boolean;
  attachments: ChatAttachmentRead[];
  statusOnly: boolean;
};

type MessageBubbleProps = {
  chat: UseChatSession;
  item: ChatMessage;
  render: MessageRender;
};

export default function MessageBubble({ chat, item, render }: MessageBubbleProps) {
  const { toggleTrace, rateMessage, setActiveCitation, confirmScheduledTask, dismissScheduledTaskDraft } = chat;
  const {
    traceTurnId,
    summary,
    details,
    expanded,
    showInlineTrace,
    visibleContent,
    citations,
    scheduledDraft,
    createdTask,
    scheduledTaskPrompt,
    attachments,
    statusOnly,
  } = render;
  const queuedMessage = item.role === 'user' && item.metadata?.queued === true;

  return (
    <Box sx={[chatTokens.messageItem, ...(queuedMessage ? [chatTokens.queuedMessageItem] : [])]}>
      <Box sx={chatRowSx(item.role)}>
        <Box sx={chatBubbleSx(item.role, item.isError)}>
          {statusOnly ? (
            <Box sx={{ fontSize: '13px', color: '#858b9c' }}>{visibleContent}</Box>
          ) : showInlineTrace && summary ? (
            <ExecutionRecord
              traceTurnId={traceTurnId}
              summary={summary}
              details={details}
              expanded={expanded}
              onToggle={toggleTrace}
            />
          ) : null}

          {!statusOnly && visibleContent ? (
            item.role === 'assistant' ? (
              <div data-i18n-ignore>
                <MarkdownMessage content={visibleContent} />
              </div>
            ) : (
              <Box sx={chatTokens.plainAnswer}>
                {scheduledTaskPrompt && (
                  <Box component="span" sx={chatTokens.messageModeChip}>
                    <StaffdeckIcon name="clock" size={13} />
                    定时任务
                  </Box>
                )}
                <span data-i18n-ignore>{visibleContent}</span>
              </Box>
            )
          ) : null}

          {!statusOnly && attachments.length > 0 && (
            <Box sx={chatTokens.attachmentList}>
              {attachments.map((attachment) => (
                <Box sx={chatTokens.attachmentCard} key={attachment.id}>
                  {attachment.kind === 'image' && attachment.data_url ? (
                    <Box component="img" sx={chatTokens.attachmentImg} src={attachment.data_url} alt={attachment.filename} />
                  ) : (
                    <Box component="span" sx={chatTokens.attachmentFileIcon}>
                      <StaffdeckIcon name={attachment.kind === 'pdf' ? 'file' : 'folder'} size={18} />
                    </Box>
                  )}
                  <Box component="span" sx={chatTokens.attachmentCopy}>
                    <Box component="span" sx={chatTokens.attachmentName} data-i18n-ignore>{attachment.filename}</Box>
                    <Box component="span" sx={chatTokens.attachmentMeta} data-i18n-ignore>
                      {attachmentTypeLabel(attachment)}
                      {attachment.error ? ` · ${attachment.error}` : ''}
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          {item.role === 'assistant' && citations.length > 0 && (
            <Box sx={chatTokens.citations} aria-label="知识引用">
              <Box sx={chatTokens.citationHeading}>
                <StaffdeckIcon name="file" size={14} />
                <span>知识来源</span>
              </Box>
              <Box sx={chatTokens.citationList}>
                {citations.map((citation) => (
                  <Box
                    component="button"
                    type="button"
                    sx={chatTokens.citationChip}
                    key={citation.id}
                    onClick={() => setActiveCitation(citation)}
                  >
                    <Box component="span" sx={chatTokens.citationIndex} data-i18n-ignore>{citation.label || citation.id}</Box>
                    <Box component="span" sx={chatTokens.citationTitle} data-i18n-ignore>{citationDisplayTitle(citation)}</Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {scheduledDraft && (
            <ScheduledDraftCard
              draft={scheduledDraft}
              createdTask={createdTask}
              onConfirm={(nextDraft) => void confirmScheduledTask(nextDraft, item.id)}
              onDismiss={() => dismissScheduledTaskDraft(item.id)}
            />
          )}

          {canRateMessage(item) && (
            <Box sx={chatTokens.feedback}>
              <Box
                component="button"
                type="button"
                sx={[chatTokens.feedbackBtn, ...(item.feedback_rating === 'up' ? [chatTokens.feedbackBtnActive] : [])]}
                aria-label="点赞"
                onClick={() => rateMessage(item, 'up')}
              >
                <StaffdeckIcon name="thumb-up" size={15} />
              </Box>
              <Box
                component="button"
                type="button"
                sx={[chatTokens.feedbackBtn, ...(item.feedback_rating === 'down' ? [chatTokens.feedbackBtnDislikeActive] : [])]}
                aria-label="点踩"
                onClick={() => rateMessage(item, 'down')}
              >
                <StaffdeckIcon name="thumb-down" size={15} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      {queuedMessage && (
        <Box sx={chatTokens.queuedStatusRow}>
          <Box component="span" sx={chatTokens.queuedStatus} role="status">
            <StaffdeckIcon name="clock" size={12} />
            排队中
          </Box>
        </Box>
      )}
    </Box>
  );
}
