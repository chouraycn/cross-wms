/**
 * WmsAlertRuleEditor
 *
 * WMS 预警规则编辑器组件。
 * 支持配置低库存阈值、临期天数、呆滞天数，以及各检查项的启用状态。
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Paper,
  Divider,
  Alert,
  Snackbar,
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';

// ===================== 类型定义 =====================

interface AlertRuleConfig {
  lowStock: number;
  expiryDays: number;
  stagnantDays: number;
  enableLowStock: boolean;
  enableExpiry: boolean;
  enableStagnant: boolean;
}

const DEFAULT_CONFIG: AlertRuleConfig = {
  lowStock: 10,
  expiryDays: 30,
  stagnantDays: 90,
  enableLowStock: true,
  enableExpiry: true,
  enableStagnant: true,
};

// ===================== 组件 =====================

/**
 * WMS 预警规则编辑器
 */
const WmsAlertRuleEditor: React.FC = () => {
  const [config, setConfig] = useState<AlertRuleConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState<boolean>(false);
  const { showToast } = useToast();

  // 加载已保存的配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/wms/alerts/config');
        if (res.ok) {
          const data = await res.json();
          const result = data.data || data;
          setConfig({
            lowStock: result.lowStock ?? DEFAULT_CONFIG.lowStock,
            expiryDays: result.expiryDays ?? DEFAULT_CONFIG.expiryDays,
            stagnantDays: result.stagnantDays ?? DEFAULT_CONFIG.stagnantDays,
            enableLowStock: result.enableLowStock ?? DEFAULT_CONFIG.enableLowStock,
            enableExpiry: result.enableExpiry ?? DEFAULT_CONFIG.enableExpiry,
            enableStagnant: result.enableStagnant ?? DEFAULT_CONFIG.enableStagnant,
          });
        }
      } catch (err) {
        console.error('加载预警配置失败:', err);
      }
    };

    loadConfig();
  }, []);

  // 处理输入框变化
  const handleInputChange = (field: keyof AlertRuleConfig) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = parseInt(event.target.value, 10);
    if (!isNaN(value) && value >= 0) {
      setConfig((prev) => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  // 处理开关变化
  const handleSwitchChange = (field: keyof AlertRuleConfig) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setConfig((prev) => ({
      ...prev,
      [field]: event.target.checked,
    }));
  };

  // 保存配置
  const handleSave = async () => {
    try {
      const res = await fetch('/api/wms/alerts/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errData.error || res.statusText);
      }

      setSaved(true);
      showToast('预警规则已保存', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`保存失败: ${message}`, 'error');
    }
  };

  // 恢复默认设置
  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    showToast('已恢复默认设置', 'info');
  };

  return (
    <Paper elevation={2} sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h6" gutterBottom>
        WMS 预警规则配置
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        配置库存预警的触发条件，系统将定期扫描并自动创建预警记录。
      </Typography>

      <Divider sx={{ mb: 3 }} />

      {/* 低库存阈值 */}
      <Box sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={config.enableLowStock}
              onChange={handleSwitchChange('enableLowStock')}
              color="primary"
            />
          }
          label="启用低库存预警"
          sx={{ mb: 1, display: 'block' }}
        />
        <TextField
          label="低库存阈值"
          type="number"
          value={config.lowStock}
          onChange={handleInputChange('lowStock')}
          disabled={!config.enableLowStock}
          fullWidth
          size="small"
          InputProps={{ inputProps: { min: 0 } }}
          helperText="当库存数量 ≤ 此值时触发预警"
          sx={{ mt: 1 }}
        />
      </Box>

      {/* 临期天数 */}
      <Box sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={config.enableExpiry}
              onChange={handleSwitchChange('enableExpiry')}
              color="primary"
            />
          }
          label="启用临期预警"
          sx={{ mb: 1, display: 'block' }}
        />
        <TextField
          label="临期天数"
          type="number"
          value={config.expiryDays}
          onChange={handleInputChange('expiryDays')}
          disabled={!config.enableExpiry}
          fullWidth
          size="small"
          InputProps={{ inputProps: { min: 0 } }}
          helperText="到期日期在 ≤ 此天数时触发预警"
          sx={{ mt: 1 }}
        />
      </Box>

      {/* 呆滞天数 */}
      <Box sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={config.enableStagnant}
              onChange={handleSwitchChange('enableStagnant')}
              color="primary"
            />
          }
          label="启用呆滞库存预警"
          sx={{ mb: 1, display: 'block' }}
        />
        <TextField
          label="呆滞天数"
          type="number"
          value={config.stagnantDays}
          onChange={handleInputChange('stagnantDays')}
          disabled={!config.enableStagnant}
          fullWidth
          size="small"
          InputProps={{ inputProps: { min: 0 } }}
          helperText="≥ 此天数无变动/出库记录时触发预警"
          sx={{ mt: 1 }}
        />
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* 操作按钮 */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button variant="outlined" onClick={handleReset}>
          恢复默认
        </Button>
        <Button variant="contained" onClick={handleSave} color="primary">
          保存配置
        </Button>
      </Box>

      {/* 保存成功提示 */}
      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        message="配置已保存"
      />
    </Paper>
  );
};

export default WmsAlertRuleEditor;
