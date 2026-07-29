import { Box, Typography } from '@mui/material';
import { MessageSquare, Users, Plus } from 'lucide-react';
import { useChatSession } from './useChatSession';
import { sessionHasUnreadReply } from './chatHelpers';
import EmployeeGalleryPage from '../EmployeeGalleryPage';
import EmployeeAvatar from '../../../components/staff/EmployeeAvatar';
import { employeeDisplayName } from '../../../components/staff/employee';
import { notify } from '../../../components/staff/ui/app-toast';
import { getEnterpriseAuthSession, isEnterpriseAdmin } from '../../../components/staff/auth';
import type { AgentProfileRead } from '../../../components/staff/types';
import type { ChatSession } from './chatTypes';

/**
 * ChatGalleryPage — 工作区对话画廊（复刻 StaffDeck-main ChatGalleryPage）
 *
 * 两栏布局：左侧会话侧栏（可见会话 + 未读标记 + 员工过滤），右侧员工画廊。
 * 复用既有 chat 数据层（useChatSession）与 EmployeeGalleryPage，不新增后端逻辑。
 *
 * 路由：/staff/chat-gallery | /enterprise/gallery
 */
export default function ChatGalleryPage(): JSX.Element {
  const chat = useChatSession();
  const auth = getEnterpriseAuthSession();
  const isAdmin = isEnterpriseAdmin(auth?.user);

  const {
    visibleSidebarSessions,
    agents,
    sessionReadTimes,
    sessionAgentFilter,
    setSessionAgentFilter,
    sessionFilterOptions,
    activeConversationId,
    openSession,
    openDraftForAgent,
    openGallery,
    toggleSidebar,
    sidebarCollapsed,
    handoffs,
    openHandoffInbox,
    openRename,
    requestDelete,
    logout,
  } = chat;

  async function startGalleryChat(agent: AgentProfileRead) {
    try {
      chat.setSessionAgentFilter(agent.id);
      openDraftForAgent(agent.id);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '无法打开数字员工');
    }
  }

  return (
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0, bgcolor: '#f7f5ef' }}>
      {/* 左侧：会话侧栏（含未读标记） */}
      <Box
        component="aside"
        sx={{
          display: sidebarCollapsed ? 'none' : 'flex',
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
              border: 'none',
              cursor: 'pointer',
              '&:hover': { bgcolor: '#303030' },
            }}
          >
            <Plus size={13} />
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
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Box>
          </Box>
        ) : null}

        <Box sx={{ minHeight: 0, flex: 1, overflowY: 'auto', px: '10px', pb: '12px' }}>
          {visibleSidebarSessions.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', px: '12px', py: '40px', textAlign: 'center' }}>
              <MessageSquare size={28} color="#c4c9d6" />
              <Box component="p" sx={{ fontSize: '12px', lineHeight: '1.625', color: '#9aa0b5' }}>
                还没有对话，点击「新建」选择一个数字员工开始。
              </Box>
            </Box>
          ) : (
            <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: '6px', listStyle: 'none', m: 0, p: 0 }}>
              {visibleSidebarSessions.map((session) => {
                const agent = agents.find((item) => item.id === session.agent_id);
                const active = session.id === activeConversationId;
                const unread = sessionHasUnreadReply(session, sessionReadTimes, activeConversationId);
                const title = session.title || (agent ? employeeDisplayName(agent) : '新对话');
                return (
                  <Box
                    component="li"
                    key={session.id}
                    onClick={() => openSession(session.id)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      borderRadius: '10px',
                      px: '10px',
                      py: '8px',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s',
                      bgcolor: active ? 'rgba(24,24,26,0.06)' : 'transparent',
                      '&:hover': { bgcolor: 'rgba(24,24,26,0.04)' },
                    }}
                  >
                    <EmployeeAvatar agent={agent} size={28} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography noWrap sx={{ fontSize: '12.5px', fontWeight: 500, color: '#18181a' }}>{title}</Typography>
                      <Typography noWrap sx={{ fontSize: '11px', color: '#9aa0b5' }}>
                        {session.summary || session.last_agent_question || '暂无消息'}
                      </Typography>
                    </Box>
                    {unread && (
                      <Box sx={{ width: '8px', height: '8px', borderRadius: '9999px', bgcolor: '#ef4444', flexShrink: 0 }} />
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>

      {/* 右侧：员工画廊 */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <EmployeeGalleryPage
          currentUser={auth?.user}
          isAdmin={isAdmin}
          onStartChat={startGalleryChat}
          onLogout={logout}
        />
      </Box>

      {/* 侧栏折叠按钮 */}
      <Box
        component="button"
        type="button"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? '展开会话栏' : '收起会话栏'}
        sx={{
          position: 'absolute',
          left: sidebarCollapsed ? 0 : '280px',
          top: '14px',
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          border: '1px solid #e3e7f1',
          borderRadius: '8px',
          bgcolor: 'background.paper',
          px: '8px',
          py: '4px',
          fontSize: '12px',
          color: '#464c5e',
          cursor: 'pointer',
        }}
      >
        <Users size={13} />
        {sidebarCollapsed ? '会话' : '收起'}
      </Box>
    </Box>
  );
}
