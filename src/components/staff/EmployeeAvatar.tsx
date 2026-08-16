import { useState, type CSSProperties } from 'react';

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

  // 图片加载状态：未完成时显示占位背景，完成后淡入图片（避免灰底突然变图片闪屏）
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

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
    // 加载完成前 opacity:0（占位背景可见），完成后 opacity:1 淡入
    opacity: imgLoaded && !imgError ? 1 : 0,
    transition: 'opacity 0.15s ease',
  };

  // 文字回退：图片加载失败时显示首字
  const fallbackText = profile.avatarText || '员';

  return (
    <span
      className={className_}
      style={boxStyle}
      aria-label={`${profile.avatarText || '员'}员工头像`}
    >
      {/* 图片加载中/失败时显示的文字占位 */}
      {!imgLoaded && (
        <span
          style={{
            position: 'absolute',
            fontSize: `${(width ?? size) * 0.4}px`,
            fontWeight: 500,
            color: '#858b9c',
            userSelect: 'none',
          }}
        >
          {fallbackText}
        </span>
      )}
      {!imgError && (
        <img
          src={employeeAvatarImage(profile)}
          alt=""
          style={imageStyle}
          onLoad={() => setImgLoaded(true)}
          onError={() => { setImgError(true); setImgLoaded(true); }}
        />
      )}
    </span>
  );
}
