import React from 'react';
import {
  Box, Typography, IconButton, Tooltip, Button, Chip, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DescriptionIcon from '@mui/icons-material/Description';
import TableChartIcon from '@mui/icons-material/TableChart';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SheetRow, SheetCell } from '../../services/tencentDocsApi';

/** 腾讯文档品牌色 */
const TDOC_COLOR = '#27A17C';
/** 企业微信品牌色 */
const WECOM_COLOR = '#07C160';

/**
 * 文档内容查看器子组件
 *
 * 负责：加载中视图、错误视图、文档/Markdown 视图、表格/Sheet 视图的渲染。
 * 不负责文档列表或认证逻辑。
 */

type ViewMode = 'loading' | 'doc' | 'sheet' | 'error';
type DocSource = 'personal' | 'enterprise';

export interface DocContentViewerProps {
  viewMode: ViewMode;
  activeDocTitle: string;
  activeDocSource: DocSource;
  docMarkdown: string;
  sheetRows: SheetRow[];
  sheetHeaders: string[];
  errorMsg: string;
  onBackToList: () => void;
  onOpenInBrowser?: () => void;
}

/** 渲染单元格内容 */
const renderCellValue = (cell: SheetCell): string => {
  if (cell.dataType === 'LOCATION' && cell.cellValue?.location) {
    return cell.cellValue.location.name || '';
  }
  return cell.cellValue?.text ?? '';
};

const DocContentViewer: React.FC<DocContentViewerProps> = ({
  viewMode, activeDocTitle, activeDocSource, docMarkdown,
  sheetRows, sheetHeaders, errorMsg, onBackToList, onOpenInBrowser,
}) => {
  const docColor = activeDocSource === 'enterprise' ? WECOM_COLOR : TDOC_COLOR;
  const docSourceLabel = activeDocSource === 'enterprise' ? '企业文档' : '个人文档';

  // === 加载中 ===
  if (viewMode === 'loading') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10 }}>
        <CircularProgress sx={{ color: docColor, mb: 2 }} />
        <Typography sx={{ color: '#6B7280', fontSize: '0.9rem' }}>正在读取文档内容...</Typography>
      </Box>
    );
  }

  // === 错误视图 ===
  if (viewMode === 'error') {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Tooltip title="返回文档列表"><IconButton size="small" onClick={onBackToList} sx={{ color: '#6B7280' }}><ArrowBackIcon fontSize="small" /></IconButton></Tooltip>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827' }}>{activeDocTitle}</Typography>
        </Box>
        <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={onBackToList}>返回列表</Button>
          {onOpenInBrowser && (
            <Button variant="contained" startIcon={<OpenInNewIcon />} onClick={onOpenInBrowser} sx={{ backgroundColor: docColor, '&:hover': { backgroundColor: activeDocSource === 'enterprise' ? '#06a451' : '#1e7a5e' } }}>在浏览器中打开</Button>
          )}
        </Box>
      </Box>
    );
  }

  // === 文档内容视图（Markdown） ===
  if (viewMode === 'doc') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
        {/* 顶部工具栏 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, borderBottom: '1px solid #E5E7EB', backgroundColor: '#FAFAFA', flexShrink: 0 }}>
          <Tooltip title="返回文档列表"><IconButton size="small" onClick={onBackToList} sx={{ color: '#6B7280' }}><ArrowBackIcon fontSize="small" /></IconButton></Tooltip>
          <Box sx={{ width: 28, height: 28, borderRadius: 1, backgroundColor: docColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <DescriptionIcon sx={{ color: '#fff', fontSize: 16 }} />
          </Box>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{activeDocTitle}</Typography>
          <Chip label="文档" size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#E8F5E9', color: docColor }} />
          <Chip label={docSourceLabel} size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#F3F4F6', color: '#6B7280' }} />
          <CloudDoneIcon sx={{ fontSize: 16, color: docColor }} titleAccess="已从腾讯文档读取" />
        </Box>
        {/* Markdown 渲染 */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3, backgroundColor: '#FFFFFF' }}>
          <Box sx={{ maxWidth: 800, mx: 'auto', '& h1, & h2, & h3, & h4': { mt: 2, mb: 1, color: '#111827' }, '& h1': { fontSize: '1.5rem', fontWeight: 700 }, '& h2': { fontSize: '1.25rem', fontWeight: 600 }, '& h3': { fontSize: '1.1rem', fontWeight: 600 }, '& p': { mb: 1.5, lineHeight: 1.7, color: '#374151' }, '& ul, & ol': { mb: 1.5, pl: 3 }, '& li': { mb: 0.5, lineHeight: 1.6 }, '& strong': { fontWeight: 600, color: '#111827' }, '& code': { backgroundColor: '#F3F4F6', px: 0.5, py: 0.25, borderRadius: 0.5, fontSize: '0.875rem' }, '& blockquote': { borderLeft: `3px solid ${TDOC_COLOR}`, pl: 2, ml: 0, color: '#6B7280' }, '& table': { width: '100%', borderCollapse: 'collapse', mb: 2 }, '& th, & td': { border: '1px solid #E5E7EB', p: 1, fontSize: '0.875rem' }, '& th': { backgroundColor: '#F9FAFB', fontWeight: 600 } }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{docMarkdown}</ReactMarkdown>
          </Box>
        </Box>
      </Box>
    );
  }

  // === 表格内容视图 ===
  if (viewMode === 'sheet') {
    const headerRow = sheetRows.length > 0 ? sheetRows[0] : null;
    const dataRows = sheetRows.length > 1 ? sheetRows.slice(1) : [];
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
        {/* 顶部工具栏 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, borderBottom: '1px solid #E5E7EB', backgroundColor: '#FAFAFA', flexShrink: 0 }}>
          <Tooltip title="返回文档列表"><IconButton size="small" onClick={onBackToList} sx={{ color: '#6B7280' }}><ArrowBackIcon fontSize="small" /></IconButton></Tooltip>
          <Box sx={{ width: 28, height: 28, borderRadius: 1, backgroundColor: docColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TableChartIcon sx={{ color: '#fff', fontSize: 16 }} />
          </Box>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{activeDocTitle}</Typography>
          <Chip label="表格" size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#E8F5E9', color: docColor }} />
          <Chip label={docSourceLabel} size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#F3F4F6', color: '#6B7280' }} />
          <Typography variant="caption" color="text.secondary">{dataRows.length} 行</Typography>
          <CloudDoneIcon sx={{ fontSize: 16, color: docColor }} titleAccess="已从腾讯文档读取" />
        </Box>
        {/* 表格内容 */}
        <Box sx={{ flex: 1, overflow: 'auto', backgroundColor: '#FFFFFF' }}>
          <TableContainer component={Paper} elevation={0} sx={{ maxHeight: '100%' }}>
            <Table size="small" stickyHeader>
              {headerRow && (
                <TableHead>
                  <TableRow>
                    {headerRow.values.map((cell, i) => (
                      <TableCell key={i} sx={{ fontWeight: 600, backgroundColor: '#F9FAFB', whiteSpace: 'nowrap' }}>{renderCellValue(cell)}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
              )}
              <TableBody>
                {dataRows.map((row, rowIdx) => (
                  <TableRow key={rowIdx} hover>
                    {row.values.map((cell, colIdx) => (
                      <TableCell key={colIdx} sx={{ whiteSpace: 'nowrap', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{renderCellValue(cell)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>
    );
  }

  return null;
};

export default DocContentViewer;
