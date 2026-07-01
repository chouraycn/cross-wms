/**
 * 代码变更预览组件
 *
 * 功能：
 * - Diff 视图展示（左侧旧代码、右侧新代码）
 * - 行级别高亮（新增=绿、删除=红、修改=黄）
 * - 文件列表导航
 * - 统计信息（新增行数、删除行数、修改文件数）
 * - 搜索差异内容
 * - 过滤变更类型（新增/修改/删除）
 */

import React, { useState, useMemo, memo } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  InputAdornment,
  Chip,
  IconButton,
  Divider,
  useTheme,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import EditIcon from '@mui/icons-material/Edit';
import { getGrayScale } from '../../constants/theme';

// ===================== 类型定义 =====================

interface DiffLine {
  type: 'add' | 'del' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface FileDiff {
  file: string;
  hunks: DiffHunk[];
}

interface FileSummary {
  file: string;
  changes: number;
  insertions: number;
  deletions: number;
  binary: boolean;
}

interface CodeChangePreviewProps {
  files: FileSummary[];
  diffs: FileDiff[];
  stats: {
    files: number;
    insertions: number;
    deletions: number;
  };
}

// ===================== DiffLineView 组件 =====================

interface DiffLineViewProps {
  line: DiffLine;
  isDark: boolean;
  searchTerm?: string;
}

const DiffLineView = memo(({ line, isDark, searchTerm }: DiffLineViewProps) => {
  const gs = getGrayScale(isDark);

  // 高亮搜索词
  const highlightSearch = (content: string) => {
    if (!searchTerm) return content;

    const parts = content.split(searchTerm);
    return parts.map((part, index) => (
      <React.Fragment key={index}>
        {part}
        {index < parts.length - 1 && (
          <span style={{ backgroundColor: '#ffeb3b', color: '#000' }}>
            {searchTerm}
          </span>
        )}
      </React.Fragment>
    ));
  };

  const getLineColor = () => {
    switch (line.type) {
      case 'add':
        return isDark ? '#2e7d32' : '#c8e6c9';
      case 'del':
        return isDark ? '#c62828' : '#ffcdd2';
      default:
        return 'transparent';
    }
  };

  const getTextColor = () => {
    switch (line.type) {
      case 'add':
        return isDark ? '#a5d6a7' : '#2e7d32';
      case 'del':
        return isDark ? '#ef9a9a' : '#c62828';
      default:
        return gs.textPrimary;
    }
  };

  const getPrefix = () => {
    switch (line.type) {
      case 'add':
        return '+';
      case 'del':
        return '-';
      default:
        return ' ';
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        fontFamily: 'Monaco, Menlo, "Courier New", monospace',
        fontSize: '0.75rem',
        lineHeight: 1.6,
        backgroundColor: getLineColor(),
        '&:hover': {
          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
        },
      }}
    >
      {/* 行号 */}
      <Box
        sx={{
          minWidth: '40px',
          px: 1,
          textAlign: 'right',
          color: gs.textMuted,
          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
          borderRight: `1px solid ${gs.border}`,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {line.oldLineNumber || ''}
      </Box>
      <Box
        sx={{
          minWidth: '40px',
          px: 1,
          textAlign: 'right',
          color: gs.textMuted,
          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
          borderRight: `1px solid ${gs.border}`,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {line.newLineNumber || ''}
      </Box>

      {/* 内容 */}
      <Box
        sx={{
          px: 1,
          flex: 1,
          whiteSpace: 'pre',
          overflow: 'hidden',
          color: getTextColor(),
        }}
      >
        <span style={{ userSelect: 'none' }}>{getPrefix()}</span>
        {highlightSearch(line.content)}
      </Box>
    </Box>
  );
});

DiffLineView.displayName = 'DiffLineView';

// ===================== DiffFileView 组件 =====================

interface DiffFileViewProps {
  fileDiff: FileDiff;
  isDark: boolean;
  searchTerm?: string;
}

const DiffFileView = memo(({ fileDiff, isDark, searchTerm }: DiffFileViewProps) => {
  const gs = getGrayScale(isDark);

  return (
    <Box sx={{ mb: 2 }}>
      {/* 文件名 */}
      <Box
        sx={{
          px: 2,
          py: 1,
          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
          borderBottom: `1px solid ${gs.border}`,
          borderTop: `1px solid ${gs.border}`,
          fontFamily: 'Monaco, Menlo, "Courier New", monospace',
          fontSize: '0.8rem',
          fontWeight: 600,
          color: gs.textPrimary,
        }}
      >
        {fileDiff.file}
      </Box>

      {/* Diff 内容 */}
      {fileDiff.hunks.map((hunk, hunkIndex) => (
        <Box key={hunkIndex}>
          {/* Hunk Header */}
          <Box
            sx={{
              px: 2,
              py: 0.5,
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              borderBottom: `1px solid ${gs.border}`,
              fontFamily: 'Monaco, Menlo, "Courier New", monospace',
              fontSize: '0.75rem',
              color: gs.textSecondary,
            }}
          >
            {hunk.header}
          </Box>

          {/* Lines */}
          {hunk.lines.map((line, lineIndex) => (
            <DiffLineView
              key={lineIndex}
              line={line}
              isDark={isDark}
              searchTerm={searchTerm}
            />
          ))}
        </Box>
      ))}
    </Box>
  );
});

DiffFileView.displayName = 'DiffFileView';

// ===================== CodeChangePreview 主组件 =====================

const CodeChangePreview: React.FC<CodeChangePreviewProps> = ({
  files,
  diffs,
  stats,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 状态管理
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [changeFilter, setChangeFilter] = useState<'all' | 'add' | 'del' | 'modify'>('all');

  // 过滤文件列表
  const filteredFiles = useMemo(() => {
    let filtered = files;

    // 搜索过滤
    if (searchTerm) {
      filtered = filtered.filter(file =>
        file.file.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // 变更类型过滤
    if (changeFilter !== 'all') {
      filtered = filtered.filter(file => {
        switch (changeFilter) {
          case 'add':
            return file.insertions > 0 && file.deletions === 0;
          case 'del':
            return file.deletions > 0 && file.insertions === 0;
          case 'modify':
            return file.insertions > 0 && file.deletions > 0;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [files, searchTerm, changeFilter]);

  // 获取选中的文件差异
  const selectedDiff = useMemo(() => {
    if (!selectedFile) return diffs;
    return diffs.filter(diff => diff.file === selectedFile);
  }, [diffs, selectedFile]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
      {/* 统计信息 */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Chip
          label={`${stats.files} 个文件`}
          size="small"
          sx={{ backgroundColor: gs.bgHover, color: gs.textPrimary }}
        />
        <Chip
          label={`+${stats.insertions}`}
          size="small"
          icon={<AddIcon />}
          sx={{ backgroundColor: isDark ? '#2e7d32' : '#c8e6c9', color: isDark ? '#fff' : '#2e7d32' }}
        />
        <Chip
          label={`-${stats.deletions}`}
          size="small"
          icon={<RemoveIcon />}
          sx={{ backgroundColor: isDark ? '#c62828' : '#ffcdd2', color: isDark ? '#fff' : '#c62828' }}
        />
      </Box>

      {/* 搜索和过滤 */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          placeholder="搜索差异内容..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: gs.textMuted }} />
              </InputAdornment>
            ),
          }}
          sx={{
            flex: 1,
            '& .MuiOutlinedInput-root': {
              backgroundColor: gs.bgPanel,
            },
          }}
        />

        <ToggleButtonGroup
          value={changeFilter}
          exclusive
          onChange={(_, value) => value && setChangeFilter(value)}
          size="small"
        >
          <ToggleButton value="all" sx={{ px: 1.5 }}>
            全部
          </ToggleButton>
          <ToggleButton value="add" sx={{ px: 1.5 }}>
            <AddIcon sx={{ fontSize: 16 }} />
          </ToggleButton>
          <ToggleButton value="del" sx={{ px: 1.5 }}>
            <RemoveIcon sx={{ fontSize: 16 }} />
          </ToggleButton>
          <ToggleButton value="modify" sx={{ px: 1.5 }}>
            <EditIcon sx={{ fontSize: 16 }} />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* 主内容区 */}
      <Box sx={{ display: 'flex', flex: 1, gap: 2, minHeight: 0 }}>
        {/* 文件列表 */}
        <Paper
          sx={{
            width: '250px',
            backgroundColor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            overflow: 'auto',
            flexShrink: 0,
          }}
        >
          <Box sx={{ p: 1 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
              变更文件 ({filteredFiles.length})
            </Typography>
            {filteredFiles.map((file, index) => (
              <Box
                key={index}
                onClick={() => setSelectedFile(selectedFile === file.file ? null : file.file)}
                sx={{
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                  backgroundColor: selectedFile === file.file ? gs.bgActive : 'transparent',
                  color: selectedFile === file.file ? gs.textPrimary : gs.textSecondary,
                  '&:hover': {
                    backgroundColor: gs.bgHover,
                  },
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                {file.insertions > 0 && file.deletions === 0 && (
                  <AddIcon sx={{ fontSize: 14, color: '#2e7d32' }} />
                )}
                {file.deletions > 0 && file.insertions === 0 && (
                  <RemoveIcon sx={{ fontSize: 14, color: '#c62828' }} />
                )}
                {file.insertions > 0 && file.deletions > 0 && (
                  <EditIcon sx={{ fontSize: 14, color: '#ff9800' }} />
                )}
                {file.file}
              </Box>
            ))}
          </Box>
        </Paper>

        {/* Diff 视图 */}
        <Paper
          sx={{
            flex: 1,
            backgroundColor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            overflow: 'auto',
            minWidth: 0,
          }}
        >
          {selectedDiff.length > 0 ? (
            selectedDiff.map((diff, index) => (
              <DiffFileView
                key={index}
                fileDiff={diff}
                isDark={isDark}
                searchTerm={searchTerm}
              />
            ))
          ) : (
            <Box sx={{ p: 4, textAlign: 'center', color: gs.textMuted }}>
              <Typography sx={{ fontSize: '0.8rem' }}>
                {filteredFiles.length > 0 ? '请选择一个文件查看差异' : '没有符合条件的变更'}
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
};

export default memo(CodeChangePreview);