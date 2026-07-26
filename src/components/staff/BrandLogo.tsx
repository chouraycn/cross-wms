import { cn } from './lib/utils.js';

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
    <span className={cn('flex items-center gap-[8px] overflow-hidden p-[4px]', className)}>
      <span
        aria-label="StaffDeck"
        className="grid shrink-0 place-items-center rounded-[6px] bg-gradient-to-br from-[#527aff] to-[#105acf] text-white"
        style={{ width: markSize, height: markSize }}
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
      </span>
      {!markOnly && (
        <span className={cn('flex flex-col items-center gap-[2px] leading-none', wordmarkClassName)}>
          <strong className="text-[17px] font-semibold leading-none text-[#18181a]">
            StaffDeck
          </strong>
        </span>
      )}
    </span>
  );
}
