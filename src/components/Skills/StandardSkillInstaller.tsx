/**
 * 标准技能安装器
 *
 * 集成 SKILL.md 预览、依赖检查、权限确认、类别映射等功能，
 * 提供完整的标准技能安装流程。
 *
 * @module StandardSkillInstaller
 */

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
  Paper,
  IconButton,
  LinearProgress,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import { useToast } from '../../contexts/ToastContext';
import { parseSkillMd } from '../../services/skill/skillMdParser';
import { installStandardSkill } from '../../services/skill/standardSkillAdapter';
import SkillMdPreview from './SkillMdPreview';
import SkillDependencyChecker from './SkillDependencyChecker';
import CategoryMapper from './CategoryMapper';
import { mapCategory } from '../../services/skill/standardSkillAdapter';

/**
 * StandardSkillInstaller 组件属性
 */
interface StandardSkillInstallerProps {
  /** 对话框是否打开 */
  open: boolean;
  /** 关闭对话框回调 */
  onClose: () => void;
  /** 安装成功回调（可选） */
  onInstalled?: (skillId: string) => void;
  /** 预填的文件内容（可选） */
  initialContent?: string;
  /** 预填的文件路径（可选） */
  initialFilePath?: string;
}

/**
 * 安装步骤
 */
type InstallStep = 'select' | 'preview' | 'installing' | 'done';

/**
 * 标准技能安装器
 *
 * @param props - 组件属性
 * @returns React 组件
 */
const StandardSkillInstaller: React.FC<StandardSkillInstallerProps> = ({
  open,
  onClose,
  onInstalled,
  initialContent,
  initialFilePath,
}) => {
  const { showToast } = useToast();

  // 状态管理
  const [currentStep, setCurrentStep] = useState<InstallStep>('select');
  const [fileContent, setFileContent] = useState<string>(initialContent || '');
  const [filePath, setFilePath] = useState<string>(initialFilePath || '');
  const [fileName, setFileName] = useState<string>('');
  const [parsed, setParsed] = useState<any>(null);
  const [mappedCategory, setMappedCategory] = useState<string>('tool');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string>('');
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);

  /**
   * 处理文件选择
   */
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // 检查文件类型
    if (!file.name.endsWith('.md')) {
      showToast('请选择 .md 文件', 'error');
      return;
    }

    setFileName(file.name);
    setFilePath(file.name);

    // 读取文件内容
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileContent(content);
      parseAndPreview(content, file.name);
    };
    reader.onerror = () => {
      showToast('文件读取失败', 'error');
    };
    reader.readAsText(file);
  }, [showToast]);

  /**
   * 解析并预览
   */
  const parseAndPreview = useCallback((content: string, path: string) => {
    try {
      const result = parseSkillMd(content, path);
      setParsed(result);

      // 自动映射类别
      const category = mapCategory(result.category);
      setMappedCategory(category);

      setCurrentStep('preview');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(`解析失败: ${message}`, 'error');
    }
  }, [showToast]);

  /**
   * 处理拖拽上传
   */
  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    // 检查文件类型
    if (!file.name.endsWith('.md')) {
      showToast('请拖拽 .md 文件', 'error');
      return;
    }

    setFileName(file.name);
    setFilePath(file.name);

    // 读取文件内容
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileContent(content);
      parseAndPreview(content, file.name);
    };
    reader.onerror = () => {
      showToast('文件读取失败', 'error');
    };
    reader.readAsText(file);
  }, [showToast, parseAndPreview]);

  /**
   * 处理拖拽悬停
   */
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  /**
   * 执行安装
   */
  const performInstall = useCallback(async () => {
    setInstalling(true);
    setInstallError('');

    try {
      const result = await installStandardSkill(fileContent, filePath);

      if (result.success) {
        showToast('技能安装成功', 'success');
        setCurrentStep('done');

        if (onInstalled && result.skillId) {
          onInstalled(result.skillId);
        }
      } else {
        setInstallError(result.error || '安装失败');
        showToast(result.error || '安装失败', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInstallError(message);
      showToast(`安装失败: ${message}`, 'error');
    } finally {
      setInstalling(false);
    }
  }, [fileContent, filePath, showToast, onInstalled]);

  /**
   * 处理安装按钮点击
   */
  const handleInstall = useCallback(() => {
    // 如果有危险权限，先显示权限确认对话框
    if (parsed?.permissions && parsed.permissions.length > 0) {
      const hasDangerous = parsed.permissions.some((p: string) =>
        ['execute_command', 'network', 'shell', 'root', 'sudo'].includes(p),
      );

      if (hasDangerous) {
        setPermissionDialogOpen(true);
        return;
      }
    }

    // 否则直接安装
    performInstall();
  }, [parsed, performInstall]);

  /**
   * 重置状态
   */
  const resetState = useCallback(() => {
    setCurrentStep('select');
    setFileContent('');
    setFilePath('');
    setFileName('');
    setParsed(null);
    setMappedCategory('tool');
    setPermissionDialogOpen(false);
    setInstalling(false);
    setInstallError('');
  }, []);

  /**
   * 处理关闭
   */
  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  /**
   * 渲染文件选择区域
   */
  const renderFileSelect = () => (
    <Paper
      variant="outlined"
      sx={{
        p: 4,
        textAlign: 'center',
        border: '2px dashed',
        borderColor: 'grey.300',
        borderRadius: 2,
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': {
          borderColor: 'primary.main',
          bgcolor: 'action.hover',
        },
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => document.getElementById('skill-file-input')?.click()}
    >
      <input
        id="skill-file-input"
        type="file"
        accept=".md"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
      <UploadFileIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
      <Typography variant="h6" color="text.secondary" gutterBottom>
        拖拽 .md 文件到此处 或 点击选择
      </Typography>
      <Typography variant="body2" color="text.secondary">
        支持标准 SKILL.md 格式文件
      </Typography>
    </Paper>
  );

  /**
   * 渲染预览和安装界面
   */
  const renderPreview = () => (
    <Box sx={{ maxHeight: '60vh', overflow: 'auto' }}>
      {/* 预览 */}
      {parsed && (
        <Box sx={{ mb: 2 }}>
          <SkillMdPreview parsed={parsed} fileName={fileName} />
        </Box>
      )}

      {/* 依赖检查 */}
      {parsed?.dependencies && parsed.dependencies.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <SkillDependencyChecker dependencies={parsed.dependencies} />
        </Box>
      )}

      {/* 权限列表 */}
      {parsed?.permissions && parsed.permissions.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            权限声明
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            {parsed.permissions.map((perm: string, index: number) => (
              <Alert
                key={index}
                severity={
                  ['execute_command', 'network', 'shell', 'root', 'sudo'].includes(perm)
                    ? 'error'
                    : ['file_write', 'delete', 'install'].includes(perm)
                    ? 'warning'
                    : 'info'
                }
                sx={{ py: 0 }}
              >
                {perm}
              </Alert>
            ))}
          </Box>
        </Box>
      )}

      {/* 类别映射 */}
      <Box sx={{ mb: 2 }}>
        <CategoryMapper
          originalCategory={parsed?.category}
          mappedCategory={mappedCategory}
          onCategoryChange={setMappedCategory}
        />
      </Box>

      {/* 安装错误 */}
      {installError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {installError}
        </Alert>
      )}

      {/* 安装进度 */}
      {installing && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
            正在安装...
          </Typography>
        </Box>
      )}
    </Box>
  );

  /**
   * 渲染完成界面
   */
  const renderDone = () => (
    <Box sx={{ textAlign: 'center', py: 3 }}>
      <Typography variant="h6" color="success.main" gutterBottom>
        安装成功！
      </Typography>
      <Typography variant="body2" color="text.secondary">
        技能 "{parsed?.name || fileName}" 已成功安装
      </Typography>
    </Box>
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        aria-labelledby="installer-dialog-title"
      >
        <DialogTitle id="installer-dialog-title">
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DownloadIcon color="primary" />
              <Typography variant="h6" component="span">
                安装标准技能
              </Typography>
            </Box>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          {currentStep === 'select' && renderFileSelect()}
          {(currentStep === 'preview' || currentStep === 'installing') && renderPreview()}
          {currentStep === 'done' && renderDone()}
        </DialogContent>

        {(currentStep === 'preview' || currentStep === 'installing') && (
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleClose} color="inherit" disabled={installing}>
              取消
            </Button>
            <Button
              onClick={handleInstall}
              color="primary"
              variant="contained"
              disabled={installing || !parsed}
              startIcon={installing ? <CircularProgress size={20} /> : <DownloadIcon />}
            >
              {installing ? '安装中...' : '安装技能'}
            </Button>
          </DialogActions>
        )}

        {currentStep === 'done' && (
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleClose} color="primary" variant="contained">
              完成
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </>
  );
};

export default StandardSkillInstaller;
