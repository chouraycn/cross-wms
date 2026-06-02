import React, { useState, useEffect } from 'react';
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
  CircularProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { getWarehouseById as getStoreWarehouseById } from '../../capabilities/warehouse';
import { calcUtilizationByItems } from '../../utils/volumeCalculator';
import type { Warehouse, InboundRecord, OutboundRecord, InventoryItem } from '../../types';
import { dashboardApi } from '../../services/dashboardApi';

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
  const [loading, setLoading] = useState(true);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [inboundRecords, setInboundRecords] = useState<InboundRecord[]>([]);
  const [outboundRecords, setOutboundRecords] = useState<OutboundRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  // 数据获取：优先 Store 缓存（含用户创建的仓库）→ 降级 dashboardApi
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);

      // 1. 优先从 Store 缓存获取（用户创建的仓库在 API+cache 模式下存在于此）
      let wh: Warehouse | null = getStoreWarehouseById(warehouseId) || null;

      // 2. 缓存未命中，尝试 dashboardApi（包含 mock 数据和 API 数据）
      if (!wh) {
        try {
          const allWarehouses = await dashboardApi.getWarehouses();
          wh = allWarehouses.find((w) => w.id === warehouseId) || null;
        } catch {
          // API 不可用，继续降级
        }
      }

      // 3. 最终降级：再次尝试 Store（可能有并发写入）
      if (!wh) {
        wh = getStoreWarehouseById(warehouseId) || null;
      }

      if (cancelled) return;
      if (!wh) {
        console.warn('[WarehouseDetail] 仓库未找到（Store+API 均无数据），warehouseId:', warehouseId);
      }
      setWarehouse(wh);

      // 3. 获取关联数据（dashboardApi 内部已含 try-catch + fallback）
      if (wh) {
        try {
          const [inbound, outbound, inv] = await Promise.all([
            dashboardApi.getInboundRecords(),
            dashboardApi.getOutboundRecords(),
            dashboardApi.getInventory(),
          ]);
          if (!cancelled) {
            setInboundRecords(inbound.filter((r: InboundRecord) => r.warehouseId === warehouseId));
            setOutboundRecords(outbound.filter((r: OutboundRecord) => r.warehouseId === warehouseId));
            setInventory(inv.filter((i: InventoryItem) => i.warehouseId === warehouseId));
          }
        } catch {
          // dashboardApi 内部已有 fallback，此处理论上不会触发
          if (!cancelled) {
            setInboundRecords([]);
            setOutboundRecords([]);
            setInventory([]);
          }
        }
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [warehouseId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} sx={{ color: '#111827' }} />
      </Box>
    );
  }

  if (!warehouse) {
    console.error('[WarehouseDetail] 仓库未找到，warehouseId:', warehouseId);
    return (
      <Alert severity="error">
        仓库不存在（ID: {warehouseId || '未知'}）。<Button onClick={() => navigate('/warehouses')}>返回列表</Button>
      </Alert>
    );
  }

  // 防御性检查：确保仓库数据完整
  if (!warehouse.id || !warehouse.name) {
    console.error('[WarehouseDetail] 仓库数据不完整:', warehouse);
    return (
      <Alert severity="error">
        仓库数据异常，请联系管理员。<Button onClick={() => navigate('/warehouses')}>返回列表</Button>
      </Alert>
    );
  }

  // 使用统一的件数基础容积率计算（来自 volumeCalculator）
  const rate = calcUtilizationByItems(warehouse);
  const color = getProgressColor(rate);

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
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>{(warehouse.totalItems ?? warehouse.totalVolume).toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary">件数上限</Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: color === 'error' ? '#f44336' : color === 'warning' ? '#ff9800' : '#4caf50' }}>
                      {(warehouse.usedItems ?? warehouse.usedVolume).toLocaleString()}
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
