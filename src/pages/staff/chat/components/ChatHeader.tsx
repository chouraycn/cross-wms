import { ChevronDown, Edit, LogOut } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/staff/ui/dropdown-menu.js';
import LanguageSwitcher from '../../../../components/staff/LanguageSwitcher.js';
import { Box } from '@mui/material';
import { staffdeckDisplayText } from '../../../../components/staff/employee.js';

import { chatTokens } from '../chatTokens.js';
import type { UseChatSession } from '../useChatSession.js';

export default function ChatHeader({ chat }: { chat: UseChatSession }) {
  const { auth, currentSession, openRename, logout } = chat;
  const name = currentSession?.title ? staffdeckDisplayText(currentSession.title) : currentSession?.id || '新对话';
  const username = auth?.user?.username || '';
  const initial = username ? username.slice(0, 1).toUpperCase() : '--';

  return (
    <Box sx={chatTokens.header}>
      <Box sx={chatTokens.headerTitleStack}>
        <Box component="span" sx={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '4px' }}>
          <Box component="span" sx={chatTokens.headerTitleName}>{name}</Box>
          {currentSession && (
            <Box
              component="button"
              type="button"
              aria-label="重命名会话"
              onClick={() => openRename(currentSession)}
              sx={{
                display: 'inline-grid',
                width: '14px',
                height: '14px',
                flexShrink: 0,
                placeItems: 'center',
                color: '#858b9c',
                transition: 'background-color 0.15s, color 0.15s',
                '&:hover': { color: '#18181a' },
              }}
            >
              <Edit className="size-[14px]!" />
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: '8px' }}>
        <LanguageSwitcher />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Box
              component="button"
              type="button"
              aria-label="账户菜单"
              sx={{
                display: 'flex',
                flexShrink: 0,
                alignItems: 'center',
                gap: '10px',
                borderRadius: '10px',
                py: '4px',
                pl: '6px',
                pr: '10px',
                outline: 'none',
                transition: 'background-color 0.15s',
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
                  borderRadius: '9999px',
                  bgcolor: '#eef1fb',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#7e96dc',
                }}
              >
                {initial}
              </Box>
              <ChevronDown className="size-[14px] shrink-0 text-[#757F9C]" />
            </Box>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sx={{ minWidth: '160px', width: 'fit-content' }}
          >
            <DropdownMenuItem
              onSelect={logout}
              sx={chatTokens.menuItem}
            >
              <LogOut className="size-[16px]" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Box>
    </Box>
  );
}
