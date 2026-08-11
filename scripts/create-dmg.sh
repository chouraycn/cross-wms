#!/usr/bin/env zsh
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Create a styled DMG containing the app bundle + /Applications symlink.
#
# Usage:
#   scripts/create-dmg.sh <app_path> [output_dmg]
#
# Env:
#   DMG_VOLUME_NAME        default: CFBundleName
#   DMG_BACKGROUND_PATH    default: apps/macos/Packaging/dmg-background.png
#   DMG_BACKGROUND_SMALL   default: apps/macos/Packaging/dmg-background-small.png (recommended)
#   DMG_WINDOW_BOUNDS      default: "400 100 900 420" (500x320)
#   DMG_ICON_SIZE          default: 128
#   DMG_APP_POS            default: "125 160"
#   DMG_APPS_POS           default: "375 160"
#   SKIP_DMG_STYLE=1       skip Finder styling
#   DMG_EXTRA_SECTORS      extra sectors to keep when shrinking RW image (default: 2048)

APP_PATH="${1:-}"
OUT_PATH="${2:-}"

if [[ -z "$APP_PATH" ]]; then
  echo "Usage: $0 <app_path> [output_dmg]" >&2
  exit 1
fi
if [[ ! -d "$APP_PATH" ]]; then
  echo "Error: App not found: $APP_PATH" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/plistbuddy.sh"

# DMG_OUTPUT_DIR: 统一输出目录，默认 release/，可通过环境变量覆盖
DMG_OUTPUT_DIR="${DMG_OUTPUT_DIR:-$ROOT_DIR/release}"
BUILD_DIR="$DMG_OUTPUT_DIR"
mkdir -p "$BUILD_DIR"

APP_NAME="$(plist_print_required "$APP_PATH/Contents/Info.plist" CFBundleName)"
APP_BUNDLE_NAME="$(basename "$APP_PATH")"
VERSION="$(plist_print_required "$APP_PATH/Contents/Info.plist" CFBundleShortVersionString)"

# 统一文件名格式，与 package-mac-dist.sh 保持一致
DMG_NAME="${APP_NAME}-${VERSION}.dmg"
DMG_VOLUME_NAME="${DMG_VOLUME_NAME:-$APP_NAME}"
DMG_BACKGROUND_SMALL="${DMG_BACKGROUND_SMALL:-$ROOT_DIR/apps/macos/Packaging/dmg-background-small.png}"
DMG_BACKGROUND_PATH="${DMG_BACKGROUND_PATH:-$ROOT_DIR/apps/macos/Packaging/dmg-background.png}"

DMG_WINDOW_BOUNDS="${DMG_WINDOW_BOUNDS:-400 100 900 420}"
DMG_ICON_SIZE="${DMG_ICON_SIZE:-128}"
DMG_APP_POS="${DMG_APP_POS:-130 165}"
DMG_APPS_POS="${DMG_APPS_POS:-380 165}"
DMG_EXTRA_SECTORS="${DMG_EXTRA_SECTORS:-2048}"
# DMG_DSSTORE_TEMPLATE: 沙箱下 hdiutil attach 失败时，直接预写此 .DS_Store 到源目录
# 打包进 DMG 后仍能获得 Finder 样式（前提：目录结构、文件名、卷名完全一致）
DMG_DSSTORE_TEMPLATE="${DMG_DSSTORE_TEMPLATE:-$ROOT_DIR/apps/macos/Packaging/dmg-template/DS_Store}"
DMG_BG_TEMPLATE="${DMG_BG_TEMPLATE:-$ROOT_DIR/apps/macos/Packaging/dmg-template/background.png}"

require_integer_list() {
  local name="$1"
  local raw="$2"
  local expected_count="$3"
  local values=()
  local value

  if [[ "$raw" == *$'\n'* || "$raw" == *$'\r'* ]]; then
    echo "Error: $name must be a single line of integer values: '$raw'" >&2
    exit 1
  fi

  # zsh 用 read -A 读入数组（bash 用 -a）
  read -r -A values <<< "$raw"
  if [[ "${#values[@]}" -ne "$expected_count" ]]; then
    echo "Error: $name must contain $expected_count integer value(s): '$raw'" >&2
    exit 1
  fi

  for value in "${values[@]}"; do
    if [[ ! "$value" =~ ^-?[0-9]+$ ]]; then
      echo "Error: $name must contain only integer values: '$raw'" >&2
      exit 1
    fi
  done
}

require_positive_integer() {
  local name="$1"
  local raw="$2"
  if [[ ! "$raw" =~ ^[1-9][0-9]*$ ]]; then
    echo "Error: $name must be a positive integer: '$raw'" >&2
    exit 1
  fi
}

require_nonnegative_integer() {
  local name="$1"
  local raw="$2"
  if [[ ! "$raw" =~ ^(0|[1-9][0-9]*)$ || "${#raw}" -gt 9 ]]; then
    echo "Error: $name must be a finite non-negative integer: '$raw'" >&2
    exit 1
  fi
}

require_integer_list DMG_WINDOW_BOUNDS "$DMG_WINDOW_BOUNDS" 4
require_integer_list DMG_APP_POS "$DMG_APP_POS" 2
require_integer_list DMG_APPS_POS "$DMG_APPS_POS" 2
require_positive_integer DMG_ICON_SIZE "$DMG_ICON_SIZE"
require_nonnegative_integer DMG_EXTRA_SECTORS "$DMG_EXTRA_SECTORS"

to_applescript_list4() {
  local raw="$1"
  echo "$raw" | awk '{ printf "%s, %s, %s, %s", $1, $2, $3, $4 }'
}

to_applescript_pair() {
  local raw="$1"
  echo "$raw" | awk '{ printf "%s, %s", $1, $2 }'
}

if [[ -z "$OUT_PATH" ]]; then
  OUT_PATH="$BUILD_DIR/$DMG_NAME"
fi
OUT_DIR="$(dirname "$OUT_PATH")"
mkdir -p "$OUT_DIR"

echo "Creating DMG: $OUT_PATH"

# v1.7.203: 创建前卸载同名卷，避免旧 DMG 仍挂载导致 hdiutil create 报"目录非空"
if [[ -d "/Volumes/$DMG_VOLUME_NAME" ]]; then
  echo "INFO: 检测到同名卷已挂载 (/Volumes/$DMG_VOLUME_NAME)，先卸载..."
  hdiutil detach "/Volumes/$DMG_VOLUME_NAME" -force 2>/dev/null || true
fi

# 清理可能残留的输出文件（-ov 有时无法覆盖半写文件）
rm -f "$OUT_PATH" 2>/dev/null || true

DMG_TEMP="$(mktemp -d "${TMPDIR:-/tmp}/openclaw-dmg.XXXXXX")"
DMG_SOURCE="$DMG_TEMP/source"
MOUNT_POINT=""
DMG_RW_PATH="$DMG_TEMP/image-rw.dmg"
DMG_OUTPUT_TEMP=""
DMG_FINAL_PATH=""
MOUNTED=0

cleanup_dmg() {
  if [[ "$MOUNTED" == "1" && -n "$MOUNT_POINT" ]]; then
    if hdiutil detach "$MOUNT_POINT" -force 2>/dev/null; then
      MOUNTED=0
      # v1.7.15: 如果挂载点是我们在 /tmp 下创建的，卸载后清理目录
      if [[ -n "${DMG_MOUNT_POINT:-}" && "$MOUNT_POINT" == "$DMG_MOUNT_POINT" ]]; then
        rmdir "$MOUNT_POINT" 2>/dev/null || true
      fi
    else
      echo "WARN: Preserving DMG temp root because mount is still attached: $DMG_TEMP" >&2
      return
    fi
  fi
  if [[ -n "$DMG_OUTPUT_TEMP" ]]; then
    rm -rf "$DMG_OUTPUT_TEMP" 2>/dev/null || true
  fi
  rm -rf "$DMG_TEMP" 2>/dev/null || true
}
trap cleanup_dmg EXIT

# Finder 异步写 .DS_Store（含背景图引用），close container window 返回后未必落盘。
# 若在 .DS_Store 刷盘前 force detach，会丢弃背景图设置，导致 DMG 打开后无背景。
# 这里在 detach 前显式 sync 并轮询 .DS_Store 的 mtime 稳定，避免竞态。
wait_for_dsstore_flush() {
  local path="$MOUNT_POINT/.DS_Store"
  local prev_mtime=""
  local mtime
  local i
  /usr/sbin/sync 2>/dev/null || true
  for i in {1..12}; do
    if [[ -f "$path" ]]; then
      mtime="$(stat -f '%m' "$path" 2>/dev/null || echo '')"
      if [[ -n "$mtime" && "$mtime" == "$prev_mtime" ]]; then
        return 0
      fi
      prev_mtime="$mtime"
    fi
    /bin/sleep 0.5
  done
  # 超时不报错：仍交给 detach_dmg 处理，但此时大概率已落盘
  return 0
}

detach_dmg() {
  local attempt
  for attempt in {1..15}; do
    if hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null; then
      MOUNTED=0
      # v1.7.15: 清理自定义挂载点目录
      if [[ -n "${DMG_MOUNT_POINT:-}" && "$MOUNT_POINT" == "$DMG_MOUNT_POINT" ]]; then
        rmdir "$MOUNT_POINT" 2>/dev/null || true
      fi
      return
    fi
    # 给 Finder 充分的干净释放窗口后再 force；过早 force 会丢弃未刷盘的 .DS_Store。
    if (( attempt >= 8 )) && hdiutil detach "$MOUNT_POINT" -force 2>/dev/null; then
      MOUNTED=0
      # v1.7.15: 清理自定义挂载点目录
      if [[ -n "${DMG_MOUNT_POINT:-}" && "$MOUNT_POINT" == "$DMG_MOUNT_POINT" ]]; then
        rmdir "$MOUNT_POINT" 2>/dev/null || true
      fi
      return
    fi
    # Finder can retain the just-closed volume briefly on macOS runners.
    /bin/sleep 2
  done
  return 1
}

mkdir -p "$DMG_SOURCE"
cp -R "$APP_PATH" "$DMG_SOURCE/"
ln -s /Applications "$DMG_SOURCE/Applications"

# v1.7.198: TRAE 沙箱主动探测。
# 背景：UDRW 格式创建或任何 hdiutil attach 在 TRAE 沙箱内均会触发
# /dev/rdisk* 访问限制而失败（且失败前会留下半开的 rdisk 节点残留），
# 紧接着的模板回退路径（-format ULMO -srcfolder）内部 staging 会撞上残留
# 节点而报"目录非空"。解决方案：在脚本入口主动探测是否处于 TRAE 沙箱，
# 命中则强制 SKIP_DMG_STYLE=1，完全不进入 UDRW 分支，避免产生 rdisk 残留。
is_trae_sandbox() {
  # 1) TRAE 显式 env：只要任意一个非空即命中
  if [[ -n "${TRAE_WORKSPACE:-}" ]]; then return 0; fi
  if [[ -n "${TRAE_SESSION:-}" ]]; then return 0; fi
  if [[ -n "${TRAE_IDE_VERSION:-}" ]]; then return 0; fi
  if [[ -n "${TRAE_VERSION:-}" ]]; then return 0; fi
  if [[ -n "${TRAE_PROJECT:-}" ]]; then return 0; fi
  # 2) 通用 IDE 运行时标识：__CFBundleIdentifier 含 trae / workbuddy / cross-wms
  local cfb="${__CFBundleIdentifier:-}"
  if [[ -n "$cfb" ]]; then
    case "$cfb" in
      *trae*|*workbuddy*|*cross-wms*|*WorkBuddy*) return 0 ;;
    esac
  fi
  # 3) 父进程名匹配
  local pcomm
  pcomm="$(ps -o comm= -p $PPID 2>/dev/null || true)"
  if [[ -n "$pcomm" ]]; then
    case "$pcomm" in
      *trae*|*WorkBuddy*) return 0 ;;
    esac
  fi
  return 1
}

if [[ "${SKIP_DMG_STYLE:-0}" != "1" ]] && is_trae_sandbox; then
  echo "INFO: 检测到 TRAE 沙箱环境（/dev/rdisk* 不可访问），自动启用 SKIP_DMG_STYLE=1 快速模式，"
  echo "      不尝试 UDRW 与 hdiutil attach，避免产生 rdisk 残留导致后续 hdiutil 报错。"
  export SKIP_DMG_STYLE=1
fi

# v1.7.206: 将 .DS_Store + .background 模板注入提取为函数。
# 沙箱快速模式和 fallback v2 路径共用，确保任何模式创建的 DMG 都有 Finder 样式。
inject_dsstore_template() {
  local target_dir="$1"
  local has_style=0

  if [[ ! -f "$DMG_DSSTORE_TEMPLATE" ]]; then
    echo "WARN: .DS_Store 模板不存在: $DMG_DSSTORE_TEMPLATE" >&2
    return 1
  fi

  # 注入 .DS_Store（Finder 窗口布局、图标位置、图标大小、背景图引用）
  cp "$DMG_DSSTORE_TEMPLATE" "$target_dir/.DS_Store"

  # 注入背景图到 .background/background.png
  mkdir -p "$target_dir/.background"
  if [[ -f "$DMG_BG_TEMPLATE" ]]; then
    cp "$DMG_BG_TEMPLATE" "$target_dir/.background/background.png"
    has_style=1
  elif [[ -f "$DMG_BACKGROUND_SMALL" ]]; then
    cp "$DMG_BACKGROUND_SMALL" "$target_dir/.background/background.png"
    has_style=1
  elif [[ -f "$DMG_BACKGROUND_PATH" ]]; then
    cp "$DMG_BACKGROUND_PATH" "$target_dir/.background/background.png"
    has_style=1
  fi

  # 注入卷图标
  local icon_src="$APP_PATH/Contents/Resources/AppIcon.icns"
  if [[ ! -f "$icon_src" ]]; then
    icon_src="$APP_PATH/Contents/Resources/CDFKnowClow.icns"
  fi
  if [[ -f "$icon_src" ]]; then
    cp "$icon_src" "$target_dir/.VolumeIcon.icns"
  fi

  if [[ "$has_style" == "1" ]]; then
    echo "INFO: 已注入 .DS_Store 模板 + .background/background.png + 卷图标"
  else
    echo "WARN: .DS_Store 已注入，但未找到背景图" >&2
  fi
  return 0
}

# 检测是否有背景图：有背景图时走完整 UDRW + Finder 样式流程，
# 无背景图或沙箱环境走 srcfolder 快速模式
HAS_BACKGROUND=0
if [[ -f "$DMG_BACKGROUND_SMALL" || -f "$DMG_BACKGROUND_PATH" ]]; then
  HAS_BACKGROUND=1
fi

# 无背景图或显式跳过样式时，走 srcfolder 快速模式
# v1.7.206: 快速模式也注入 .DS_Store + .background 模板，确保沙箱下 DMG 仍有 Finder 样式
if [[ "$HAS_BACKGROUND" == "0" || "${SKIP_DMG_STYLE:-0}" == "1" ]]; then
  if [[ "${SKIP_DMG_STYLE:-0}" == "1" ]]; then
    echo "INFO: 跳过 Finder 样式（SKIP_DMG_STYLE=1），但仍注入 .DS_Store 模板"
  else
    echo "INFO: 无背景图，走 srcfolder 快速模式"
  fi

  # v1.7.206: 即使在快速模式，也尝试注入 .DS_Store + .background 模板
  inject_dsstore_template "$DMG_SOURCE" 2>/dev/null || true

  if hdiutil create \
    -volname "$DMG_VOLUME_NAME" \
    -srcfolder "$DMG_SOURCE" \
    -ov \
    -format ULMO \
    "$OUT_PATH" 2>&1; then
    hdiutil verify "$OUT_PATH" >/dev/null 2>&1 && echo "✅ DMG 创建成功（快速模式 + .DS_Store 模板）: $OUT_PATH" || echo "⚠️ DMG 创建完成但校验失败: $OUT_PATH"
    rm -rf "$DMG_SOURCE"
    exit 0
  else
    # 快速模式失败：清理可能残留的半写 OUT_PATH，避免后续 hdiutil create 报"目录非空"
    echo "WARN: srcfolder 快速模式失败，清理残留后继续尝试 UDRW 流程" >&2
    rm -f "$OUT_PATH" 2>/dev/null || true
  fi
fi

echo "INFO: 走标准 UDRW + Finder 样式流程（含背景图、窗口大小、图标布局）..."

APP_SIZE_MB=$(du -sm "$APP_PATH" | awk '{print $1}')
DMG_SIZE_MB=$((APP_SIZE_MB + 80))

# v1.7.195: UDRW 创建内部也访问 /dev/rdisk*，沙箱下同样会被阻止。
# 用 UDRW_OK 标记是否成功，任一步失败都走同一套模板回退。
UDRW_OK=0
if hdiutil create \
  -volname "$DMG_VOLUME_NAME" \
  -srcfolder "$DMG_SOURCE" \
  -ov \
  -format UDRW \
  -fs HFS+ \
  -size "${DMG_SIZE_MB}m" \
  "$DMG_RW_PATH" 2>/dev/null; then
  UDRW_OK=1
else
  echo "WARN: hdiutil create UDRW 被沙箱阻止（/dev/rdisk* 不可访问）" >&2
fi

# v1.7.15: 使用自定义挂载点在 /tmp 下，避免 /Volumes 不在 Sandbox allowlist 中的问题
# v1.7.162: 增加 hdiutil attach 失败时的沙箱回退（一步创建只读 DMG，无 Finder 样式）
# v1.7.195: UDRW 创建失败也纳入同一回退路径
DMG_MOUNT_POINT="/tmp/openclaw-dmg-mount-$$"
mkdir -p "$DMG_MOUNT_POINT"

ATTACH_OK=0
if [[ "$UDRW_OK" == "1" ]] && hdiutil attach "$DMG_RW_PATH" -mountpoint "$DMG_MOUNT_POINT" 2>/dev/null; then
  ATTACH_OK=1
fi

if [[ "$UDRW_OK" == "0" || "$ATTACH_OK" == "0" ]]; then
  echo "WARN: hdiutil UDRW/attach 被沙箱阻止（/dev/rdisk* 不可访问），尝试预写 .DS_Store + .background 模板" >&2
  # 清理 RW 镜像和挂载点
  rm -f "$DMG_RW_PATH" 2>/dev/null || true
  rmdir "$DMG_MOUNT_POINT" 2>/dev/null || true

  # v1.7.206: 使用统一的 inject_dsstore_template 函数注入样式
  FALLBACK_HAS_STYLE=0
  if inject_dsstore_template "$DMG_SOURCE" 2>/dev/null; then
    FALLBACK_HAS_STYLE=1
    echo "INFO: 使用预写 .DS_Store 模板 + .background 方案（样式完整，hdiutil attach 不可用时的首选）"
  fi

  # 一步创建压缩只读 DMG（不挂载，不访问 /dev/rdisk*）
  # v1.7.204: 创建前再次清理 OUT_PATH 残留，避免快速模式或 UDRW 失败后的半写文件导致"目录非空"
  rm -f "$OUT_PATH" 2>/dev/null || true
  hdiutil create \
    -volname "$DMG_VOLUME_NAME" \
    -srcfolder "$DMG_SOURCE" \
    -ov \
    -format ULMO \
    "$OUT_PATH"
  if hdiutil verify "$OUT_PATH" >/dev/null 2>&1; then
    if [[ "$FALLBACK_HAS_STYLE" == "1" ]]; then
      echo "✅ DMG 创建成功（沙箱回退 + Finder 样式模板）: $OUT_PATH"
    else
      echo "✅ DMG 创建成功（沙箱回退模式，无 Finder 样式）: $OUT_PATH"
    fi
  else
    echo "⚠️ DMG 创建完成但校验失败: $OUT_PATH"
  fi
  # 清理临时目录
  rm -rf "$DMG_SOURCE"
  exit 0
fi

MOUNT_POINT="$DMG_MOUNT_POINT"
MOUNTED=1

if [[ "${SKIP_DMG_STYLE:-0}" != "1" ]]; then
  mkdir -p "$MOUNT_POINT/.background"
  if [[ -f "$DMG_BACKGROUND_SMALL" ]]; then
    cp "$DMG_BACKGROUND_SMALL" "$MOUNT_POINT/.background/background.png"
  elif [[ -f "$DMG_BACKGROUND_PATH" ]]; then
    cp "$DMG_BACKGROUND_PATH" "$MOUNT_POINT/.background/background.png"
  else
    echo "WARN: DMG background missing: $DMG_BACKGROUND_SMALL / $DMG_BACKGROUND_PATH" >&2
  fi

  # Volume icon: reuse the app icon if available.
  ICON_SRC="$APP_PATH/Contents/Resources/AppIcon.icns"
  if [[ ! -f "$ICON_SRC" ]]; then
    ICON_SRC="$APP_PATH/Contents/Resources/CDFKnowClow.icns"
  fi
  if [[ -f "$ICON_SRC" ]]; then
    cp "$ICON_SRC" "$MOUNT_POINT/.VolumeIcon.icns"
    if command -v SetFile >/dev/null 2>&1; then
      SetFile -a C "$MOUNT_POINT" 2>/dev/null || true
    fi
  fi

  echo "Applying DMG visual style with Finder..."
  
  # v1.7.15: 使用磁盘名直接引用，比 disk of dmgRoot 更可靠
  DISK_NAME="$(basename "$MOUNT_POINT")"
  
  osascript <<EOF
tell application "Finder"
  tell disk "$DISK_NAME"
    open
    delay 1
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {$(to_applescript_list4 "$DMG_WINDOW_BOUNDS")}
    set viewOptions to the icon view options of container window
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to ${DMG_ICON_SIZE}
    if exists file ".background:background.png" then
      set background picture of viewOptions to file ".background:background.png"
    end if
    set text size of viewOptions to 12
    set label position of viewOptions to bottom
    set shows item info of viewOptions to false
    set shows icon preview of viewOptions to true
    set position of item "${APP_BUNDLE_NAME}" of container window to {$(to_applescript_pair "$DMG_APP_POS")}
    set position of item "Applications" of container window to {$(to_applescript_pair "$DMG_APPS_POS")}
    update without registering applications
    delay 2
    close
    open
    delay 1
    close container window
  end tell
end tell
EOF
  osascript_status=$?
  if [[ $osascript_status -ne 0 ]]; then
    echo "WARN: osascript failed (status=$osascript_status)" >&2
  fi

  # v1.7.16: 确保 .DS_Store 写入磁盘后再卸载（port 自 openclaw 上游修复）
  wait_for_dsstore_flush
fi

if ! detach_dmg; then
  echo "Error: Failed to detach DMG mount: $MOUNT_POINT" >&2
  exit 1
fi

DMG_LIMITS_PATH="$DMG_TEMP/resize-limits.txt"
hdiutil resize -limits "$DMG_RW_PATH" >"$DMG_LIMITS_PATH" 2>/dev/null || true
MIN_SECTORS="$(tail -n 1 "$DMG_LIMITS_PATH" 2>/dev/null | awk '{print $1}')"
if [[ "$MIN_SECTORS" =~ ^[0-9]+$ ]] && [[ "$DMG_EXTRA_SECTORS" =~ ^[0-9]+$ ]]; then
  TARGET_SECTORS=$((MIN_SECTORS + DMG_EXTRA_SECTORS))
  echo "Shrinking RW image: min sectors=$MIN_SECTORS (+$DMG_EXTRA_SECTORS) -> $TARGET_SECTORS"
  hdiutil resize -sectors "$TARGET_SECTORS" "$DMG_RW_PATH" >/dev/null 2>&1 || true
fi

DMG_OUTPUT_TEMP="$(mktemp -d "$(dirname "$OUT_PATH")/.openclaw-dmg.XXXXXX")"
DMG_FINAL_PATH="$DMG_OUTPUT_TEMP/final.dmg"

hdiutil convert "$DMG_RW_PATH" -format ULMO -o "$DMG_FINAL_PATH" -ov

hdiutil verify "$DMG_FINAL_PATH" >/dev/null
mv -f "$DMG_FINAL_PATH" "$OUT_PATH"
echo "✅ DMG ready: $OUT_PATH"
