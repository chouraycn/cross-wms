/**
 * 技能依赖检查组件
 *
 * 检查技能依赖是否满足，显示缺失的依赖，并提供安装缺失依赖的选项。
 *
 * @module SkillDependencyChecker
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Box,
  Alert,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import LinkIcon from '@mui/icons-material/Link';
import { checkDependencies, DependencyCheckResult } from '../../services/skill/standardSkillAdapter';
import { getAllSkills } from '../../stores/skillStore';

/**
 * SkillDependencyChecker 组件属性
 */
interface SkillDependencyCheckerProps {
  /** 依赖的技能名称列表 */
  dependencies: string[];
  /** 安装缺失依赖的回调（可选） */
  onInstallMissing?: (missing: string[]) => void;
}

/**
 * 技能依赖检查组件
 *
 * @param props - 组件属性
 * @returns React 组件
 */
const SkillDependencyChecker: React.FC<SkillDependencyCheckerProps> = ({ dependencies, onInstallMissing }) => {
  const [loading, setLoading] = useState(true);
  const [checkResult, setCheckResult] = useState<DependencyCheckResult | null>(null);
  const [installedSkills, setInstalledSkills] = useState<string[]>([]);

  /**
   * 执行依赖检查
   */
  const performCheck = useCallback(async () => {
    setLoading(true);
    try {
      const allSkills = getAllSkills();
      const installed = allSkills.map((s) => s.name);
      setInstalledSkills(installed);

      const result = checkDependencies(dependencies, installed);
      setCheckResult(result);
    } catch (error) {
      // console.error('Failed to check dependencies:', error);
      setCheckResult({
        satisfied: false,
        missing: dependencies,
        installed: [],
      });
    } finally {
      setLoading(false);
    }
  }, [dependencies]);

  // 组件挂载时执行依赖检查
  useEffect(() => {
    if (dependencies && dependencies.length > 0) {
      performCheck();
    } else {
      setLoading(false);
      setCheckResult({
        satisfied: true,
        missing: [],
        installed: [],
      });
    }
  }, [dependencies, performCheck]);

  /**
   * 处理安装缺失依赖
   */
  const handleInstallMissing = () => {
    if (checkResult && checkResult.missing.length > 0 && onInstallMissing) {
      onInstallMissing(checkResult.missing);
    }
  };

  // 无依赖时显示提示
  if (!dependencies || dependencies.length === 0) {
    return (
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardHeader
          avatar={<LinkIcon color="action" />}
          title="依赖检查"
          subheader="此技能无依赖"
        />
      </Card>
    );
  }

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardHeader
        avatar={<LinkIcon color="primary" />}
        title="依赖检查"
        subheader={`${dependencies.length} 个依赖`}
      />
      <CardContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            {/* 依赖列表 */}
            <List dense>
              {dependencies.map((dep, index) => {
                const isInstalled = checkResult?.installed.includes(dep) || false;
                const isMissing = checkResult?.missing.includes(dep) || false;

                return (
                  <ListItem key={index} sx={{ pl: 0 }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {isInstalled ? (
                        <CheckCircleIcon color="success" fontSize="small" />
                      ) : isMissing ? (
                        <CancelIcon color="error" fontSize="small" />
                      ) : (
                        <WarningIcon color="warning" fontSize="small" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={dep}
                      secondary={isInstalled ? '已安装' : isMissing ? '未安装' : undefined}
                    />
                  </ListItem>
                );
              })}
            </List>

            {/* 缺失依赖警告 */}
            {checkResult && !checkResult.satisfied && (
              <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
                有 {checkResult.missing.length} 个依赖未安装：{checkResult.missing.join(', ')}
              </Alert>
            )}

            {/* 操作按钮 */}
            {checkResult && !checkResult.satisfied && (
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                {onInstallMissing && (
                  <Button
                    variant="contained"
                    size="small"
                    color="primary"
                    onClick={handleInstallMissing}
                  >
                    安装缺失依赖
                  </Button>
                )}
                <Button
                  variant="text"
                  size="small"
                  color="warning"
                >
                  跳过（不推荐）
                </Button>
              </Box>
            )}

            {/* 所有依赖满足时显示成功提示 */}
            {checkResult && checkResult.satisfied && (
              <Alert severity="success" sx={{ mt: 2 }}>
                所有依赖已满足
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SkillDependencyChecker;
