import type { ReactNode } from 'react';
import { toast, type ExternalToast } from 'sonner';
import { AlertCircleIcon, CheckCircleIcon } from 'lucide-react';

import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

// NOTE: SVG imports replaced with lucide-react icons
// (original used @/assets/icons/error-fill.svg?react and success-fill.svg?react)

type ToastVariant = 'success' | 'error';

// Colors, radius and spacing mirror SD1 "Basic components/Dialog/Message"
// (success node 281:3334, error node 281:3342).
const VARIANTS: Record<
  ToastVariant,
  { container: SxProps<Theme>; iconColor: string; Icon: typeof CheckCircleIcon }
> = {
  success: {
    container: { borderColor: '#96d9b0', bgcolor: '#e9f7ef', color: '#018434' },
    iconColor: '#2cb360',
    Icon: CheckCircleIcon,
  },
  error: {
    container: { borderColor: '#f38989', bgcolor: '#fce7e7', color: '#d20b0b' },
    iconColor: '#d20b0b',
    Icon: AlertCircleIcon,
  },
};

function ToastPill({ variant, message }: { variant: ToastVariant; message: ReactNode }) {
  const { container, iconColor, Icon } = VARIANTS[variant];
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        pointerEvents: 'auto',
        display: 'flex',
        maxWidth: '100%',
        alignItems: 'center',
        gap: '12px',
        borderRadius: '14px',
        border: '1px solid',
        ...container,
        px: '24px',
        py: '10px',
        boxShadow: '0px 12px 32px rgba(0,0,0,0.12)',
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          color: iconColor,
          '& svg': { width: '16px', height: '16px', flexShrink: 0 },
        }}
      >
        <Icon />
      </Box>
      <Box
        component="span"
        sx={{ fontSize: '14px', lineHeight: 'normal', overflowWrap: 'anywhere' }}
      >
        {message}
      </Box>
    </Box>
  );
}

/**
 * Options accepted by the branded toasts. Presentation (icon, styling and
 * centered placement) is owned by the component, so those keys are excluded.
 */
export type AppToastOptions = Omit<
  ExternalToast,
  'icon' | 'className' | 'style' | 'unstyled' | 'descriptionClassName'
>;

function showVariant(variant: ToastVariant, message: ReactNode, options?: AppToastOptions) {
  return toast.custom(() => <ToastPill variant={variant} message={message} />, {
    duration: variant === 'success' ? 3200 : 4800,
    unstyled: true,
    className: 'flex w-full justify-center',
    ...options,
  });
}

/**
 * Global toast helper. `success` / `error` render the SD1 message pill;
 * `warning` / `info` / `loading` delegate to sonner so they share the same
 * centered placement configured on the app-wide <Toaster />.
 */
export const notify = {
  success: (message: ReactNode, options?: AppToastOptions) =>
    showVariant('success', message, options),
  error: (message: ReactNode, options?: AppToastOptions) => showVariant('error', message, options),
  warning: (message: ReactNode, options?: AppToastOptions) => toast.warning(message, options),
  info: (message: ReactNode, options?: AppToastOptions) => toast.info(message, options),
  loading: (message: ReactNode, options?: AppToastOptions) => toast.loading(message, options),
  dismiss: (id?: string | number) => toast.dismiss(id),
};
