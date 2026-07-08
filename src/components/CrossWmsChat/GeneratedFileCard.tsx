import React, { useState } from 'react';
import { Box, Typography, IconButton, Chip, useTheme } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PreviewIcon from '@mui/icons-material/Visibility';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CodeIcon from '@mui/icons-material/Code';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import type { GeneratedFile } from '../../types/chat';
import { getGrayScale } from '../../constants/theme';

export type GeneratedFileInfo = GeneratedFile;

interface GeneratedFileCardProps {
  file: GeneratedFileInfo;
  isDark: boolean;
  onPreview?: (file: GeneratedFileInfo) => void;
}

function getFileIcon(fileName: string): React.ReactNode {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  if (['html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'json', 'md', 'xml', 'yaml', 'yml'].includes(ext)) {
    return <CodeIcon sx={{ fontSize: 20 }} />;
  }
  if (['pdf'].includes(ext)) {
    return <PictureAsPdfIcon sx={{ fontSize: 20 }} />;
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
    return <ImageIcon sx={{ fontSize: 20 }} />;
  }
  if (['txt', 'log', 'csv'].includes(ext)) {
    return <DescriptionIcon sx={{ fontSize: 20 }} />;
  }
  return <InsertDriveFileIcon sx={{ fontSize: 20 }} />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isPreviewable(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ['html', 'htm', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'txt', 'md', 'json', 'css', 'js'].includes(ext);
}

const GeneratedFileCard: React.FC<GeneratedFileCardProps> = React.memo(function GeneratedFileCard({ file, isDark, onPreview }) {
  const theme = useTheme();
  const gs = getGrayScale(isDark);
  const [hovered, setHovered] = useState(false);

  const canPreview = isPreviewable(file.fileName) && (file.previewUrl || onPreview);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = file.downloadUrl;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPreview) {
      onPreview(file);
    } else if (file.previewUrl) {
      window.open(file.previewUrl, '_blank', 'width=1024,height=768');
    }
  };

  const handleCardClick = () => {
    if (canPreview) {
      if (onPreview) {
        onPreview(file);
      } else if (file.previewUrl) {
        window.open(file.previewUrl, '_blank', 'width=1024,height=768');
      }
    } else {
      const link = document.createElement('a');
      link.href = file.downloadUrl;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const ext = file.fileName.split('.').pop()?.toUpperCase() || '';

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 1.5,
        py: 1.25,
        borderRadius: '10px',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
        bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
        transition: 'all 0.15s ease',
        cursor: 'pointer',
        '&:hover': {
          borderColor: isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.2)',
          bgcolor: isDark ? 'rgba(99,102,241,0.05)' : 'rgba(99,102,241,0.04)',
        },
      }}
      onClick={handleCardClick}
    >
      {/* 文件图标 */}
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)',
          color: '#6366F1',
          flexShrink: 0,
        }}
      >
        {getFileIcon(file.fileName)}
      </Box>

      {/* 文件信息 */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: gs.textPrimary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {file.fileName}
          </Typography>
          {ext && (
            <Chip
              label={ext}
              size="small"
              sx={{
                height: 18,
                fontSize: 10,
                fontWeight: 600,
                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                color: gs.textMuted,
                '& .MuiChip-label': { px: 0.75, py: 0 },
              }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
          <Typography sx={{ fontSize: 11, color: gs.textMuted }}>
            {formatFileSize(file.fileSize)}
          </Typography>
          {file.description && (
            <Typography sx={{ fontSize: 11, color: gs.textMuted }}>
              · {file.description}
            </Typography>
          )}
        </Box>
      </Box>

      {/* 操作按钮 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
        {canPreview && (
          <IconButton
            size="small"
            onClick={handlePreview}
            sx={{
              color: gs.textMuted,
              '&:hover': { color: '#6366F1', bgcolor: isDark ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.08)' },
            }}
            title="预览"
          >
            <PreviewIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
        <IconButton
          size="small"
          onClick={handleDownload}
          sx={{
            color: gs.textMuted,
            '&:hover': { color: '#22C55E', bgcolor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.08)' },
          }}
          title="下载"
        >
          <DownloadIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Box>
  );
});

export default GeneratedFileCard;
