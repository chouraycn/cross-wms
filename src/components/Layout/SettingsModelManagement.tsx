import React from 'react';
import ModelManager from '../shared/ModelManager';
import type { AppSettings } from '../../contexts/AppSettingsContext';

interface SettingsModelManagementProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const SettingsModelManagement: React.FC<SettingsModelManagementProps> = ({ draft, setDraft }) => {
  return (
    <ModelManager
      models={draft.models.models}
      defaultModelId={draft.models.defaultModelId}
      variant="compact"
      onChange={(models, defaultModelId) =>
        setDraft(prev => ({
          ...prev,
          models: { ...prev.models, models, defaultModelId },
        }))
      }
    />
  );
};

export default SettingsModelManagement;
