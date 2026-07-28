import { MessageSquare, Plus, Trash2, Users } from 'lucide-react';
import { Box } from '@mui/material';

import EmployeeAvatar from '../../../components/staff/EmployeeAvatar.js';
import { employeeDisplayName } from '../../../components/staff/employee.js';

import { useChatSession } from './useChatSession.js';
import ChatHeader from './components/ChatHeader.js';
import MessageList from './components/MessageList.js';
import Composer from './components/Composer.js';
import ChatEmptyState from './components/ChatEmptyState.js';
import ChatDialogs from './components/ChatDialogs.js';

/**
 * ChatPage — 数字员工对话大厅（缺失页面补齐）
 *
 * 复用既有 chat 模块（useChatSession 数据层 + 一组已实现的展示组件），
 * 仅补齐顶层编排：左侧会话列表（按员工过滤）+ 右侧对话视图。
 * 后端 /api/staffdeck/chat/* 已真实实现，本页为纯前端编排，不新增后端逻辑。
 *
 * 路由：/staff/chat | /staff/chat/:sessionId | /staff/chat/draft/:agentId
 */
export default function ChatPage(): JSX.Element {
  const chat = useChatSession();
  const {
    visibleSidebarSessions,
    agents,
    activeConversationId,
    currentSession,
    openSession,
    openGallery,
    openDraftForAgent,
    requestDelete,
    sessionAgentFilter,
    setSessionAgentFilter,
    sessionFilterOptions,
  } = chat;

  return (
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0, bgcolor: '#f7f5ef' }}>
      {/* 左侧：会话列表 */}
      <Box
        component="aside"
        sx={{
          display: 'flex',
          width: '280px',
          flexShrink: 0,
          flexDirection: 'column',
          borderRight: '1px solid #e3e7f1',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: '16px', py: '14px' }}>
          <Box component="span" sx={{ fontSize: '14px', fontWeight: 500, color: '#18181a' }}>对话</Box>
          <Box
            component="button"
            type="button"
            onClick={openGallery}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: '8px',
              bgcolor: '#18181a',
              px: '10px',
              py: '5px',
              fontSize: '12px',
              color: '#fff',
              transition: 'background-color 0.15s',
              '&:hover': { bgcolor: '#303030' },
            }}
          >
            <Plus className="size-[13px]" />
            新建
          </Box>
        </Box>

        {sessionFilterOptions.length > 1 ? (
          <Box sx={{ px: '12px', pb: '10px' }}>
            <Box
              component="select"
              value={sessionAgentFilter}
              onChange={(event) => setSessionAgentFilter(event.target.value)}
              sx={{
                height: '32px',
                width: '100%',
                borderRadius: '8px',
                border: '1px solid #e3e7f1',
                bgcolor: 'background.paper',
                px: '8px',
                fontSize: '12px',
                color: '#464c5e',
                outline: 'none',
                '&:focus-visible': { borderColor: '#18181a' },
              }}
            >
              {sessionFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Box>
          </Box>
        ) : null}

        <Box sx={{ minHeight: 0, flex: 1, overflowY: 'auto', px: '10px', pb: '12px' }}>
          {visibleSidebarSessions.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                px: '12px',
                py: '40px',
                textAlign: 'center',
              }}
            >
              <MessageSquare className="size-[28px] text-[#c4c9d6]" />
              <Box component="p" sx={{ fontSize: '12px', lineHeight: '1.625', color: '#9aa0b5' }}>
                还没有对话，点击「新建」选择一个数字员工开始。
              </Box>
            </Box>
          ) : (
            <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: '6px', listStyle: 'none', m: 0, p: 0 }}>
              {visibleSidebarSessions.map((session) => {
                const agent = agents.find((item) => item.id === session.agent_id);
                const active = session.id === activeConversationId;
                const title = session.title || (agent ? employeeDisplayName(agent) : '新对话');
                return (
                  <Box
                    component="li"
                    key={session.id}
                    sx={{ '&:hover [data-delete]': { display: 'grid' } }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        borderRadius: '10px',
                        px: '10px',
                        py: '8px',
                        transition: 'background-color 0.15s',
                        ...(active
                          ? { bgcolor: '#eef1fb' }
                          : { '&:hover': { bgcolor: '#f6f6f6' } }),
                      }}
                    >
                      <Box
                        component="button"
                        type="button"
                        onClick={() => openSession(session.id)}
                        sx={{
                          display: 'flex',
                          minWidth: 0,
                          flex: 1,
                          alignItems: 'center',
                          gap: '10px',
                          textAlign: 'left',
                        }}
                      >
                        <Box
                          component="span"
                          sx={{
                            display: 'grid',
                            width: '32px',
                            height: '32px',
                            flexShrink: 0,
                            placeItems: 'center',
                            overflow: 'hidden',
                            borderRadius: '8px',
                            bgcolor: '#eef0f4',
                          }}
                        >
                          {agent ? (
                            <EmployeeAvatar agent={agent} size={32} radius={8} />
                          ) : (
                            <MessageSquare className="size-[16px] text-[#9aa0b5]" />
                          )}
                        </Box>
                        <Box component="span" sx={{ minWidth: 0, flex: 1 }}>
                          <Box
                            component="span"
                            sx={{
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: '13px',
                              fontWeight: 500,
                              color: '#18181a',
                            }}
                          >
                            {title}
                          </Box>
                          {session.last_question ? (
                            <Box
                              component="span"
                              sx={{
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: '11px',
                                color: '#9aa0b5',
                              }}
                            >
                              {session.last_question}
                            </Box>
                          ) : null}
                        </Box>
                      </Box>
                      <Box
                        component="button"
                        type="button"
                        data-delete=""
                        aria-label="删除会话"
                        onClick={() => requestDelete(session)}
                        sx={{
                          display: 'none',
                          width: '24px',
                          height: '24px',
                          flexShrink: 0,
                          placeItems: 'center',
                          borderRadius: '6px',
                          color: '#9aa0b5',
                          transition: 'background-color 0.15s, color 0.15s',
                          '&:hover': { bgcolor: '#fdeceb', color: '#f5483b' },
                        }}
                      >
                        <Trash2 className="size-[14px]" />
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        <Box sx={{ borderTop: '1px solid #e3e7f1', px: '12px', py: '10px' }}>
          <Box
            component="button"
            type="button"
            onClick={openGallery}
            sx={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              gap: '8px',
              borderRadius: '8px',
              px: '10px',
              py: '8px',
              fontSize: '12px',
              color: '#464c5e',
              transition: 'background-color 0.15s',
              '&:hover': { bgcolor: '#f6f6f6' },
            }}
          >
            <Users className="size-[15px]" />
            数字员工广场
          </Box>
        </Box>
      </Box>

      {/* 右侧：对话视图 */}
      <Box sx={{ display: 'flex', minWidth: 0, flex: 1, flexDirection: 'column' }}>
        <ChatHeader chat={chat} />
        {currentSession ? (
          <>
            <MessageList chat={chat} />
            <Composer chat={chat} />
          </>
        ) : (
          <ChatEmptyState chat={chat} />
        )}
        <ChatDialogs chat={chat} />
      </Box>
    </Box>
  );
}
