import type { ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from './ui/index.js';
import StaffdeckIcon from './StaffdeckIcon.js';
import { staffTokens } from './lib/staffTokens.js';
import Box from '@mui/material/Box';

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Header title. Supports rich content (e.g. the target name in a `<strong>`). */
  title: ReactNode;
  /** Optional supporting copy shown below the title. */
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  /** When true, buttons are disabled and closing via overlay/esc is blocked. */
  loading?: boolean;
  /** Destructive (red) confirm button. Defaults to true — matches the delete flow. */
  destructive?: boolean;
  /** Override the leading header icon. Pass `null` to hide it. */
  icon?: ReactNode;
};

/**
 * Confirmation popup: a warning icon + title header, a muted description, and
 * a right-aligned cancel / confirm footer. Built on the Radix `AlertDialog`
 * primitives so focus trapping and a11y are handled.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '删除',
  cancelText = '取消',
  onConfirm,
  loading = false,
  destructive = true,
  icon,
}: ConfirmDialogProps) {
  const leadingIcon =
    icon === undefined ? (
      <Box
        component={StaffdeckIcon}
        name="warning"
        size={16}
        sx={{ mt: '1px', width: '16px', height: '16px', flexShrink: 0, color: '#ff7f00' }}
      />
    ) : (
      icon
    );

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (loading && !next) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        sx={{
          position: 'relative',
          maxWidth: 360,
          mx: 'auto',
          width: '100%',
          borderRadius: '16px',
          gap: 0,
          overflow: 'hidden',
          p: 0,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            px: '16px',
            pt: '16px',
            pb: '12px',
          }}
        >
          {leadingIcon}
          <AlertDialogTitle
            sx={{
              minWidth: 0,
              flex: 1,
              fontSize: '14px',
              lineHeight: 'normal',
              fontWeight: 500,
              color: '#18181a',
              wordBreak: 'break-word',
            }}
          >
            {title}
          </AlertDialogTitle>
        </Box>
        {description != null && (
          <Box sx={{ px: '24px', pb: '12px' }}>
            <AlertDialogDescription
              sx={{
                fontSize: '14px',
                lineHeight: '20px',
                color: '#4f5669',
                wordBreak: 'break-word',
              }}
            >
              {description}
            </AlertDialogDescription>
          </Box>
        )}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            pt: '12px',
            pr: '16px',
            pb: '16px',
            pl: '12px',
          }}
        >
          <AlertDialogCancel
            disabled={loading}
            sx={staffTokens.dialogCancelButton}
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            sx={
              destructive
                ? {
                    ...staffTokens.dialogPrimaryButton,
                    bgcolor: '#d20b0b',
                    '&:hover': { bgcolor: '#b80909' },
                  }
                : staffTokens.dialogPrimaryButton
            }
          >
            {confirmText}
          </AlertDialogAction>
        </Box>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDialog;
