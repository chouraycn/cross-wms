import { MessageSquare, Plus, Trash2, Users } from 'lucide-react';

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
    <div className="flex h-full min-h-0 bg-[#f7f5ef]">
      {/* 左侧：会话列表 */}
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-[#e3e7f1] bg-white">
        <div className="flex items-center justify-between px-[16px] py-[14px]">
          <span className="text-[14px] font-medium text-[#18181a]">对话</span>
          <button
            type="button"
            onClick={openGallery}
            className="flex items-center gap-[4px] rounded-[8px] bg-[#18181a] px-[10px] py-[5px] text-[12px] text-white transition-colors hover:bg-[#303030]"
          >
            <Plus className="size-[13px]" />
            新建
          </button>
        </div>

        {sessionFilterOptions.length > 1 ? (
          <div className="px-[12px] pb-[10px]">
            <select
              value={sessionAgentFilter}
              onChange={(event) => setSessionAgentFilter(event.target.value)}
              className="h-[32px] w-full rounded-[8px] border border-[#e3e7f1] bg-white px-[8px] text-[12px] text-[#464c5e] outline-none focus-visible:border-[#18181a]"
            >
              {sessionFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-[10px] pb-[12px]">
          {visibleSidebarSessions.length === 0 ? (
            <div className="flex flex-col items-center gap-[8px] px-[12px] py-[40px] text-center">
              <MessageSquare className="size-[28px] text-[#c4c9d6]" />
              <p className="text-[12px] leading-relaxed text-[#9aa0b5]">
                还没有对话，点击「新建」选择一个数字员工开始。
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-[6px]">
              {visibleSidebarSessions.map((session) => {
                const agent = agents.find((item) => item.id === session.agent_id);
                const active = session.id === activeConversationId;
                const title = session.title || (agent ? employeeDisplayName(agent) : '新对话');
                return (
                  <li key={session.id}>
                    <div
                      className={`group flex items-center gap-[10px] rounded-[10px] px-[10px] py-[8px] transition-colors ${
                        active ? 'bg-[#eef1fb]' : 'hover:bg-[#f6f6f6]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openSession(session.id)}
                        className="flex min-w-0 flex-1 items-center gap-[10px] text-left"
                      >
                        <span className="grid size-[32px] shrink-0 place-items-center overflow-hidden rounded-[8px] bg-[#eef0f4]">
                          {agent ? (
                            <EmployeeAvatar agent={agent} size={32} radius={8} />
                          ) : (
                            <MessageSquare className="size-[16px] text-[#9aa0b5]" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-[#18181a]">
                            {title}
                          </span>
                          {session.last_question ? (
                            <span className="block truncate text-[11px] text-[#9aa0b5]">
                              {session.last_question}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="删除会话"
                        onClick={() => requestDelete(session)}
                        className="hidden size-[24px] shrink-0 place-items-center rounded-[6px] text-[#9aa0b5] transition-colors hover:bg-[#fdeceb] hover:text-[#f5483b] group-hover:grid"
                      >
                        <Trash2 className="size-[14px]" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[#e3e7f1] px-[12px] py-[10px]">
          <button
            type="button"
            onClick={openGallery}
            className="flex w-full items-center gap-[8px] rounded-[8px] px-[10px] py-[8px] text-[12px] text-[#464c5e] transition-colors hover:bg-[#f6f6f6]"
          >
            <Users className="size-[15px]" />
            数字员工广场
          </button>
        </div>
      </aside>

      {/* 右侧：对话视图 */}
      <div className="flex min-w-0 flex-1 flex-col">
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
      </div>
    </div>
  );
}
