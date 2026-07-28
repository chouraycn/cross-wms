import EmployeeAvatar from '../../../../components/staff/EmployeeAvatar.js';
import { Box } from '@mui/material';
import { employeeDisplayName } from '../../../../components/staff/employee.js';

import { chatTokens } from '../chatTokens.js';
import type { UseChatSession } from '../useChatSession.js';

export default function ChatEmptyState({ chat }: { chat: UseChatSession }) {
  const { displayedAgent, displayedProfile, emptyRoleSummary, emptyProfileTags, emptyStats } = chat;

  return (
    <Box sx={chatTokens.empty}>
      <Box sx={chatTokens.emptyGreetingCard}>
        <Box sx={{ display: 'flex', height: '102px', gap: '10px' }}>
          <Box sx={{ position: 'relative', height: '100%', width: '136px' }}>
            <Box sx={{ position: 'absolute', bottom: 0, left: 0, height: '160px', width: '136px' }}>
              <EmployeeAvatar
                profile={displayedProfile ?? undefined}
                agent={displayedAgent ?? undefined}
                width={136}
                height={160}
                radius={0}
                fit="cover"
                objectPosition="bottom"
                className="bg-transparent!"
              />
            </Box>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', pb: '18px', textTransform: 'capitalize' }}>
            <Box component="strong" sx={chatTokens.emptyTitle}>
              Hello {displayedAgent ? employeeDisplayName(displayedAgent) : ''}！
            </Box>
            <Box component="span" sx={chatTokens.emptySubtitle}>我们来做什么？</Box>
          </Box>
        </Box>
      </Box>

      <Box sx={chatTokens.emptyCard}>
        <Box sx={{ display: 'flex', minWidth: 0, flex: 1, flexDirection: 'column', justifyContent: 'center', gap: '8px', px: '4px' }}>
          <Box component="p" sx={chatTokens.emptyRole}>{emptyRoleSummary}</Box>
          <Box sx={chatTokens.emptyTags}>
            {emptyProfileTags.map((tag, index) => (
              <span key={`${tag}-${index}`}>{tag}</span>
            ))}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flex: 1, alignItems: 'stretch' }}>
          {emptyStats.map((item) => (
            <Box key={item.label} sx={chatTokens.emptyStatCell}>
              <span style={{ fontSize: '18px', fontWeight: 500, lineHeight: 1 }}>{item.value}</span>
              <span style={{ fontSize: '10px', lineHeight: 1 }}>{item.label}</span>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
