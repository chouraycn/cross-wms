import React from 'react';
import ModelManager from '../shared/ModelManager';
import { useModels } from '../../contexts/ModelsContext';

const SettingsModelManagement: React.FC = () => {
  const { models: modelList, defaultModelId, updateModels } = useModels();

  return (
    <ModelManager
      models={modelList}
      defaultModelId={defaultModelId}
      variant="compact"
      onChange={(models, newDefaultModelId) => updateModels(models, newDefaultModelId)}
    />
  );
};

export default SettingsModelManagement;
