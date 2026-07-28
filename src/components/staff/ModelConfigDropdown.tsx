import { CheckOutlined } from './icons.js';
import type { ModelConfigRead } from './types/index.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/index.js';
import { Button as UIButton } from './ui/button.js';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import StaffdeckIcon from './StaffdeckIcon.js';

const DEFAULT_MODEL_BUTTON_SX: SxProps<Theme> = {
  height: '32px',
  maxWidth: '220px',
  gap: '4px',
  borderRadius: '10px',
  border: '0.5px solid',
  borderColor: '#e3e7f1',
  bgcolor: '#fff',
  px: '16px',
  fontSize: '12px',
  fontWeight: 400,
  color: '#757f9c',
  '&:hover': {
    borderColor: '#cbd3e6 !important',
    bgcolor: '#fff !important',
    color: '#18181a !important',
  },
  '&[aria-expanded="true"]': {
    borderColor: '#cbd3e6 !important',
    bgcolor: '#fff !important',
    color: '#18181a !important',
  },
};

export type ModelConfigDropdownProps = {
  models: ModelConfigRead[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  buttonClassName?: string;
  align?: 'start' | 'center' | 'end';
  placeholder?: string;
};

export function ModelConfigDropdown({
  models,
  value,
  onChange,
  disabled = false,
  buttonClassName,
  align = 'end',
  placeholder = '默认模型',
}: ModelConfigDropdownProps) {
  const selected = models.find((item) => item.id === value) || null;
  const label = selected?.name || selected?.model || placeholder;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <UIButton
          variant="outline"
          disabled={disabled || models.length === 0}
          sx={DEFAULT_MODEL_BUTTON_SX}
          className={buttonClassName}
          title={label}
        >
          <Box
            component="span"
            sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {label}
          </Box>
          <StaffdeckIcon name="arrow" size={12} style={{ transform: 'rotate(90deg)', flexShrink: 0 }} />
        </UIButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {models.length === 0 ? (
          <DropdownMenuItem disabled>
            暂无可用模型
          </DropdownMenuItem>
        ) : (
          models.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onSelect={() => onChange(model.id)}
            >
              <Box component="span" sx={{ display: 'flex', minWidth: 0, flex: 1, flexDirection: 'column' }}>
                <Box
                  component="strong"
                  sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px', color: 'var(--foreground)' }}
                >
                  {model.name || model.model}
                </Box>
                <Box
                  component="em"
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '11px',
                    fontStyle: 'normal',
                    color: '#858b9c',
                  }}
                >
                  {model.is_default ? `${model.model} · 默认` : model.model}
                </Box>
              </Box>
              {value === model.id && <CheckOutlined size={16} />}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ModelConfigDropdown;
