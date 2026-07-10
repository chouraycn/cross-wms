import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import type { SkillProposal } from '../../types/proposal';
import type { GrayScale } from '../../constants/theme';
import ProposalList from './ProposalList';
import ProposalDetail from './ProposalDetail';
import ProposalStats from './ProposalStats';

interface WorkshopPanelProps {
  gs: GrayScale;
  isDark: boolean;
}

export const WorkshopPanel: React.FC<WorkshopPanelProps> = ({ gs, isDark }) => {
  const [selectedProposal, setSelectedProposal] = useState<SkillProposal | null>(null);

  const handleUpdateProposal = (updated: SkillProposal) => {
    setSelectedProposal(updated);
  };

  if (selectedProposal) {
    return (
      <ProposalDetail
        proposal={selectedProposal}
        gs={gs}
        isDark={isDark}
        onBack={() => setSelectedProposal(null)}
        onUpdate={handleUpdateProposal}
      />
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
          技能提案工作坊
        </Typography>
        <Typography variant="body2" sx={{ color: gs.textMuted }}>
          管理技能的创建和更新提案，进行安全审查和审批
        </Typography>
      </Box>

      <ProposalStats gs={gs} isDark={isDark} />

      <Box sx={{ flex: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary, mb: 2 }}>
          提案列表
        </Typography>
        <ProposalList
          gs={gs}
          isDark={isDark}
          onSelectProposal={setSelectedProposal}
        />
      </Box>
    </Box>
  );
};

export default WorkshopPanel;