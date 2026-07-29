import { Box, Typography } from '@mui/material';
import { staffdeckContent } from '../../assets/staffdeck-assets';

export type BrandLogoProps = {
  /** Hide the "StaffDeck" wordmark and only render the logo mark. */
  markOnly?: boolean;
  /** Size of the square logo mark in pixels. */
  markSize?: number;
  className?: string;
  /** Extra classes applied to the wordmark wrapper (e.g. to hide it responsively). */
  wordmarkClassName?: string;
};

/** Brand logo lockup (logo mark + "StaffDeck" wordmark). */
export default function BrandLogo({
  markOnly = false,
  markSize = 28,
  className,
  wordmarkClassName,
}: BrandLogoProps) {
  return (
    <Box
      className={className}
      sx={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', p: '4px' }}
    >
      <Box
        aria-label="StaffDeck"
        component="img"
        src={staffdeckContent.staffdeckLogoMark}
        alt="StaffDeck"
        sx={{
          width: markSize,
          height: markSize,
          borderRadius: '6px',
          objectFit: 'contain',
          flexShrink: 0,
          bgcolor: '#f3f4f6',
        }}
      />
      {!markOnly && (
        <Box
          className={wordmarkClassName}
          sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', lineHeight: 0 }}
        >
          <Typography component="strong" sx={{ fontSize: 17, fontWeight: 600, lineHeight: 0, color: '#18181a' }}>
            StaffDeck
          </Typography>
        </Box>
      )}
    </Box>
  );
}
