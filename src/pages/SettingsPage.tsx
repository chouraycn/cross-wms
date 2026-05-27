import React from 'react';
import { Box } from '@mui/material';
import SettingsPanel from '../components/Settings/SettingsPanel';

const SettingsPage: React.FC = () => {
  return (
    <Box sx={{ maxWidth: 900 }} className="page-fade-in">
      <SettingsPanel />
    </Box>
  );
};

export default SettingsPage;
