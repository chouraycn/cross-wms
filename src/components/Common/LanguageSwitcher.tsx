import React from 'react';
import { IconButton, Tooltip, Menu, MenuItem, Typography, Box } from '@mui/material';
import TranslateIcon from '@mui/icons-material/Translate';
import CheckIcon from '@mui/icons-material/Check';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, changeLanguage, getCurrentLanguage, type SupportedLanguage } from '../../i18n';

export const LanguageSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [currentLang, setCurrentLang] = React.useState<SupportedLanguage>(getCurrentLanguage());

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageChange = (lang: SupportedLanguage) => {
    changeLanguage(lang);
    setCurrentLang(lang);
    handleClose();
  };

  return (
    <>
      <Tooltip title={t('common.language') || 'Language'}>
        <IconButton
          onClick={handleClick}
          size="small"
          sx={{
            color: 'text.secondary',
            '&:hover': {
              color: 'text.primary',
            },
          }}
        >
          <TranslateIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            minWidth: 140,
          },
        }}
      >
        {SUPPORTED_LANGUAGES.map((lang: { code: SupportedLanguage; name: string; nativeName: string }) => (
          <MenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Typography variant="body2">{lang.nativeName}</Typography>
            {currentLang === lang.code && (
              <CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            )}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default LanguageSwitcher;