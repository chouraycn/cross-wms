import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import EmployeeAvatar from '../../../../components/staff/EmployeeAvatar.js';
import StaffdeckIcon from '../../../../components/staff/StaffdeckIcon.js';
import { Box } from '@mui/material';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/staff/ui/dropdown-menu.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../../../../components/staff/ui/hover-card.js';
import { employeeDisplayName } from '../../../../components/staff/employee.js';
import { useI18n } from '../../../../components/staff/i18n/index.js';

import { chatTokens } from '../chatTokens.js';
import { attachmentTypeLabel, modelDetailText, modelDisplayName } from '../chatHelpers.js';
import type { UseChatSession } from '../useChatSession.js';

export default function Composer({ chat }: { chat: UseChatSession }) {
  const { t } = useI18n();
  const {
    input,
    setInput,
    composerAttachments,
    composerDragActive,
    composerPlusOpen,
    setComposerPlusOpen,
    composerIntent,
    setComposerIntent,
    readyComposerAttachments,
    uploadingComposerAttachment,
    currentSessionRunning,
    composerActive,
    showComposerAvatar,
    displayedProfile,
    displayedAgent,
    emptyRoleSummary,
    emptyProfileTags,
    emptyStats,
    enabledModelConfigs,
    selectedModelConfig,
    changeModelConfig,
    showModelSetupNotice,
    modelSetupNoticeText,
    canConfigureModels,
    setModelSetupOpen,
    isComposing,
    setIsComposing,
    fileInputRef,
    send,
    abortStream,
    handleComposerPaste,
    handleComposerFileChange,
    handleComposerDragEnter,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop,
    removeComposerAttachment,
    handleComposerPlusAction,
  } = chat;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [scheduleIntentHovered, setScheduleIntentHovered] = useState(false);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => {
    if (composerIntent !== 'scheduled_task') {
      setScheduleIntentHovered(false);
    }
  }, [composerIntent]);

  const hasSendContent = Boolean(input.trim() || readyComposerAttachments.length > 0);
  const sendDisabled = !hasSendContent || uploadingComposerAttachment;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send();
  };

  return (
    <Box sx={chatTokens.inputShell}>
      <Box sx={chatTokens.composerStage}>
        {showModelSetupNotice && (
          <Box
            sx={{
              mb: '10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '10px',
              borderRadius: '12px',
              border: '1px solid #f3d28b',
              bgcolor: '#fff8e8',
              px: '14px',
              py: '10px',
              color: '#6f4500',
              boxShadow: '0 8px 24px rgba(92,62,0,0.08)',
              '@media (min-width:640px)': { flexDirection: 'row', alignItems: 'center' },
            }}
          >
            <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '9px' }}>
              <Box
                component="span"
                sx={{
                  display: 'flex',
                  width: '26px',
                  height: '26px',
                  flexShrink: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px',
                  bgcolor: '#ffe7ad',
                  color: '#8a4b00',
                }}
              >
                <StaffdeckIcon name="model" size={14} />
              </Box>
              <Box component="span" sx={{ minWidth: 0, fontSize: '12px', lineHeight: '18px' }}>{modelSetupNoticeText}</Box>
            </Box>
            {canConfigureModels && (
              <Box
                component="button"
                type="button"
                onClick={() => setModelSetupOpen(true)}
                sx={{
                  height: '30px',
                  flexShrink: 0,
                  borderRadius: '8px',
                  bgcolor: '#18181a',
                  px: '12px',
                  fontSize: '12px',
                  color: '#fff',
                  transition: 'background-color 0.15s, color 0.15s',
                  '&:hover': { bgcolor: '#303030' },
                }}
              >
                {t('配置模型')}
              </Box>
            )}
          </Box>
        )}
        {showComposerAvatar && displayedProfile && (
          <HoverCard openDelay={80} closeDelay={80}>
            <HoverCardTrigger asChild>
              <Box
                component="button"
                type="button"
                aria-label="员工信息"
                sx={[chatTokens.composerAvatar, { display: 'block', cursor: 'pointer', outline: 'none' }]}
              >
                <EmployeeAvatar profile={displayedProfile} size={44} />
              </Box>
            </HoverCardTrigger>
            <HoverCardContent
              side="left"
              align="end"
              sideOffset={10}
            >
              <Box
                sx={{
                  display: 'flex',
                  width: '220px',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '8px',
                  borderRadius: '20px',
                  borderWidth: 0,
                  bgcolor: 'background.paper',
                  p: 0,
                  py: '4px',
                  boxShadow: '0px 16px 15px rgba(0,0,0,0.1)',
                }}
              >
                <Box sx={{ display: 'flex', width: '100%', flexDirection: 'column', px: '6px' }}>
                  <Box
                    sx={{
                      display: 'flex',
                      height: '46px',
                      width: '100%',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      borderRadius: '14px',
                      bgcolor: '#f6f6f6',
                      pb: '4px',
                      pl: '8px',
                      pr: '16px',
                      pt: '8px',
                    }}
                  >
                    <Box sx={{ display: 'flex', width: '100%', alignItems: 'flex-end' }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
                        <EmployeeAvatar
                          profile={displayedProfile}
                          agent={displayedAgent ?? undefined}
                          width={60}
                          height={60}
                          radius={30}
                          objectPosition="bottom"
                        />
                        <Box
                          sx={{
                            display: 'flex',
                            height: '36px',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            gap: '2px',
                            whiteSpace: 'nowrap',
                            pb: '2px',
                            fontSize: '10px',
                            textTransform: 'capitalize',
                            lineHeight: 'normal',
                          }}
                        >
                          <Box component="p" sx={{ fontWeight: 500, color: '#464c5e' }}>
                            {displayedAgent ? employeeDisplayName(displayedAgent) : displayedProfile.roleName}
                          </Box>
                          <Box component="p" sx={{ color: '#757f9c' }}>{displayedProfile.roleName}</Box>
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', width: '100%', flexWrap: 'wrap', alignContent: 'center', alignItems: 'center', gap: '4px' }}>
                  {emptyProfileTags.map((tag, index) => (
                    <Box
                      key={`${tag}-${index}`}
                      sx={{
                        display: 'flex',
                        height: '16px',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '10px',
                        border: '0.5px solid #e3e7f1',
                        px: '8px',
                        py: '2px',
                      }}
                    >
                      <Box component="span" sx={{ whiteSpace: 'nowrap', fontSize: '8px', textTransform: 'capitalize', lineHeight: 'normal', color: '#757f9c' }}>
                        {tag}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', width: '100%', flexDirection: 'column', gap: '8px', px: '8px' }}>
                <Box component="p" sx={{ width: '100%', fontSize: '10px', textTransform: 'capitalize', lineHeight: '14px', color: '#757f9c' }}>
                  {emptyRoleSummary}
                </Box>
                {emptyProfileTags.length > 0 && (
                  <Box sx={{ display: 'flex', width: '100%', flexWrap: 'wrap', alignContent: 'center', alignItems: 'center', gap: '4px' }}>
                    {emptyProfileTags.map((tag, index) => (
                      <Box
                        key={`${tag}-${index}`}
                        sx={{
                          display: 'flex',
                          height: '16px',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '10px',
                          border: '0.5px solid #e3e7f1',
                          px: '8px',
                          py: '2px',
                        }}
                      >
                        <Box component="span" sx={{ whiteSpace: 'nowrap', fontSize: '8px', textTransform: 'capitalize', lineHeight: 'normal', color: '#757f9c' }}>
                          {tag}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>

              <Box sx={{ display: 'flex', width: '100%', flexDirection: 'column', px: '8px', pb: '8px' }}>
                <Box sx={{ display: 'flex', width: '100%', alignItems: 'flex-start', whiteSpace: 'nowrap', textTransform: 'capitalize', lineHeight: 'normal' }}>
                  {emptyStats.map((item, index) => (
                    <Box
                      key={item.label}
                      sx={[
                        {
                          display: 'flex',
                          flex: 1,
                          flexDirection: 'column',
                          justifyContent: 'center',
                          gap: '4px',
                          border: '0.5px solid #e3e7f1',
                          px: '12px',
                          py: '6px',
                        },
                        ...(index === 0 ? [{ borderTopLeftRadius: '14px', borderBottomLeftRadius: '14px' }] : []),
                        ...(index === emptyStats.length - 1 ? [{ borderTopRightRadius: '14px', borderBottomRightRadius: '14px' }] : []),
                      ]}
                    >
                      <Box component="p" sx={{ fontSize: '16px', fontWeight: 500, color: '#18181a' }}>{item.value}</Box>
                      <Box component="p" sx={{ fontSize: '10px', color: '#464c5e' }}>{item.label}</Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </HoverCardContent>
          </HoverCard>
        )}
        <Box
          component="form"
          sx={[chatTokens.composerForm, ...(composerDragActive ? [chatTokens.composerFormDrag] : [])]}
          onDragEnter={handleComposerDragEnter}
          onDragOver={handleComposerDragOver}
          onDragLeave={handleComposerDragLeave}
          onDrop={handleComposerDrop}
          onSubmit={handleSubmit}
        >
          <Box component="input" sx={{ display: 'none' }} ref={fileInputRef} type="file" multiple onChange={handleComposerFileChange} />
          {composerDragActive && <Box sx={chatTokens.composerDropHint}>松开上传文件</Box>}

          {composerAttachments.length > 0 && (
            <Box sx={chatTokens.composerAttachments}>
              {composerAttachments.map((attachment) => (
                <Box
                  sx={[
                    chatTokens.composerAttachmentChip,
                    ...(attachment.uploadStatus === 'error' ? [chatTokens.composerAttachmentError] : []),
                  ]}
                  key={attachment.uploadKey}
                >
                  {attachment.kind === 'image' && attachment.data_url ? (
                    <Box component="img" sx={chatTokens.composerAttachmentImg} src={attachment.data_url} alt={attachment.filename} />
                  ) : (
                    <StaffdeckIcon name={attachment.kind === 'pdf' ? 'file' : 'folder'} size={16} />
                  )}
                  <Box component="span" sx={chatTokens.composerAttachmentCopy}>
                    <Box component="span" sx={chatTokens.composerAttachmentName}>{attachment.filename}</Box>
                    <Box component="span" sx={chatTokens.composerAttachmentStatus}>
                      {attachment.uploadStatus === 'uploading' && '解析中'}
                      {attachment.uploadStatus === 'ready' && attachmentTypeLabel(attachment)}
                      {attachment.uploadStatus === 'error' && (attachment.error || '上传失败')}
                    </Box>
                  </Box>
                  <Box
                    component="button"
                    type="button"
                    sx={chatTokens.composerAttachmentRemove}
                    onClick={() => removeComposerAttachment(attachment.uploadKey)}
                    aria-label="移除附件"
                  >
                    ×
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          <Box
            component="textarea"
            sx={chatTokens.composerTextarea}
            ref={textareaRef}
            value={input}
            rows={2}
            placeholder={t('输入消息，按 Enter 发送...')}
            onChange={(event) => setInput(event.target.value)}
            onPaste={handleComposerPaste}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => window.setTimeout(() => setIsComposing(false), 0)}
            onKeyDown={(event) => {
              const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean };
              if (
                event.key === 'Enter'
                && !event.shiftKey
                && !isComposing
                && !nativeEvent.isComposing
                && nativeEvent.keyCode !== 229
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />

          <Box
            sx={[
              { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' },
              ...(!composerActive ? [{ opacity: 0.95 }] : []),
            ]}
          >
            <Box sx={chatTokens.composerContextRow}>
              <DropdownMenu open={composerPlusOpen} onOpenChange={setComposerPlusOpen}>
                <DropdownMenuTrigger asChild>
                  <Box
                    component="button"
                    type="button"
                    sx={chatTokens.composerPlusBtn}
                    aria-label="添加"
                    title="添加"
                  >
                    <StaffdeckIcon name="plus" size={16} />
                  </Box>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" sx={[chatTokens.menuContent, { minWidth: '160px' }]}>
                  <DropdownMenuItem sx={chatTokens.menuItem} onSelect={() => handleComposerPlusAction('upload')}>
                    <StaffdeckIcon name="upload" size={16} />
                    <span>上传文件</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem sx={chatTokens.menuItem} onSelect={() => handleComposerPlusAction('scheduled_task')}>
                    <StaffdeckIcon name="clock" size={16} />
                    <span>定时任务</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {composerIntent === 'scheduled_task' && (
                <Box
                  component="button"
                  type="button"
                  sx={chatTokens.composerIntentChip}
                  onMouseEnter={() => setScheduleIntentHovered(true)}
                  onMouseLeave={() => setScheduleIntentHovered(false)}
                  onFocus={() => setScheduleIntentHovered(true)}
                  onBlur={() => setScheduleIntentHovered(false)}
                  onClick={() => setComposerIntent(null)}
                  aria-label="取消定时任务"
                  title="取消定时任务"
                >
                  <Box
                    component="span"
                    sx={[
                      {
                        position: 'relative',
                        display: 'inline-grid',
                        width: '16px',
                        height: '16px',
                        flexShrink: 0,
                        placeItems: 'center',
                        borderRadius: '9999px',
                        transition: 'color 0.15s',
                      },
                      ...(scheduleIntentHovered ? [{ color: '#18181a' }] : [{ color: '#858b9c' }]),
                    ]}
                  >
                    <StaffdeckIcon
                      name="clock"
                      size={14}
                      style={{ opacity: scheduleIntentHovered ? 0 : 1 }}
                    />
                    <StaffdeckIcon
                      name="close"
                      size={9}
                      style={{ width: 9, height: 9, opacity: scheduleIntentHovered ? 1 : 0 }}
                    />
                  </Box>
                  <span>定时任务</span>
                </Box>
              )}
              <Box sx={chatTokens.composerHint}>Enter 发送 / Shift+Enter 换行</Box>
            </Box>
            <Box sx={chatTokens.composerActionsRow}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Box
                    component="button"
                    type="button"
                    sx={chatTokens.composerModelBtn}
                    disabled={!enabledModelConfigs.length}
                  >
                    <span>{selectedModelConfig ? modelDisplayName(selectedModelConfig) : '默认模型'}</span>
                    <StaffdeckIcon name="arrow" size={14} style={{ transform: 'rotate(90deg)' }} />
                  </Box>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" sx={[chatTokens.menuContent, { maxHeight: '360px', minWidth: '240px', overflowY: 'auto' }]}>
                  {enabledModelConfigs.length === 0 ? (
                    <DropdownMenuItem sx={chatTokens.menuItem} disabled>暂无可用模型</DropdownMenuItem>
                  ) : (
                    enabledModelConfigs.map((model) => (
                      <DropdownMenuItem
                        key={model.id}
                        sx={chatTokens.modelMenuItem}
                        onSelect={() => changeModelConfig(model.id)}
                      >
                        <Box component="span" sx={chatTokens.modelMenuCopy}>
                          <Box component="span" sx={chatTokens.modelMenuName}>{modelDisplayName(model)}</Box>
                          <Box component="span" sx={chatTokens.modelMenuDetail}>{modelDetailText(model)}</Box>
                        </Box>
                        {selectedModelConfig?.id === model.id && <StaffdeckIcon name="check" size={15} />}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {currentSessionRunning && (
                <Box
                  component="button"
                  type="button"
                  sx={[chatTokens.composerSendBtn, chatTokens.composerStopBtn]}
                  onClick={abortStream}
                  aria-label="停止生成"
                  title="停止生成"
                >
                  <StaffdeckIcon name="stop" size={18} />
                </Box>
              )}
              <Box
                component="button"
                type="submit"
                sx={chatTokens.composerSendBtn}
                disabled={sendDisabled}
                aria-label={currentSessionRunning ? '加入发送队列' : '发送'}
                title={currentSessionRunning ? '加入发送队列' : '发送'}
              >
                <StaffdeckIcon name="send" size={18} />
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
