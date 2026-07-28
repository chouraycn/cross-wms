import { Box, Typography } from '@mui/material';

import { Button } from './ui/index.js';
import StaffdeckIcon from './StaffdeckIcon.js';

export type EmptyEmployeeStateProps = {
  isAdmin: boolean;
  onCreate: () => void;
  onBrowsePlatform: () => void;
};

/** Empty-state placeholder shown when the tenant has no digital employees yet. */
export default function EmptyEmployeeState({
  isAdmin,
  onCreate,
  onBrowsePlatform,
}: EmptyEmployeeStateProps) {
  return (
    <Box
      sx={{
        minHeight: '100%',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
        px: '48px',
        pt: '32px',
        pb: '43px',
        '@media (max-width:900px)': { px: '16px' },
      }}
    >
      <Box
        sx={{
          mx: 'auto',
          display: 'flex',
          minHeight: 'calc(100vh - 220px)',
          maxWidth: 560,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            width: 96,
            height: 96,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '28px',
            border: '1px solid #e7dfd3',
            bgcolor: '#fff',
            boxShadow: '0 12px 30px rgba(37,32,24,0.08)',
          }}
        >
          <StaffdeckIcon name="user" size={40} className="text-[#858b9c]" />
          <Box
            sx={{
              position: 'absolute',
              bottom: -8,
              right: -8,
              display: 'flex',
              width: 34,
              height: 34,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              bgcolor: '#29282d',
              color: '#fff',
              boxShadow: '0 6px 16px rgba(0,0,0,0.22)',
            }}
          >
            <StaffdeckIcon name="plus" size={18} className="text-white" />
          </Box>
        </Box>

        <Typography sx={{ mt: '24px', fontSize: 22, fontWeight: 600, lineHeight: 1.2, color: '#18181a' }}>
          还没有数字员工
        </Typography>
        <Typography sx={{ mt: '10px', fontSize: 14, lineHeight: '22px', color: '#757f9c' }}>
          {isAdmin
            ? '创建你的第一位数字员工，为它配置知识库、技能与工具，即可开始接管对话与任务。'
            : '当前还没有可管理的数字员工，创建一位或从开放广场复制已发布的配置作为起点。'}
        </Typography>

        <Box
          sx={{
            mt: '28px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
          }}
        >
          <Button
            onClick={onCreate}
            sx={{
              height: 42,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              borderRadius: '14px',
              bgcolor: '#29282d',
              px: '22px',
              fontSize: 14,
              fontWeight: 500,
              color: '#fff',
              '&:hover': { bgcolor: '#3a3940' },
            }}
          >
            <StaffdeckIcon name="plus" size={16} className="text-white" />
            新建数字员工
          </Button>
          <Button
            variant="outline"
            onClick={onBrowsePlatform}
            sx={{
              height: 42,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              borderRadius: '14px',
              border: '0.5px solid #e3e7f1',
              bgcolor: '#fff',
              px: '22px',
              fontSize: 14,
              fontWeight: 400,
              color: '#464c5e',
              '&:hover': { bgcolor: '#f6f6f6', color: '#464c5e' },
            }}
          >
            <StaffdeckIcon name="globe" size={16} />
            浏览开放广场
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
