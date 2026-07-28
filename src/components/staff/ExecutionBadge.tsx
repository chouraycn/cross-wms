/**
 * 执行链路接入状态徽章。
 * 绿色「已接入执行链路」表示该项已接入员工执行链路（可被真实调用）；
 * 灰色「未接入」表示尚未接入。
 */
import { Box } from '@mui/material';

export function ExecutionBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        borderRadius: '50%',
        bgcolor: '#ecfdf3',
        px: '8px',
        py: '2px',
        fontSize: '11px',
        fontWeight: 500,
        color: '#067647',
      }}
    >
      <Box component="span" sx={{ width: '5px', height: '5px', borderRadius: '50%', bgcolor: '#12b76a' }} />
      已接入执行链路
    </Box>
  ) : (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        borderRadius: '50%',
        bgcolor: '#f2f3f7',
        px: '8px',
        py: '2px',
        fontSize: '11px',
        fontWeight: 500,
        color: '#858b9c',
      }}
    >
      未接入
    </Box>
  );
}

/** 执行链路状态响应（与 /api/staffdeck/execution-runtime 对齐） */
export type ExecutionRuntimeResponse = {
  code: number;
  data: {
    generalSkills: Record<string, boolean>;
    mcpServers: Array<{ id: string; name: string; enabled: boolean; connected: boolean }>;
  };
  message: string;
};
