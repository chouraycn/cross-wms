import React from 'react';
import ModelManager from '../../shared/ModelManager';
import type { AppSettings } from '../../../contexts/AppSettingsContext';

export interface ModelManagementProps {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const ModelManagement: React.FC<ModelManagementProps> = ({ draft, setDraft }) => {
  return (
    <ModelManager
      models={draft.models.models}
      defaultModelId={draft.models.defaultModelId}
      variant="list"
      onChange={(models, defaultModelId) =>
        setDraft(prev => ({
          ...prev,
          models: { ...prev.models, models, defaultModelId },
        }))
      }
    />
  );
};

export default ModelManagement;
