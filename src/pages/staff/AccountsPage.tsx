import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2, User, X } from 'lucide-react';

import AppHeader from '../../components/staff/AppHeader.js';
import { ConfirmDialog } from '../../components/staff/ConfirmDialog.js';
import { DataTable, type DataTableColumn } from '../../components/staff/DataTable.js';
import { Paginator } from '../../components/staff/Paginator.js';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/staff/ui/index.js';
import { Button as UIButton } from '../../components/staff/ui/button.js';
import { notify } from '../../components/staff/ui/app-toast.js';
import { MENU_CONTENT_CLASS, MENU_ITEM_CLASS, MENU_ITEM_DANGER_CLASS, MOBILE_CARD_CLASS, formatDateTime } from '../../components/staff/lib/enterprise-ui.js';
import { staffTokens } from '../../components/staff/lib/staffTokens.js';
import { Box } from '@mui/material';
import type { SxProps } from '@mui/material/styles';

import { api, TENANT_ID } from '../../components/staff/api/client.js';
import type { EnterpriseAuthUser } from '../../components/staff/auth.js';

type EmployeeAccount = {
  id: string;
  tenant_id: string;
  username: string;
  display_name?: string;
  role: 'admin' | 'member';
  created_at?: string;
  updated_at?: string;
};

type AccountDraft = {
  displayName: string;
  password: string;
  role: 'admin' | 'member';
};

type AccountCreateDraft = {
  username: string;
  displayName: string;
  password: string;
  role: 'admin' | 'member';
};

const ACCOUNT_PAGE_SIZE = 10;

export default function AccountsPage({
  currentUser,
  onLogout,
}: {
  currentUser?: EnterpriseAuthUser;
  onLogout?: () => void;
} = {}) {
  const [rows, setRows] = useState<EmployeeAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [editing, setEditing] = useState<EmployeeAccount | null>(null);
  const [draft, setDraft] = useState<AccountDraft>({ displayName: '', password: '', role: 'member' });
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<AccountCreateDraft>({
    username: '',
    displayName: '',
    password: '',
    role: 'member',
  });
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    try {
      const result = await api.get<EmployeeAccount[]>(`/auth/users?tenant_id=${TENANT_ID}`);
      setRows(result);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '加载账号失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      [row.username, row.display_name || '', row.role === 'admin' ? '管理员' : '普通成员']
        .some((value) => value.toLowerCase().includes(keyword)),
    );
  }, [rows, searchText]);

  useEffect(() => {
    setPage(1);
  }, [searchText]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / ACCOUNT_PAGE_SIZE));
  const pagedItems = useMemo(
    () => filteredRows.slice((page - 1) * ACCOUNT_PAGE_SIZE, page * ACCOUNT_PAGE_SIZE),
    [filteredRows, page],
  );

  function openEdit(row: EmployeeAccount) {
    setEditing(row);
    setDraft({ displayName: row.display_name || row.username, password: '', role: row.role });
  }

  function openCreate() {
    setCreateDraft({ username: '', displayName: '', password: '', role: 'member' });
    setCreateOpen(true);
  }

  async function saveCreate() {
    const username = createDraft.username.trim();
    const password = createDraft.password.trim();
    if (!username || !password) {
      notify.error('请填写账号和密码');
      return;
    }
    setCreating(true);
    try {
      await api.post('/auth/users', {
        tenant_id: TENANT_ID,
        username,
        password,
        display_name: createDraft.displayName.trim() || username,
        role: createDraft.role,
      });
      notify.success('账号已创建');
      setCreateOpen(false);
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '创建账号失败');
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/auth/users/${editing.id}`, {
        tenant_id: TENANT_ID,
        display_name: draft.displayName.trim() || editing.username,
        password: draft.password.trim() || undefined,
        role: draft.role,
      });
      notify.success('账号已更新');
      setEditing(null);
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '保存账号失败');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const row = deleteTarget;
    if (!row) return;
    setDeleting(true);
    try {
      await api.delete(`/auth/users/${row.id}?tenant_id=${TENANT_ID}`);
      notify.success('账号已删除');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '删除账号失败');
    } finally {
      setDeleting(false);
    }
  }

  function renderActions(row: EmployeeAccount) {
    const isProtected = row.role === 'admin';
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Box
            component="button"
            type="button"
            aria-label="账号操作"
            sx={{
              ml: 'auto',
              display: 'grid',
              width: '28px',
              height: '28px',
              placeItems: 'center',
              borderRadius: '8px',
              color: '#1a71ff',
              transition: 'background-color 0.15s',
              outline: 'none',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.05)', color: '#4a8dff' },
              '&:focus-visible': { bgcolor: 'rgba(0,0,0,0.05)' },
            }}
          >
            <MoreHorizontal size={14} />
          </Box>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={MENU_CONTENT_CLASS}>
          <DropdownMenuItem className={MENU_ITEM_CLASS} onSelect={() => openEdit(row)}>
            <Pencil />
            编辑
          </DropdownMenuItem>
          <DropdownMenuSeparator sx={{ my: '2px', borderColor: '#eef0f4' }} />
          <DropdownMenuItem
            variant="destructive"
            className={MENU_ITEM_DANGER_CLASS}
            disabled={isProtected}
            onSelect={() => setDeleteTarget(row)}
          >
            <Trash2 />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const columns: DataTableColumn<EmployeeAccount>[] = [
    {
      key: 'username',
      title: '用户名',
      width: 220,
      className: 'text-[#18181a]',
      render: (row) => (
        <Box component="span" sx={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '8px' }}>
          <Box component="span" sx={{ display: 'grid', width: '24px', height: '24px', flexShrink: 0, placeItems: 'center', borderRadius: '9999px', bgcolor: '#eef1fb', color: '#7e96dc' }}>
            <User size={14} />
          </Box>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: 'text.primary' }}>{row.username}</Box>
        </Box>
      ),
    },
    {
      key: 'display_name',
      title: '显示名',
      width: 200,
      render: (row) => <Box component="span" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.display_name || row.username}</Box>,
    },
    {
      key: 'role',
      title: '角色',
      width: 120,
      render: (row) => <Box component="span">{row.role === 'admin' ? '管理员' : '普通成员'}</Box>,
    },
    { key: 'created', title: '创建时间', width: 180, render: (row) => formatDateTime(row.created_at) },
    { key: 'updated', title: '最近更新', width: 180, render: (row) => formatDateTime(row.updated_at) },
    {
      key: 'actions',
      title: '操作',
      width: 70,
      align: 'right',
      render: (row) => renderActions(row),
    },
  ];

  const renderMobileCard = (row: EmployeeAccount) => (
    <Box component="article" className={MOBILE_CARD_CLASS} key={row.id}>
      <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <Box component="span" sx={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '8px' }}>
          <Box component="span" sx={{ display: 'grid', width: '28px', height: '28px', flexShrink: 0, placeItems: 'center', borderRadius: '9999px', bgcolor: '#eef1fb', color: '#7e96dc' }}>
            <User size={15} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Box component="strong" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px', fontWeight: 600, color: 'text.primary' }}>{row.username}</Box>
            <Box component="span" sx={{ mt: '2px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', color: 'text.secondary' }}>{row.display_name || row.username}</Box>
          </Box>
        </Box>
        {renderActions(row)}
      </Box>
      <Box sx={{ mt: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '12px', color: 'text.secondary' }}>
        <Box component="span">创建 {formatDateTime(row.created_at)}</Box>
        <Box component="span">更新 {formatDateTime(row.updated_at)}</Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100%', boxSizing: 'border-box', px: '48px', pt: '32px', pb: '43px', '@media (max-width:900px)': { px: '16px' } }} aria-busy={loading}>
      <AppHeader onLogout={onLogout} userName={currentUser?.username} title="账号管理" />

      <Box sx={{ mt: '20px', mb: '16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
        <UIButton
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
          sx={staffTokens.outlineActionButton}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
          刷新
        </UIButton>
        <UIButton
          onClick={openCreate}
          sx={staffTokens.primaryButton}
        >
          <Plus size={14} />
          新建账号
        </UIButton>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px', borderRadius: '20px 20px 0 0', bgcolor: 'background.paper', padding: '18px 18px 24px 18px', boxShadow: '0 -4px 16px 0 rgba(0,0,0,0.05)' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '12px', color: 'text.secondary' }}>
            <User size={14} style={{ flexShrink: 0, color: '#858b9c' }} />
            <Box component="span" sx={{ fontSize: '14px', fontWeight: 400, lineHeight: 1 }}>账号列表</Box>
          </Box>

          <Box
            component="label"
            sx={{
              display: 'flex',
              height: '34px',
              width: '300px',
              alignItems: 'center',
              gap: '8px',
              overflow: 'hidden',
              borderRadius: '10px',
              border: '0.5px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              px: '12px',
              transition: 'border-color 0.15s',
              '&:focus-within': { borderColor: 'text.primary' },
              '@media (max-width:900px)': { width: '100%' },
            }}
          >
            <Search size={14} style={{ flexShrink: 0, color: '#858b9c' }} />
            <Box
              component="input"
              value={searchText}
              placeholder="搜索用户名或显示名"
              onChange={(event) => setSearchText(event.target.value)}
              sx={{
                height: '100%',
                minWidth: 0,
                flex: 1,
                bgcolor: 'transparent',
                px: '14px',
                fontSize: '12px',
                color: '#17191f',
                outline: 'none',
                border: 0,
                '&::placeholder': { color: '#c0c6d4' },
              }}
            />
            {searchText && (
              <Box
                component="button"
                type="button"
                aria-label="清除搜索"
                onClick={() => setSearchText('')}
                sx={{
                  display: 'grid',
                  width: '16px',
                  height: '16px',
                  flexShrink: 0,
                  placeItems: 'center',
                  color: '#c0c6d4',
                  cursor: 'pointer',
                  border: 0,
                  bgcolor: 'transparent',
                  '&:hover': { color: '#858b9c' },
                }}
              >
                <X size={14} />
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'grid', gap: '10px', '@media (min-width:768px)': { display: 'none' } }}>
            {filteredRows.length ? (
              pagedItems.map(renderMobileCard)
            ) : (
              <Box sx={{ py: '40px', textAlign: 'center', fontSize: '13px', color: 'text.secondary' }}>暂无账号</Box>
            )}
          </Box>

          <Box sx={{ display: 'none', '@media (min-width:768px)': { display: 'block' } }}>
            <DataTable
              aria-label="账号列表"
              columns={columns}
              data={pagedItems}
              rowKey={(row) => row.id}
              loading={loading}
              emptyText="暂无账号"
            />
          </Box>

          {filteredRows.length > 0 && (
            <Paginator
              aria-label="账号分页"
              page={page}
              pageCount={pageCount}
              onChange={setPage}
            />
          )}
        </Box>
      </Box>

      <AccountDialog
        open={createOpen}
        title="新建账号"
        loading={creating}
        submitText="创建"
        username={{ value: createDraft.username, onChange: (value) => setCreateDraft((prev) => ({ ...prev, username: value })) }}
        displayName={createDraft.displayName}
        onDisplayNameChange={(value) => setCreateDraft((prev) => ({ ...prev, displayName: value }))}
        password={createDraft.password}
        onPasswordChange={(value) => setCreateDraft((prev) => ({ ...prev, password: value }))}
        role={createDraft.role}
        onRoleChange={(value) => setCreateDraft((prev) => ({ ...prev, role: value }))}
        passwordLabel="初始密码"
        onClose={() => setCreateOpen(false)}
        onSubmit={() => void saveCreate()}
      />

      <AccountDialog
        open={Boolean(editing)}
        title={editing ? `编辑账号：${editing.username}` : '编辑账号'}
        loading={saving}
        submitText="保存"
        username={null}
        displayName={draft.displayName}
        onDisplayNameChange={(value) => setDraft((prev) => ({ ...prev, displayName: value }))}
        password={draft.password}
        onPasswordChange={(value) => setDraft((prev) => ({ ...prev, password: value }))}
        role={draft.role}
        onRoleChange={(value) => setDraft((prev) => ({ ...prev, role: value }))}
        roleDisabled={editing?.id === currentUser?.id}
        passwordLabel="新密码"
        passwordPlaceholder="不修改请留空"
        onClose={() => setEditing(null)}
        onSubmit={() => void saveEdit()}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        loading={deleting}
        title={deleteTarget ? `删除账号「${deleteTarget.username}」？` : ''}
        description="删除后该账号无法登录，但其创建的数字员工仍然保留。"
        onConfirm={() => void confirmDelete()}
      />
    </Box>
  );
}

function AccountDialog({
  open,
  title,
  loading,
  submitText,
  username,
  displayName,
  onDisplayNameChange,
  password,
  onPasswordChange,
  role,
  onRoleChange,
  roleDisabled = false,
  passwordLabel,
  passwordPlaceholder,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  loading: boolean;
  submitText: string;
  username: { value: string; onChange: (value: string) => void } | null;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  role: 'admin' | 'member';
  onRoleChange: (value: 'admin' | 'member') => void;
  roleDisabled?: boolean;
  passwordLabel: string;
  passwordPlaceholder?: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        sx={{
          display: 'flex',
          width: 'calc(100% - 2rem)',
          flexDirection: 'column',
          gap: '16px',
          overflow: 'hidden',
          borderRadius: '14px',
          px: '20px',
          py: '16px',
          '@media (min-width:640px)': { maxWidth: '440px' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '12px', color: 'text.secondary' }}>
          <User size={14} style={{ flexShrink: 0, color: '#858b9c' }} />
          <DialogTitle sx={{ fontSize: '14px', fontWeight: 400, lineHeight: 1, color: 'text.secondary' }}>
            {title}
          </DialogTitle>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '14px', px: '12px' }}>
          {username && (
            <LabeledField label="用户名">
              <Input
                value={username.value}
                placeholder="例如 zhang_san"
                onChange={(event) => username.onChange(event.target.value)}
              />
            </LabeledField>
          )}
          <LabeledField label="显示名">
            <Input
              value={displayName}
              placeholder="例如 张三"
              onChange={(event) => onDisplayNameChange(event.target.value)}
            />
          </LabeledField>
          <LabeledField label={passwordLabel}>
            <Input
              type="password"
              value={password}
              placeholder={passwordPlaceholder}
              onChange={(event) => onPasswordChange(event.target.value)}
            />
          </LabeledField>
          <LabeledField label="账号角色">
            <Select
              value={role}
              disabled={roleDisabled}
              onValueChange={(value) => onRoleChange(value as 'admin' | 'member')}
            >
              <SelectTrigger sx={{ width: '100%' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">普通成员</SelectItem>
                <SelectItem value="admin">管理员</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', px: '12px' }}>
          <UIButton
            variant="outline"
            disabled={loading}
            onClick={onClose}
            sx={staffTokens.dialogCancelButton}
          >
            取消
          </UIButton>
          <UIButton
            disabled={loading}
            onClick={onSubmit}
            sx={[staffTokens.primaryButton, { width: '80px' }] as SxProps}
          >
            {submitText}
          </UIButton>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Box component="span" sx={{ fontSize: '12px', fontWeight: 500, color: 'text.primary' }}>{label}</Box>
      {children}
    </Box>
  );
}
