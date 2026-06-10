import React from 'react';
import ModelManager from '../../shared/ModelManager';
import { useModels } from '../../../contexts/ModelsContext';

const ModelManagement: React.FC = () => {
  const { models: modelList, defaultModelId, updateModels } = useModels();

  return (
    <ModelManager
      models={modelList}
      defaultModelId={defaultModelId}
      variant="list"
      onChange={(models, newDefaultModelId) => updateModels(models, newDefaultModelId)}
    />
  );
};

export default ModelManagement;
