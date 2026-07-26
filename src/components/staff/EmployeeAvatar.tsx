import type { CSSProperties } from 'react';

import {
  DEFAULT_AVATAR_PRESET,
  employeeAvatarImage,
  employeeProfile,
  type EmployeeProfile,
} from './employee.js';
import type { AgentProfileRead } from './types/index.js';

type AvatarProfile = Pick<EmployeeProfile, 'avatarKind' | 'avatarImage' | 'avatarPreset' | 'avatarText' | 'avatarTone'>;

export type EmployeeAvatarProps = {
  agent?: AgentProfileRead | null;
  /** Pre-resolved profile. When omitted it is derived from `agent`. */
  profile?: AvatarProfile;
  /** Square shorthand for width/height (px). Used when width/height are not provided. */
  size?: number;
  /** Explicit width in px. Falls back to `size`. */
  width?: number;
  /** Explicit height in px. Falls back to `size`. */
  height?: number;
  /** Border radius override (px or any CSS length). */
  radius?: number | string;
  /** How the image fills the box. `cover` fills the frame without distortion. */
  fit?: CSSProperties['objectFit'];
  /** Alignment of the image within the box, e.g. `center bottom`. */
  objectPosition?: CSSProperties['objectPosition'];
  className?: string;
  style?: CSSProperties;
};

export default function EmployeeAvatar({
  agent,
  profile: profileOverride,
  size = 54,
  width,
  height,
  radius,
  fit = 'cover',
  objectPosition = 'center',
  className = '',
  style,
}: EmployeeAvatarProps) {
  const profile = profileOverride || employeeProfile(agent);
  void DEFAULT_AVATAR_PRESET;

  const className_ = [
    'employee-avatar',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const boxStyle: CSSProperties = {
    width: width ?? size,
    height: height ?? size,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: '#f1f2f5',
    ...(radius != null ? { borderRadius: radius } : null),
    ...style,
  };

  // Lock the image to the box at any width/height: `cover` fills without distortion.
  const imageStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    maxWidth: 'none',
    objectFit: fit,
    objectPosition,
    transform: 'none',
  };

  return (
    <span
      className={className_}
      style={boxStyle}
      aria-label={`${profile.avatarText || '员'}员工头像`}
    >
      <img src={employeeAvatarImage(profile)} alt="" style={imageStyle} />
    </span>
  );
}
