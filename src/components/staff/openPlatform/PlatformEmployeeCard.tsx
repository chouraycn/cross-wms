import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import { ArrowRight } from '../icons';

export type PlatformStat = {
  value: ReactNode;
  label: string;
};

export type PlatformEmployeeCardProps = {
  /** Avatar illustration, typically an <EmployeeAvatar />. */
  avatar: ReactNode;
  name: ReactNode;
  role: ReactNode;
  online?: boolean;
  description: ReactNode;
  /** Bottom metric segments (资料 / 技能 / SOP …). */
  stats: PlatformStat[];
  onOpen?: () => void;
  className?: string;
};

/**
 * Compact 数字员工广场 card. Mirrors the Figma layout: a grey banner holding the
 * avatar (which pokes above the banner), name / role / online chip and a
 * chevron affordance, followed by a two-line description and a joined stat row.
 */
export default function PlatformEmployeeCard({
  avatar,
  name,
  role,
  online = true,
  description,
  stats,
  onOpen,
  className,
}: PlatformEmployeeCardProps) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      className={className}
      sx={{
        position: 'relative',
        display: 'flex',
        height: '140px',
        width: '100%',
        flexShrink: 0,
        flexDirection: 'column',
        justifyContent: 'flex-end',
        gap: '6px',
        borderRadius: '20px',
        border: '0.5px solid',
        borderColor: '#f6f6f6',
        bgcolor: '#fff',
        p: '4px',
        textAlign: 'left',
        transition: 'box-shadow 0.15s',
        '&:hover': { boxShadow: '0 10px 24px rgba(0,0,0,0.06)' },
        '&:hover [data-arrow]': { color: '#18181a' },
      }}
    >
      <Box sx={{ display: 'flex', width: '100%', flexDirection: 'column', px: '6px', pb: '2px' }}>
        <Box
          sx={{
            display: 'flex',
            height: '54px',
            width: '100%',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            borderRadius: '14px',
            bgcolor: '#f6f6f6',
            px: '8px',
            pb: '4px',
            pt: '8px',
          }}
        >
          <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'flex-end', gap: '10px' }}>
            <Box sx={{ display: 'flex', height: '59px', width: '50px', flexShrink: 0, alignItems: 'flex-end', justifyContent: 'center' }}>
              {avatar}
            </Box>
            <Box sx={{ display: 'flex', minWidth: 0, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '2px' }}>
              <Box
                component="p"
                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px', fontWeight: 500, color: '#18181a', lineHeight: '1.35' }}
              >
                {name}
              </Box>
              <Box
                component="p"
                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '8px', color: '#757f9c', lineHeight: '1.6' }}
              >
                {role}
              </Box>
              <Box
                component="span"
                sx={{ display: 'inline-flex', width: '34px', alignItems: 'center', justifyContent: 'center', borderRadius: '90px', bgcolor: '#fff', px: '4px', py: '2px' }}
              >
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <Box
                    component="i"
                    aria-hidden="true"
                    sx={{ width: '4px', height: '4px', flexShrink: 0, borderRadius: '9999px', bgcolor: online ? '#22c55e' : '#9ca3af' }}
                  />
                  <Box component="span" sx={{ fontSize: '8px', color: '#757f9c' }}>
                    {online ? '在线' : '下线'}
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
          <Box
            component="span"
            data-arrow
            sx={{
              display: 'grid',
              width: '24px',
              height: '24px',
              flexShrink: 0,
              alignSelf: 'center',
              placeItems: 'center',
              borderRadius: '10px',
              bgcolor: '#fff',
              color: '#757f9c',
              transition: 'color 0.15s',
            }}
          >
            <ArrowRight size={14} />
          </Box>
        </Box>
      </Box>

      <Box
        component="p"
        sx={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          height: '26px',
          width: '100%',
          px: '8px',
          fontSize: '10px',
          lineHeight: '13px',
          color: '#757f9c',
        }}
      >
        {description}
      </Box>

      <Box sx={{ display: 'flex', width: '100%', alignItems: 'stretch', px: '8px', pb: '4px' }}>
        {stats.map((stat, index) => (
          <Box
            key={stat.label}
            sx={{
              display: 'flex',
              height: '28px',
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              border: '0.5px solid',
              borderColor: '#e3e7f1',
              px: '10px',
              ...(index === 0 ? { borderTopLeftRadius: '10px', borderBottomLeftRadius: '10px' } : {}),
              ...(index === stats.length - 1 ? { borderTopRightRadius: '10px', borderBottomRightRadius: '10px' } : {}),
              ...(index > 0 ? { borderLeft: 0 } : {}),
            }}
          >
            <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: '2px', lineHeight: 'none' }}>
              <Box component="span" sx={{ fontSize: '10px', fontWeight: 500, color: '#18181a' }}>
                {stat.value}
              </Box>
              <Box component="span" sx={{ fontSize: '8px', color: '#464c5e' }}>
                {stat.label}
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
