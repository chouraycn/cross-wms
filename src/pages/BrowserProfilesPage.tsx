import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  IconButton,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getGrayScale } from '../constants/theme';
import {
  listProfiles,
  createProfile,
  deleteProfile,
  setDefaultProfile,
  type BrowserProfile,
} from '../services/browserProfilesApi';

const BrowserProfilesPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState<BrowserProfile | null>(null);

  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileUserDataDir, setNewProfileUserDataDir] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listProfiles();
      setProfiles(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) {
      setError('配置文件名称不能为空');
      return;
    }

    setSubmitting(true);
    try {
      await createProfile({
        name: newProfileName.trim(),
        userDataDir: newProfileUserDataDir.trim() || undefined,
      });
      setCreateDialogOpen(false);
      setNewProfileName('');
      setNewProfileUserDataDir('');
      await loadProfiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefault = async (profile: BrowserProfile) => {
    if (profile.isDefault) return;

    setSubmitting(true);
    try {
      await setDefaultProfile(profile.id);
      await loadProfiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingProfile) return;

    setSubmitting(true);
    try {
      await deleteProfile(deletingProfile.id);
      setDeleteDialogOpen(false);
      setDeletingProfile(null);
      await loadProfiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteDialog = (profile: BrowserProfile) => {
    setDeletingProfile(profile);
    setDeleteDialogOpen(true);
  };

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            浏览器配置文件
          </Typography>
          <Typography variant="caption" color="text.secondary">
            管理浏览器用户配置文件，支持创建、删除和设置默认配置
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <IconButton onClick={loadProfiles} disabled={loading} title="刷新">
            <RefreshIcon />
          </IconButton>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            disabled={loading}
          >
            创建配置文件
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            配置文件列表
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : profiles.length === 0 ? (
            <Typography color="text.secondary" align="center" sx={{ py: 8 }}>
              暂无浏览器配置文件，点击上方按钮创建
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="medium">
                <TableHead>
                  <TableRow>
                    <TableCell>名称</TableCell>
                    <TableCell>用户数据目录</TableCell>
                    <TableCell align="center">是否默认</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id} hover>
                      <TableCell sx={{ minWidth: 150 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography fontWeight={500}>{profile.name}</Typography>
                          {profile.isDefault && (
                            <Chip
                              icon={<StarIcon fontSize="small" />}
                              label="默认"
                              size="small"
                              color="primary"
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ minWidth: 200 }}>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            maxWidth: { xs: 150, sm: 300, md: 400 },
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'block',
                          }}
                        >
                          {profile.userDataDir || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={profile.isDefault ? '是' : '否'}
                          size="small"
                          color={profile.isDefault ? 'success' : 'default'}
                          variant={profile.isDefault ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<StarIcon />}
                            onClick={() => handleSetDefault(profile)}
                            disabled={profile.isDefault || submitting}
                          >
                            {profile.isDefault ? '已默认' : '设为默认'}
                          </Button>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => openDeleteDialog(profile)}
                            disabled={profile.isDefault || submitting}
                            title="删除"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>创建新配置文件</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <TextField
              label="配置文件名称"
              fullWidth
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              autoFocus
              margin="normal"
              required
              helperText="用于标识此浏览器配置文件"
            />
            <TextField
              label="用户数据目录（可选）"
              fullWidth
              value={newProfileUserDataDir}
              onChange={(e) => setNewProfileUserDataDir(e.target.value)}
              margin="normal"
              helperText="指定浏览器用户数据的存储路径，留空则使用默认路径"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateProfile}
            disabled={submitting || !newProfileName.trim()}
          >
            {submitting ? <CircularProgress size={20} /> : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mt: 2 }}>
            确定要删除配置文件「{deletingProfile?.name}」吗？
          </Typography>
          {deletingProfile?.userDataDir && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              用户数据目录: {deletingProfile.userDataDir}
            </Typography>
          )}
          <Alert severity="warning" sx={{ mt: 2 }}>
            删除后无法恢复，请谨慎操作。
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={submitting}
          >
            {submitting ? <CircularProgress size={20} /> : '删除'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BrowserProfilesPage;