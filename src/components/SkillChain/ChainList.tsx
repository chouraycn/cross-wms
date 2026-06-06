import React from 'react';
import { List, ListItemButton, ListItemText, Typography, Chip, Box } from '@mui/material';
import type { SkillChain } from '../../types/skill';

interface ChainListProps {
  chains: SkillChain[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

const ChainList: React.FC<ChainListProps> = ({ chains, selectedId, onSelect, onCreate }) => {
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
          技能链 ({chains.length})
        </Typography>
        <Chip
          label="+ 新建"
          size="small"
          color="primary"
          onClick={onCreate}
          sx={{ cursor: 'pointer' }}
        />
      </Box>
      <List dense disablePadding>
        {chains.map((chain) => (
          <ListItemButton
            key={chain.id}
            selected={chain.id === selectedId}
            onClick={() => onSelect(chain.id)}
            sx={{ borderRadius: 1, mb: 0.5 }}
          >
            <ListItemText
              primary={chain.name}
              secondary={`${chain.nodes.length} 个节点 · ${new Date(chain.updatedAt).toLocaleDateString()}`}
              primaryTypographyProps={{
                fontSize: '0.85rem',
                fontWeight: chain.id === selectedId ? 600 : 400,
              }}
              secondaryTypographyProps={{ fontSize: '0.7rem' }}
            />
          </ListItemButton>
        ))}
        {chains.length === 0 && (
          <Typography
            variant="body2"
            sx={{ color: 'text.disabled', textAlign: 'center', py: 2 }}
          >
            暂无技能链，点击"新建"开始
          </Typography>
        )}
      </List>
    </Box>
  );
};

export default ChainList;
