/**
 * 文件浏览器面板组件
 * - 文件树结构展示（文件夹可展开/折叠）
 * - 文件操作（查看、编辑、删除、重命名）
 * - 搜索文件功能
 * - 新建文件/文件夹按钮
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Menu,
  MenuItem,
  Divider,
  Tooltip,
  CircularProgress,
  useTheme,
  Alert,
} from '@mui/material';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { getGrayScale } from '../../constants/theme';
import type { FileEntry, FileTreeNode } from '../../types/file';
import {
  listDirectory,
  readFile,
  writeFile,
  deleteFile,
  renameFile,
  createFile,
  createFolder,
  searchFiles,
} from '../../services/fileApi';

// ===================== Helpers =====================

/** 获取文件图标 */
function getFileIcon(entry: FileEntry, expanded?: boolean) {
  if (entry.isDirectory) {
    return expanded ? <FolderOpenOutlinedIcon /> : <FolderOutlinedIcon />;
  }
  return <DescriptionOutlinedIcon />;
}

/** 获取文件语言类型（用于编辑器） */
function getFileLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    py: 'python',
    css: 'css',
    html: 'html',
    txt: 'plaintext',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return langMap[ext] || 'plaintext';
}

// ===================== Props =====================

interface FileExplorerPanelProps {
  /** 根目录路径 */
  rootPath?: string;
  /** 高度 */
  height?: number | string;
  /** 是否显示搜索框 */
  showSearch?: boolean;
  /** 是否显示新建按钮 */
  showCreateButtons?: boolean;
  /** 文件查看回调 */
  onViewFile?: (path: string, content: string) => void;
  /** 文件编辑回调 */
  onEditFile?: (path: string, content: string) => void;
}

// ===================== Component =====================

const FileExplorerPanel: React.FC<FileExplorerPanelProps> = ({
  rootPath = '.',
  height = 600,
  showSearch = true,
  showCreateButtons = true,
  onViewFile,
  onEditFile,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 文件树数据
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [searching, setSearching] = useState(false);

  // 当前路径
  const [currentPath, setCurrentPath] = useState(rootPath);

  // 文件操作对话框
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // 当前操作的文件
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [createType, setCreateType] = useState<'file' | 'folder'>('file');

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    file: FileEntry;
  } | null>(null);

  // 加载目录内容
  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const entries = await listDirectory(path);
      // 按类型排序：文件夹在前，文件在后
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      setFileTree(sorted.map(e => ({ ...e, expanded: false, loading: false })));
      setCurrentPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载目录失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadDirectory(rootPath);
  }, [rootPath, loadDirectory]);

  // 刷新当前目录
  const handleRefresh = useCallback(() => {
    loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  // 搜索文件
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchFiles(searchQuery, currentPath);
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setSearching(false);
    }
  }, [searchQuery, currentPath]);

  // 展开/折叠文件夹
  const handleToggleExpand = useCallback(async (entry: FileTreeNode, index: number) => {
    if (!entry.isDirectory) return;

    setFileTree(prev => {
      const next = [...prev];
      const node = next[index];
      node.expanded = !node.expanded;
      return next;
    });

    // 如果展开且没有子节点，加载子目录
    if (!entry.expanded && !entry.children) {
      setFileTree(prev => {
        const next = [...prev];
        next[index].loading = true;
        return next;
      });
      try {
        const children = await listDirectory(entry.path);
        setFileTree(prev => {
          const next = [...prev];
          next[index].children = children.map(c => ({ ...c, expanded: false }));
          next[index].loading = false;
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载子目录失败');
        setFileTree(prev => {
          const next = [...prev];
          next[index].loading = false;
          return next;
        });
      }
    }
  }, []);

  // 右键菜单打开
  const handleContextMenu = useCallback((event: React.MouseEvent, file: FileEntry) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      file,
    });
  }, []);

  // 右键菜单关闭
  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 查看文件
  const handleViewFile = useCallback(async (file: FileEntry) => {
    if (file.isDirectory) return;
    setSelectedFile(file);
    try {
      const content = await readFile(file.path);
      setFileContent(content);
      setViewDialogOpen(true);
      if (onViewFile) onViewFile(file.path, content);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取文件失败');
    }
    handleContextMenuClose();
  }, [onViewFile, handleContextMenuClose]);

  // 编辑文件
  const handleEditFile = useCallback(async (file: FileEntry) => {
    if (file.isDirectory) return;
    setSelectedFile(file);
    try {
      const content = await readFile(file.path);
      setEditedContent(content);
      setEditDialogOpen(true);
      if (onEditFile) onEditFile(file.path, content);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取文件失败');
    }
    handleContextMenuClose();
  }, [onEditFile, handleContextMenuClose]);

  // 保存编辑
  const handleSaveEdit = useCallback(async () => {
    if (!selectedFile) return;
    try {
      await writeFile(selectedFile.path, editedContent);
      setEditDialogOpen(false);
      handleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存文件失败');
    }
  }, [selectedFile, editedContent, handleRefresh]);

  // 重命名
  const handleRename = useCallback(async () => {
    if (!selectedFile || !newFileName.trim()) return;
    try {
      await renameFile(selectedFile.path, newFileName);
      setRenameDialogOpen(false);
      setNewFileName('');
      handleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名失败');
    }
  }, [selectedFile, newFileName, handleRefresh]);

  // 删除
  const handleDelete = useCallback(async () => {
    if (!selectedFile) return;
    try {
      await deleteFile(selectedFile.path);
      setDeleteConfirmOpen(false);
      handleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  }, [selectedFile, handleRefresh]);

  // 创建文件/文件夹
  const handleCreate = useCallback(async () => {
    if (!newFileName.trim()) return;
    const newPath = `${currentPath}/${newFileName}`;
    try {
      if (createType === 'file') {
        await createFile(newPath);
      } else {
        await createFolder(newPath);
      }
      setCreateDialogOpen(false);
      setNewFileName('');
      handleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  }, [currentPath, newFileName, createType, handleRefresh]);

  // 渲染文件树节点
  const renderFileNode = useCallback((entry: FileTreeNode, index: number, depth: number = 0) => {
    const isExpanded = entry.expanded || false;
    const isLoading = entry.loading || false;

    return (
      <React.Fragment key={entry.path}>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => entry.isDirectory && handleToggleExpand(entry, index)}
            onContextMenu={(e) => handleContextMenu(e, entry)}
            sx={{
              pl: 1.5 + depth * 1.5,
              minHeight: 36,
              borderRadius: '4px',
              '&:hover': {
                backgroundColor: gs.bgHover,
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              {isLoading ? (
                <CircularProgress size={16} />
              ) : (
                getFileIcon(entry, isExpanded)
              )}
            </ListItemIcon>
            <ListItemText
              primary={entry.name}
              primaryTypographyProps={{
                fontSize: '0.75rem',
                color: entry.isDirectory ? gs.textPrimary : gs.textSecondary,
              }}
            />
            {entry.isDirectory && (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {isExpanded ? (
                  <ExpandLessIcon sx={{ fontSize: 16, color: gs.textMuted }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize: 16, color: gs.textMuted }} />
                )}
              </Box>
            )}
          </ListItemButton>
        </ListItem>

        {/* 子节点 */}
        {entry.isDirectory && entry.children && (
          <Collapse in={isExpanded} timeout="auto">
            <List sx={{ py: 0 }}>
              {entry.children.map((child, childIndex) =>
                renderFileNode(child as FileTreeNode, childIndex, depth + 1)
              )}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    );
  }, [gs, handleToggleExpand, handleContextMenu]);

  return (
    <Box sx={{ height, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 顶部工具栏 */}
      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        {/* 搜索框 */}
        {showSearch && (
          <TextField
            size="small"
            placeholder="搜索文件..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            sx={{
              flex: 1,
              '& .MuiOutlinedInput-root': {
                backgroundColor: gs.bgInput,
                fontSize: '0.75rem',
              },
            }}
            InputProps={{
              startAdornment: <SearchOutlinedIcon sx={{ fontSize: 16, color: gs.textMuted, mr: 0.5 }} />,
              endAdornment: searching && <CircularProgress size={16} />,
            }}
          />
        )}

        {/* 新建按钮 */}
        {showCreateButtons && (
          <>
            <Tooltip title="新建文件夹">
              <IconButton
                size="small"
                onClick={() => {
                  setCreateType('folder');
                  setCreateDialogOpen(true);
                }}
                sx={{ color: gs.textMuted }}
              >
                <CreateNewFolderOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="新建文件">
              <IconButton
                size="small"
                onClick={() => {
                  setCreateType('file');
                  setCreateDialogOpen(true);
                }}
                sx={{ color: gs.textMuted }}
              >
                <NoteAddOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}

        {/* 刷新按钮 */}
        <Tooltip title="刷新">
          <IconButton size="small" onClick={handleRefresh} sx={{ color: gs.textMuted }}>
            <RefreshOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 1.5, mb: 1 }}>
          {error}
        </Alert>
      )}

      {/* 文件树 */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 1, pb: 1 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : searchResults.length > 0 ? (
          <List sx={{ py: 0 }}>
            {searchResults.map((result, index) => (
              <ListItem key={result.path} disablePadding>
                <ListItemButton
                  onClick={() => !result.isDirectory && handleViewFile(result)}
                  sx={{
                    minHeight: 36,
                    borderRadius: '4px',
                    '&:hover': { backgroundColor: gs.bgHover },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {getFileIcon(result)}
                  </ListItemIcon>
                  <ListItemText
                    primary={result.name}
                    secondary={result.path}
                    primaryTypographyProps={{ fontSize: '0.75rem' }}
                    secondaryTypographyProps={{ fontSize: '0.625rem', color: gs.textMuted }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        ) : (
          <List sx={{ py: 0 }}>{fileTree.map((entry, index) => renderFileNode(entry, index))}</List>
        )}
      </Box>

      {/* 右键菜单 */}
      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        {contextMenu?.file.isFile && (
          <>
            <MenuItem onClick={() => handleViewFile(contextMenu.file)}>
              <ListItemIcon>
                <VisibilityOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>查看</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleEditFile(contextMenu.file)}>
              <ListItemIcon>
                <EditOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>编辑</ListItemText>
            </MenuItem>
          </>
        )}
        <MenuItem
          onClick={() => {
            setSelectedFile(contextMenu?.file || null);
            setNewFileName(contextMenu?.file.name || '');
            setRenameDialogOpen(true);
            handleContextMenuClose();
          }}
        >
          <ListItemIcon>
            <EditOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>重命名</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setSelectedFile(contextMenu?.file || null);
            setDeleteConfirmOpen(true);
            handleContextMenuClose();
          }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: '#EF4444' }}>删除</ListItemText>
        </MenuItem>
      </Menu>

      {/* 查看文件对话框 */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          查看: {selectedFile?.name}
          <IconButton
            onClick={() => setViewDialogOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8, color: gs.textMuted }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{
              p: 2,
              backgroundColor: gs.bgInput,
              borderRadius: '6px',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              maxHeight: 500,
              overflow: 'auto',
            }}
          >
            {fileContent}
          </Box>
        </DialogContent>
      </Dialog>

      {/* 编辑文件对话框 */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          编辑: {selectedFile?.name}
          <IconButton
            onClick={() => setEditDialogOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8, color: gs.textMuted }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <TextField
            multiline
            fullWidth
            minRows={10}
            maxRows={20}
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                backgroundColor: gs.bgInput,
              },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSaveEdit}>保存</Button>
        </DialogActions>
      </Dialog>

      {/* 重命名对话框 */}
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
        <DialogTitle>重命名</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="新名称"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleRename}>确认</Button>
        </DialogActions>
      </Dialog>

      {/* 创建对话框 */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>
          新建{createType === 'file' ? '文件' : '文件夹'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={createType === 'file' ? '文件名' : '文件夹名'}
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleCreate}>创建</Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除 "{selectedFile?.name}" 吗？
            {selectedFile?.isDirectory && ' 该文件夹下的所有内容都将被删除。'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>取消</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>删除</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FileExplorerPanel;