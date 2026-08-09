import type * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/index.js';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

import StaffdeckIcon from './StaffdeckIcon.js';
import { isGalleryEmployee } from './auth.js';
import { employeeDisplayNameWithCreator, employeeProfile, resourceCount } from './employee.js';
import type { AgentProfileRead } from './types/index.js';
import EmployeeAvatar from './EmployeeAvatar.js';
import { staffTokens } from './lib/staffTokens.js';

// 菜单项/容器样式已集中到 DropdownMenuXxx wrapper（staffTokens.menuItem / menuContent），
// 此处无需再传 className。

export type EmployeeCardProps = {
  employee: AgentProfileRead;
  canManage: boolean;
  selected?: boolean;
  busy?: boolean;
  /** Show the top-right "更多" actions menu. Hidden on the 对话端 gallery. */
  showMenu?: boolean;
  onOpen: () => void;
  onStatus: (status: 'active' | 'archived') => void;
  onGallery: (published: boolean) => void;
  onDelete: () => void;
  onAvatar: () => void;
  onEdit: () => void;
  onChat: () => void;
};

export default function EmployeeCard({
  employee,
  canManage,
  selected = false,
  busy = false,
  showMenu = true,
  onOpen,
  onStatus,
  onGallery,
  onDelete,
  onAvatar,
  onEdit,
  onChat,
}: EmployeeCardProps) {
  const profile = employeeProfile(employee);
  void profile;
  const sopCount = resourceCount(employee.resources, 'skill');
  const skillCount = resourceCount(employee.resources, 'general_skill');
  const kbCount = resourceCount(employee.resources, 'knowledge_base');
  const galleryPublished = isGalleryEmployee(employee);
  const online = employee.status === 'active';

  const rawRoleName = (employee.metadata?.role_name as string | undefined) || profile.roleName;
  const displayName = employee.is_overall ? '开放广场' : employeeDisplayNameWithCreator(employee);
  const displayDescription = employee.description || '暂无描述';

  const stats: Array<{ value: number; label: string }> = [
    { value: kbCount, label: '资料' },
    { value: skillCount, label: '技能' },
    { value: sopCount, label: 'SOP' },
  ];

  return (
    <Box
      component="div"
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!busy) onOpen();
      }}
      onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!busy && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onOpen();
        }
      }}
      aria-pressed={selected}
      aria-busy={busy}
      sx={[
        {
          position: 'relative',
          display: 'flex',
          height: '100%',
          flexDirection: 'column',
          cursor: 'pointer',
          overflow: 'visible',
          borderRadius: '20px',
          border: '1px solid',
          borderColor: '#F6F6F6',
          bgcolor: '#fff',
          py: '12px',
          px: '10px',
          transition: 'box-shadow 0.2s',
        },
        selected && { boxShadow: '0 16px 30px 0 rgba(0,0,0,0.10)' },
      ] as SxProps<Theme>}
    >
      {/* Header band */}
      <Box
        sx={{
          display: 'flex',
          borderRadius: '18px',
          height: '68px',
          boxSizing: 'border-box',
          gap: '10px',
          bgcolor: 'var(--surface-muted)',
          p: '8px',
          mt: '34px',
        }}
      >
        {/* Avatar illustration */}
        <Box sx={{ width: '80px', position: 'relative' }}>
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <Box
              sx={{
                overflow: 'visible',
                borderRadius: 0,
                border: 0,
                bgcolor: 'transparent',
                background: 'none',
                boxShadow: 'none',
                '&::after, & > *::after': { display: 'none' },
              }}
            >
              <EmployeeAvatar
                agent={employee}
                width={80}
                height={94}
                fit="contain"
                objectPosition="center bottom"
              />
            </Box>
          </Box>
        </Box>

        {/* Name / role / status */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <Box
            component="strong"
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 700, color: '#18181A' }}
          >
            {employee.is_overall ? displayName : <span data-i18n-ignore>{displayName}</span>}
          </Box>
          <Box
            component="span"
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px', color: '#757F9C' }}
          >
            {rawRoleName === '待补充岗位' ? rawRoleName : <span data-i18n-ignore>{rawRoleName}</span>}
          </Box>
          <Box sx={{ lineHeight: 'none' }}>
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                py: '2px',
                px: '4px',
                fontSize: '8px',
                fontWeight: 600,
                color: '#757F9C',
                borderRadius: '90px',
                bgcolor: '#fff',
              }}
            >
              <Box
                component="i"
                aria-hidden="true"
                sx={[
                  { width: '6px', height: '6px', flexShrink: 0, borderRadius: '50%' },
                  online ? { bgcolor: '#22c55e' } : { bgcolor: '#9ca3af' },
                ] as SxProps<Theme>}
              />
              {online ? '在线' : '下线'}
            </Box>
          </Box>
        </Box>

        {/* Chat button */}
        <Box
          component="button"
          type="button"
          aria-label="发起对话"
          disabled={!online || busy}
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            onChat();
          }}
          sx={[
            {
              display: 'grid',
              width: '28px',
              height: '28px',
              flexShrink: 0,
              alignSelf: 'center',
              placeItems: 'center',
              borderRadius: '10px',
              bgcolor: '#fff',
              color: '#757F9C',
              transition: 'color 0.2s',
              '&:hover': { color: '#18181A' },
            },
            {
              '&:disabled': {
                cursor: 'not-allowed',
                opacity: 0.5,
                '&:hover': { color: '#757F9C' },
              },
            },
          ] as SxProps<Theme>}
        >
          <StaffdeckIcon name="chat" size={16} />
        </Box>
      </Box>

      {/* Actions menu */}
      {showMenu && (
        <Box sx={{ position: 'absolute', right: '12px', top: '12px', zIndex: 20 }}>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="员工操作"
              onPointerDown={(event: React.PointerEvent<HTMLButtonElement>) => event.stopPropagation()}
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => event.stopPropagation()}
              className="grid size-7 place-items-center rounded-[10px] text-[#757F9C] transition-colors outline-none hover:bg-black/5 focus-visible:bg-black/5"
            >
              <StaffdeckIcon name="more" size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sx={staffTokens.menuContent}
              onCloseAutoFocus={(event: Event) => event.preventDefault()}
            >
              <DropdownMenuItem
                disabled={!online || busy}
                onClick={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
                onSelect={() => onChat()}
              >
                <StaffdeckIcon name="chat" size={16} />
                发起对话
              </DropdownMenuItem>
              {online ? (
                <DropdownMenuItem
                  disabled={!canManage || busy}
                  onClick={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
                  onSelect={() => onStatus('archived')}
                >
                  <StaffdeckIcon name="pause" size={16} />
                  下线
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled
                  className="opacity-60 cursor-not-allowed"
                >
                  <StaffdeckIcon name="pause" size={16} />
                  当前未上线
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={!canManage || busy}
                onClick={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
                onSelect={() => onGallery(!galleryPublished)}
              >
                <StaffdeckIcon name="globe" size={16} />
                {galleryPublished ? '从广场下架' : '发布到广场'}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canManage || busy}
                onClick={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
                onSelect={() => onEdit()}
              >
                <StaffdeckIcon name="edit" size={16} />
                编辑资料
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canManage || busy}
                onClick={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
                onSelect={() => onAvatar()}
              >
                <StaffdeckIcon name="image" size={16} />
                设置头像
              </DropdownMenuItem>
              <DropdownMenuSeparator sx={{ my: '2px', borderColor: '#eef0f4' }} />
              <DropdownMenuItem
                variant="destructive"
                disabled={!canManage || busy}
                onClick={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
                onSelect={() => onDelete()}
              >
                <StaffdeckIcon name="trash" size={16} />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Box>
      )}

      {/* Description */}
      <Box
        component="p"
        sx={[
          {
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
            mt: '8px',
            height: '36px',
            flexShrink: 0,
            fontSize: '12px',
            lineHeight: '18px',
            color: '#757F9C',
          },
        ] as SxProps<Theme>}
      >
        {employee.description ? <span data-i18n-ignore>{displayDescription}</span> : displayDescription}
      </Box>

      {/* Work style tags */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', my: '8px', alignItems: 'center', gap: '10px' }}>
        {profile.workStyles.slice(0, 3).map((item) => (
          <Box
            component="span"
            key={item}
            sx={{
              borderRadius: '20px',
              px: '8px',
              py: '1px',
              fontSize: '10px',
              lineHeight: '13px',
              color: 'var(--muted-foreground)',
              border: '1px solid',
              borderColor: '#E3E7F1',
            }}
          >
            <span data-i18n-ignore>{item}</span>
          </Box>
        ))}
      </Box>

      {/* Stats — pinned to the bottom of the card */}
      <Box
        sx={{
          mt: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
          borderRadius: '14px',
          border: '1px solid',
          borderColor: '#E3E7F1',
          boxSizing: 'border-box',
        }}
      >
        {stats.map((stat, index) => (
          <Box
            key={stat.label}
            sx={[
              {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '4px',
                px: '20px',
                py: '6px',
              },
              index < stats.length - 1 && { borderRight: '1px solid', borderColor: '#eef1f5' },
            ] as SxProps<Theme>}
          >
            <Box component="strong" sx={{ fontSize: '18px', lineHeight: '24px', fontWeight: 700, color: '#18181A' }}>
              {stat.value}
            </Box>
            <Box component="em" sx={{ fontSize: '10px', fontStyle: 'normal', color: '#464C5E' }}>
              {stat.label}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
