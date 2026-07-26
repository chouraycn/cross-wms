/** @type {import('tailwindcss').Config} */
//
// StaffDeck 主题 token 与 cross-wms 既有主题共存。
// - cross-wms 业务页（MUI）继续使用 `primary`/`tencent` 等既有颜色
// - StaffDeck 移植组件使用 `sd-*` 前缀的扩展 token（与 StaffDeck-main styles.css 对齐）
// - shadcn 组件内部使用 `--background`/`--foreground`/`--card`/`--primary`/`--accent` 等
//   通过 CSS 变量（在 src/styles/staffdeck.css 中定义）桥接到 Tailwind utility
//
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // === cross-wms 既有主题 ===
        primary: {
          DEFAULT: '#1a237e',
          light: '#534bae',
          dark: '#000051',
        },
        tencent: '#27A17C',

        // === StaffDeck 主题桥接（映射到 CSS 变量）===
        // 这些 token 与 StaffDeck-main styles.css 的 :root 变量一一对应
        // shadcn 组件内联 `bg-background` / `text-foreground` 等 utility 即可使用
        background: 'var(--background, #f7f5ef)',
        foreground: 'var(--foreground, #20201d)',
        surface: 'var(--surface, #ffffff)',
        'surface-raised': 'var(--surface-raised, #ffffff)',
        'surface-muted': 'var(--surface-muted, #eeece4)',
        'surface-subtle': 'var(--surface-subtle, #fbfaf6)',
        card: 'var(--card, #ffffff)',
        'card-foreground': 'var(--card-foreground, #20201d)',
        popover: 'var(--popover, #ffffff)',
        'popover-foreground': 'var(--popover-foreground, #20201d)',
        border: 'var(--border, #ded7cc)',
        'border-strong': 'var(--border-strong, #cfc5b7)',
        line: 'var(--line, #e7dfd3)',
        muted: 'var(--muted, #eeece4)',
        'muted-soft': 'var(--muted-soft, #9a9b95)',
        'muted-foreground': 'var(--muted-foreground, #6d726e)',
        accent: {
          DEFAULT: 'var(--accent, #0f766e)',
          soft: 'var(--accent-soft, #e1f1ed)',
          foreground: 'var(--accent-foreground, #ffffff)',
        },
        primary: {
          DEFAULT: 'var(--primary, #0f766e)',
          foreground: 'var(--primary-foreground, #ffffff)',
          // 保留 cross-wms 既有映射
          light: '#534bae',
          dark: '#000051',
        },
        secondary: {
          DEFAULT: 'var(--secondary, #eeece4)',
          foreground: 'var(--secondary-foreground, #20201d)',
        },
        destructive: {
          DEFAULT: 'var(--destructive, #dc2626)',
          foreground: '#ffffff',
        },
        success: 'var(--success, #138a55)',
        warning: 'var(--warning, #b45309)',
        danger: 'var(--danger, #dc2626)',
        input: 'var(--input, #ded7cc)',
        ring: 'var(--ring, #0f766e)',
        'ink-soft': 'var(--ink-soft, #343633)',
        copper: 'var(--copper, #a85d32)',
        olive: 'var(--olive, #6f7b42)',

        // === Sidebar 主题（shadcn sidebar.tsx 使用）===
        sidebar: {
          DEFAULT: 'var(--sidebar, #ffffff)',
          foreground: 'var(--sidebar-foreground, #858b9c)',
          primary: 'var(--sidebar-primary, #18181a)',
          'primary-foreground': 'var(--sidebar-primary-foreground, #ffffff)',
          accent: 'var(--sidebar-accent, #f6f6f6)',
          'accent-foreground': 'var(--sidebar-accent-foreground, #18181a)',
          border: 'var(--sidebar-border, #f4f4f4)',
          ring: 'var(--sidebar-ring, #18181a)',
        },

        // === Chart 调色板 ===
        chart: {
          1: 'var(--chart-1, #0f766e)',
          2: 'var(--chart-2, #6f7b42)',
          3: 'var(--chart-3, #a85d32)',
          4: 'var(--chart-4, #138a55)',
          5: 'var(--chart-5, #b45309)',
        },
      },
      fontFamily: {
        sans: 'var(--font-body, "Inter", "IBM Plex Sans", "Noto Sans SC", "PingFang SC", system-ui, sans-serif)',
        display: 'var(--font-display, "Inter", "IBM Plex Sans", system-ui, sans-serif)',
        mono: 'var(--font-mono, "JetBrains Mono", "SFMono-Regular", Consolas, monospace)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius, 0.625rem)',
        sm: 'calc(var(--radius, 0.625rem) - 4px)',
        md: 'calc(var(--radius, 0.625rem) - 2px)',
        lg: 'var(--radius, 0.625rem)',
        xl: 'calc(var(--radius, 0.625rem) + 4px)',
        '2xl': 'calc(var(--radius, 0.625rem) + 8px)',
      },
      boxShadow: {
        float: 'var(--shadow-float, 0 20px 54px rgba(37, 32, 24, 0.1))',
        soft: 'var(--shadow-soft, 0 10px 30px rgba(37, 32, 24, 0.055))',
      },
      keyframes: {
        'sd1-spin': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'trace-text-flow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'tutorial-doc-rise': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'knowledge-target-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(15, 118, 110, 0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(15, 118, 110, 0)' },
        },
      },
      animation: {
        'sd1-spin': 'sd1-spin 1.4s linear infinite',
        'trace-text-flow': 'trace-text-flow 4.2s ease-in-out infinite',
        'tutorial-doc-rise': 'tutorial-doc-rise 0.5s ease-out',
        'knowledge-target-pulse': 'knowledge-target-pulse 1.8s ease-out infinite',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
}
