/**
 * 新增/编辑客商弹窗
 *
 * 支持供应商和客户的创建与编辑，name 必填，type 必选。
 * 409 冲突时 toast 错误提示。
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Stack,
  CircularProgress,
  Box,
} from '@mui/material';
import { createPartner, updatePartner } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import type { Partner, PartnerType } from '../../types/partners';

export interface PartnerDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  partner?: Partner;
}

const PartnerDialog: React.FC<PartnerDialogProps> = ({ open, onClose, onSuccess, partner }) => {
  const isEdit = Boolean(partner);
  const { showToast } = useToast();

  // 表单状态
  const [type, setType] = useState<PartnerType>('supplier');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [remark, setRemark] = useState('');

  // UI 状态
  const [submitting, setSubmitting] = useState(false);

  // 当弹窗打开/partner 变化时同步表单
  useEffect(() => {
    if (open) {
      if (partner) {
        setType(partner.type);
        setName(partner.name);
        setContact(partner.contact || '');
        setPhone(partner.phone || '');
        setAddress(partner.address || '');
        setRemark(partner.remark || '');
      } else {
        setType('supplier');
        setName('');
        setContact('');
        setPhone('');
        setAddress('');
        setRemark('');
      }
    }
  }, [open, partner]);

  /** 重置并关闭 */
  const handleClose = () => {
    setSubmitting(false);
    onClose();
  };

  /** 表单验证 */
  const validate = (): string | null => {
    if (!name.trim()) return '请输入客商名称';
    if (!type) return '请选择客商类型';
    return null;
  };

  /** 提交 */
  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      showToast(error, 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && partner) {
        await updatePartner(partner.id, {
          type,
          name: name.trim(),
          contact: contact.trim(),
          phone: phone.trim(),
          address: address.trim(),
          remark: remark.trim(),
        });
        showToast('客商更新成功', 'success');
      } else {
        await createPartner({
          type,
          name: name.trim(),
          contact: contact.trim(),
          phone: phone.trim(),
          address: address.trim(),
          remark: remark.trim(),
        });
        showToast('客商创建成功', 'success');
      }
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : '操作失败';
      if (message.includes('409') || message.includes('已存在') || message.includes('duplicate')) {
        showToast(`客商「${name.trim()}」已存在`, 'error');
      } else {
        showToast(message, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          minWidth: 480,
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        },
      }}
      BackdropProps={{
        sx: { backgroundColor: 'rgba(0,0,0,0.3)' },
      }}
    >
      <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>
        {isEdit ? '编辑客商' : '新增客商'}
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 2.5 }}>
        <Stack spacing={2.5} sx={{ mt: 0.5 }}>
          {/* 类型选择 */}
          <FormControl component="fieldset">
            <FormLabel component="legend" sx={{ fontSize: '0.8rem', fontWeight: 500, color: '#374151', mb: 0.5 }}>
              客商类型 <Box component="span" sx={{ color: '#EF4444' }}>*</Box>
            </FormLabel>
            <RadioGroup
              row
              value={type}
              onChange={(e) => setType(e.target.value as PartnerType)}
            >
              <FormControlLabel
                value="supplier"
                control={<Radio size="small" />}
                label="供应商"
                sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
              />
              <FormControlLabel
                value="customer"
                control={<Radio size="small" />}
                label="客户"
                sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
              />
            </RadioGroup>
          </FormControl>

          {/* 名称 */}
          <TextField
            label="客商名称"
            required
            size="small"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：深圳科技有限公司"
          />

          {/* 联系人 */}
          <TextField
            label="联系人"
            size="small"
            fullWidth
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="可选"
          />

          {/* 电话 */}
          <TextField
            label="联系电话"
            size="small"
            fullWidth
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="可选"
          />

          {/* 地址 */}
          <TextField
            label="地址"
            size="small"
            fullWidth
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="可选"
          />

          {/* 备注 */}
          <TextField
            label="备注"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="可选"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
        <Button onClick={handleClose} disabled={submitting}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting}
          sx={{ backgroundColor: '#111827' }}
        >
          {submitting ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} color="inherit" />
              提交中...
            </Box>
          ) : isEdit ? (
            '保存修改'
          ) : (
            '确认创建'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PartnerDialog;
