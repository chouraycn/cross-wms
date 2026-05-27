import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  LinearProgress,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { mockWarehouses, mockInboundRecords, mockOutboundRecords, mockInventory, getWarehouseUtilization } from '../../data/mockData';
import type { Warehouse } from '../../types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div role="tabpanel" hidden={value !== index}>
    {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
  </div>
);

interface WarehouseDetailProps {
  warehouseId: string;
}

function getProgressColor(rate: number): 'success' | 'warning' | 'error' {
  if (rate < 70) return 'success';
  if (rate <= 90) return 'warning';
  return 'error';
}

const WarehouseDetail: React.FC<WarehouseDetailProps> = ({ warehouseId }) => {
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);

  const warehouse = mockWarehouses.find((w) => w.id === warehouseId);

  if (!warehouse) {
    return (
      <Alert severity="error">
        仓库不存在。<Button onClick={() => navigate('/warehouses')}>返回列表</Button>
      </Alert>
    );
  }

  const rate = getWarehouseUtilization(warehouse);
  const color = getProgressColor(rate);

  const inboundRecords = mockInboundRecords.filter((r) => r.warehouseId === warehouseId);
  const outboundRecords = mockOutboundRecords.filter((r) => r.warehouseId === warehouseId);
  const inventory = mockInventory.filter((i) => i.warehouseId === warehouseId);

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/warehouses')}
        sx={{ mb: 2, color: '#111827' }}
      >
        返回仓库列表
      </Button>

      {/* Header Card */}
      <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>
                {warehouse.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                📍 {warehouse.country} · {warehouse.city} — {warehouse.address}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                👤 负责人：{warehouse.manager} &nbsp;|&nbsp; 📞 {warehouse.phone}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                📅 创建于：{warehouse.createdAt}
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>{(warehouse.totalItems || warehouse.totalVolume).toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary">件数上限</Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: color === 'error' ? '#f44336' : color === 'warning' ? '#ff9800' : '#4caf50' }}>
                      {(warehouse.usedItems || warehouse.usedVolume).toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">已用件数</Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: color === 'error' ? '#f44336' : color === 'warning' ? '#ff9800' : '#4caf50' }}>
                      {rate}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">容积利用率</Typography>
                  </Box>
                </Grid>
              </Grid>
              <Box sx={{ mt: 2 }}>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(rate, 100)}
                  color={color}
                  sx={{ height: 12, borderRadius: 6, backgroundColor: '#f0f0f0' }}
                />
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Card elevation={0} sx={{ border: '1px solid #e8e8e8', borderRadius: 2 }}>
        <Box sx={{ borderBottom: '1px solid #e0e0e0', px: 2 }}>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} textColor="primary" indicatorColor="primary">
            <Tab label={`入库记录 (${inboundRecords.length})`} />
            <Tab label={`出库记录 (${outboundRecords.length})`} />
            <Tab label={`库存列表 (${inventory.length})`} />
          </Tabs>
        </Box>
        <CardContent>
          <TabPanel value={tabValue} index={0}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#fafafa' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU编号</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>品名</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>数量</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>体积(m³)</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>入库时间</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>操作人</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>状态</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {inboundRecords.map((rec) => (
                    <TableRow key={rec.id} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell><Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{rec.sku}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{rec.name}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{rec.quantity}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{rec.volume}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{rec.createdAt}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{rec.operator}</Typography></TableCell>
                      <TableCell>
                        <Chip label={rec.status === 'completed' ? '已完成' : '待处理'} size="small" color={rec.status === 'completed' ? 'success' : 'warning'} variant="outlined" />
                      </TableCell>
                    </TableRow>
                  ))}
                  {inboundRecords.length === 0 && (
                    <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', color: '#9e9e9e', py: 3 }}>暂无入库记录</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#fafafa' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU编号</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>品名</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>数量</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>体积(m³)</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>出库时间</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>目的地</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>操作人</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {outboundRecords.map((rec) => (
                    <TableRow key={rec.id} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell><Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{rec.sku}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{rec.name}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{rec.quantity}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{rec.volume}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{rec.createdAt}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{rec.destination}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{rec.operator}</Typography></TableCell>
                    </TableRow>
                  ))}
                  {outboundRecords.length === 0 && (
                    <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', color: '#9e9e9e', py: 3 }}>暂无出库记录</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#fafafa' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU编号</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>品名</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>品类</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>数量</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>占用容积(m³)</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>货值(USD)</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>入库时间</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {inventory.slice(0, 20).map((item) => (
                    <TableRow
                      key={item.id}
                      sx={{
                        '&:last-child td': { borderBottom: 0 },
                        backgroundColor: item.isAgeWarning ? '#fff8e1' : 'transparent',
                      }}
                    >
                      <TableCell><Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{item.sku}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{item.name}{item.isAgeWarning && <Chip label="库龄警告" size="small" color="warning" sx={{ ml: 1, fontSize: '0.65rem', height: 18 }} />}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{item.category}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{item.quantity}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{item.totalVolume.toFixed(2)}</Typography></TableCell>
                      <TableCell><Typography variant="body2">${item.totalValue.toFixed(0)}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{item.inboundDate}</Typography></TableCell>
                    </TableRow>
                  ))}
                  {inventory.length === 0 && (
                    <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', color: '#9e9e9e', py: 3 }}>暂无库存记录</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            {inventory.length > 20 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                仅显示前20条，共 {inventory.length} 条记录
              </Typography>
            )}
          </TabPanel>
        </CardContent>
      </Card>
    </Box>
  );
};

export default WarehouseDetail;
