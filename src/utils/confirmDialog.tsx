/**
 * showConfirm / showPrompt — 通用对话框工具函数
 *
 * 替代 window.confirm / window.prompt，使用 MUI Dialog 实现。
 * 在 WKWebView / Electron 环境下 window.confirm 不弹窗，
 * 调用 showConfirm / showPrompt 可正常显示 MUI Dialog。
 *
 * 用法：
 *   const ok = await showConfirm('确定要删除吗？');
 *   if (!ok) return;
 *
 *   const name = await showPrompt('请输入名称：', '默认值');
 *   if (name === null) return; // 用户取消
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ThemeProvider, createTheme,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, TextField,
} from '@mui/material';

/** 检测当前暗色/浅色模式 */
function detectIsDark(): boolean {
  try {
    const colorScheme = document.documentElement.getAttribute('data-mui-color-scheme');
    if (colorScheme) return colorScheme === 'dark';
  } catch { /* ignore */ }
  // 回退：检测 body 背景色
  try {
    const bg = window.getComputedStyle(document.body).backgroundColor;
    // 简单判断：暗色背景的 rgb 值较小
    const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      const [, r, g, b] = match;
      return (Number(r) + Number(g) + Number(b)) / 3 < 128;
    }
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** 创建临时主题 — zIndex.modal 设为 9999 确保压在所有业务弹窗之上 */
function makeTheme(isDark: boolean) {
  return createTheme({
    palette: { mode: isDark ? 'dark' : 'light' },
    zIndex: { modal: 9999, tooltip: 10000 },
  });
}

interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  /** 确认按钮颜色 */
  color?: 'primary' | 'error' | 'warning';
}

/**
 * 显示确认对话框，返回 Promise<boolean>
 * - true: 用户点击确认
 * - false: 用户点击取消或关闭对话框
 */
export function showConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const { title = '确认操作', confirmText = '确定', cancelText = '取消', color = 'primary' } = options;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const handleConfirm = () => {
      root.unmount();
      container.remove();
      resolve(true);
    };

    const handleCancel = () => {
      root.unmount();
      container.remove();
      resolve(false);
    };

    const isDark = detectIsDark();
    const theme = makeTheme(isDark);

    root.render(
      <React.StrictMode>
        <ThemeProvider theme={theme}>
          <Dialog
            open
            onClose={handleCancel}
            maxWidth="xs"
            fullWidth
            sx={{ zIndex: 9999 }}
          >
            <DialogTitle sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
              {title}
            </DialogTitle>
            <DialogContent>
              <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', whiteSpace: 'pre-line' }}>
                {message}
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={handleCancel} sx={{ textTransform: 'none' }}>
                {cancelText}
              </Button>
              <Button
                variant="contained"
                color={color}
                onClick={handleConfirm}
                sx={{ textTransform: 'none' }}
              >
                {confirmText}
              </Button>
            </DialogActions>
          </Dialog>
        </ThemeProvider>
      </React.StrictMode>
    );
  });
}

interface PromptOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  /** 输入框 placeholder */
  placeholder?: string;
}

/**
 * 显示输入对话框，返回 Promise<string | null>
 * - string: 用户输入的值（含空字符串）
 * - null: 用户点击取消或关闭对话框
 */
export function showPrompt(message: string, defaultValue = '', options: PromptOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const { title = '请输入', confirmText = '确定', cancelText = '取消', placeholder = '' } = options;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    let inputValue = defaultValue;

    const handleConfirm = () => {
      root.unmount();
      container.remove();
      resolve(inputValue);
    };

    const handleCancel = () => {
      root.unmount();
      container.remove();
      resolve(null);
    };

    const isDark = detectIsDark();
    const theme = makeTheme(isDark);

    root.render(
      <React.StrictMode>
        <ThemeProvider theme={theme}>
          <Dialog
            open
            onClose={handleCancel}
            maxWidth="xs"
            fullWidth
            sx={{ zIndex: 9999 }}
          >
            <DialogTitle sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
              {title}
            </DialogTitle>
            <DialogContent>
              <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 1.5, whiteSpace: 'pre-line' }}>
                {message}
              </Typography>
              <TextField
                autoFocus
                fullWidth
                size="small"
                defaultValue={defaultValue}
                placeholder={placeholder}
                onChange={(e) => { inputValue = e.target.value; }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
              />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={handleCancel} sx={{ textTransform: 'none' }}>
                {cancelText}
              </Button>
              <Button
                variant="contained"
                onClick={handleConfirm}
                sx={{ textTransform: 'none' }}
              >
                {confirmText}
              </Button>
            </DialogActions>
          </Dialog>
        </ThemeProvider>
      </React.StrictMode>
    );
  });
}
