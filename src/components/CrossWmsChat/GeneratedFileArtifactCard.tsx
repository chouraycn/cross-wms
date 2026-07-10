import React from 'react';
import { Box, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CodeIcon from '@mui/icons-material/Code';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import type { GeneratedFile } from '../../types/chat';
import { getGrayScale } from '../../constants/theme';

export type GeneratedFileArtifactInfo = GeneratedFile;

interface GeneratedFileArtifactCardProps {
  file: GeneratedFileArtifactInfo;
  isDark: boolean;
  onOpen?: (file: GeneratedFileArtifactInfo) => void;
}

function getFileIcon(fileName: string): React.ReactNode {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (['html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'json', 'md', 'xml', 'yaml', 'yml'].includes(ext)) {
    return <CodeIcon sx={{ fontSize: 18 }} />;
  }
  if (['pdf'].includes(ext)) {
    return <PictureAsPdfIcon sx={{ fontSize: 18 }} />;
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
    return <ImageIcon sx={{ fontSize: 18 }} />;
  }
  if (['txt', 'log', 'csv'].includes(ext)) {
    return <DescriptionIcon sx={{ fontSize: 18 }} />;
  }
  return <InsertDriveFileIcon sx={{ fontSize: 18 }} />;
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

const GeneratedFileArtifactCard: React.FC<GeneratedFileArtifactCardProps> = React.memo(function GeneratedFileArtifactCard({
  file,
  isDark,
  onOpen,
}) {
  const gs = getGrayScale(isDark);
  const canOpen = isPreviewable(file.fileName);

  const handleClick = () => {
    if (onOpen) {
      onOpen(file);
      return;
    }
    if (canOpen && file.previewUrl) {
      window.open(file.previewUrl, '_blank', 'width=1024,height=768');
      return;
    }
    const link = document.createElement('a');
    link.href = file.downloadUrl;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box
      onClick={handleClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 1.5,
        py: 1.25,
        borderRadius: '10px',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        '&:hover': {
          borderColor: isDark ? 'rgba(34,197,94,0.35)' : 'rgba(34,197,94,0.25)',
          bgcolor: isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.04)',
        },
      }}
    >
      {/* 文件图标 */}
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: isDark ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.12)',
          color: '#22C55E',
          flexShrink: 0,
        }}
      >
        {getFileIcon(file.fileName)}
      </Box>

      {/* 文件信息 */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
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
        <Typography sx={{ fontSize: 11, color: gs.textMuted, mt: 0.25 }}>
          {formatFileSize(file.fileSize)}
        </Typography>
      </Box>

      {/* 打开箭头 */}
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: '7px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: gs.textMuted,
          flexShrink: 0,
        }}
      >
        <OpenInNewIcon sx={{ fontSize: 16 }} />
      </Box>
    </Box>
  );
});

export default GeneratedFileArtifactCard;
