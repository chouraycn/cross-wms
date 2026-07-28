import { Box, Typography } from '@mui/material';

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
        sx={{
          display: 'grid',
          placeItems: 'center',
          borderRadius: '6px',
          width: markSize,
          height: markSize,
          background: 'linear-gradient(135deg, #527aff 0%, #105acf 100%)',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        <svg
          width={markSize * 0.6}
          height={markSize * 0.6}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 4l7 4v8l-7 4-7-4V8l7-4Z" />
          <path d="M12 12l7-4" />
          <path d="M12 12v8" />
          <path d="M12 12L5 8" />
        </svg>
      </Box>
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
