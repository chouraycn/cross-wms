import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button, Paper, Stack } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

/**
 * React 错误边界组件
 * 捕获子组件树中的渲染错误，防止整个应用白屏
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] 捕获到渲染错误:', error, errorInfo);
    // 保存到全局方便调试
    (window as unknown as Record<string, unknown>).__lastError = { error: error.toString(), stack: errorInfo.componentStack };
    this.setState({ errorInfo: errorInfo.componentStack || '' });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: '' });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) return fallback;

      return (
        <Box sx={{ p: 3, maxWidth: 800, mx: 'auto', mt: 4 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid #f44336', borderRadius: 2, bgcolor: '#fff5f5' }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <ErrorOutlineIcon sx={{ color: '#f44336', fontSize: 28 }} />
                <Typography variant="h6" sx={{ color: '#d32f2f', fontWeight: 600 }}>
              页面渲染异常
              </Typography>
            </Stack>

            <Typography variant="body2" color="text.secondary">
              该页面发生了渲染错误，错误信息如下（已截获，不会导致应用完全白屏）：
            </Typography>

              <Paper elevation={0} sx={{ p: 2, bgcolor: '#1e1e1e', borderRadius: 1, overflow: 'auto' }}>
                <Typography
                  component="pre"
                  sx={{
                    color: '#f44336',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    m: 0,
                  }}
                >
                  {error?.toString()}
                </Typography>
                {errorInfo && (
                  <Typography
                    component="pre"
                    sx={{
                      color: '#999',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      mt: 1,
                      m: 0,
                    }}
                  >
                    {errorInfo}
                  </Typography>
                )}
              </Paper>

              <Stack direction="row" spacing={1}>
                <Button variant="contained" color="primary" onClick={this.handleReset}>
                  重试
                </Button>
                <Button variant="outlined" onClick={() => window.history.back()}>
                  返回上一页
                </Button>
              </Stack>

              <Typography variant="caption" color="text.secondary">
                如果问题持续出现，请检查浏览器控制台获取更多信息。
              </Typography>
            </Stack>
          </Paper>
        </Box>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
