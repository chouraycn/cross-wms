/**
 * Widget 面板入口 — 桌面 Widget（常驻桌面透明浮窗）
 * 与主应用共享主题和状态
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import WidgetDashboard from './pages/WidgetDashboard';

/** Widget 独立主题 — 与主应用一致 */
const widgetTheme = createTheme({
  palette: {
    primary: { main: '#000000', light: '#374151', dark: '#000000' },
    secondary: { main: '#6B7280' },
    background: { default: 'transparent', paper: '#FFFFFF' },
    text: { primary: '#111827', secondary: '#6B7280' },
    divider: '#E5E7EB',
  },
  typography: {
    fontFamily: [
      '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto',
      '"Helvetica Neue"', 'Arial', 'sans-serif',
    ].join(','),
  },
});

const WidgetApp: React.FC = () => {
  return (
    <ThemeProvider theme={widgetTheme}>
      <CssBaseline />
      <WidgetDashboard />
    </ThemeProvider>
  );
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<WidgetApp />);
}
