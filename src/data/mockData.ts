import dayjs from 'dayjs';
import type {
  Warehouse,
  TransitOrder,
  InventoryItem,
  MonthlyTrend,
  VolumeHistoryPoint,
  InboundRecord,
  OutboundRecord,
} from '../types';

// ===================== Warehouses =====================

export const mockWarehouses: Warehouse[] = [
  {
    id: 'wh-001',
    name: '深圳总仓',
    country: '中国',
    city: '深圳',
    totalVolume: 5000,
    usedVolume: 3200,
    totalItems: 5000,
    usedItems: 3200,
    status: 'normal',
    address: '广东省深圳市宝安区航空路88号',
    manager: '张伟',
    phone: '0755-12345678',
    createdAt: '2022-01-15',
  },
  {
    id: 'wh-002',
    name: '洛杉矶仓',
    country: '美国',
    city: '洛杉矶',
    totalVolume: 3000,
    usedVolume: 2750,
    totalItems: 3000,
    usedItems: 2750,
    status: 'warning',
    address: '2301 E. Pacific Coast Hwy, Los Angeles, CA',
    manager: 'David Chen',
    phone: '+1-213-555-0192',
    createdAt: '2022-06-20',
  },
  {
    id: 'wh-003',
    name: '法兰克福仓',
    country: '德国',
    city: '法兰克福',
    totalVolume: 2500,
    usedVolume: 2400,
    totalItems: 2500,
    usedItems: 2400,
    status: 'full',
    address: 'Hanauer Landstraße 291-293, Frankfurt am Main',
    manager: 'Klaus Müller',
    phone: '+49-69-555-0123',
    createdAt: '2022-09-10',
  },
  {
    id: 'wh-004',
    name: '大阪仓',
    country: '日本',
    city: '大阪',
    totalVolume: 2000,
    usedVolume: 900,
    totalItems: 2000,
    usedItems: 900,
    status: 'normal',
    address: '大阪府大阪市浪速区難波中2-10-70',
    manager: '田中雄一',
    phone: '+81-6-555-0123',
    createdAt: '2023-02-28',
  },
  {
    id: 'wh-005',
    name: '伦敦仓',
    country: '英国',
    city: '伦敦',
    totalVolume: 1800,
    usedVolume: 1440,
    totalItems: 1800,
    usedItems: 1440,
    status: 'warning',
    address: '35 Great St Thomas Apostle, London EC4V 2BH',
    manager: 'Emma Watson',
    phone: '+44-20-555-0123',
    createdAt: '2023-05-15',
  },
];

// ===================== In-Transit Orders =====================

export const mockTransitOrders: TransitOrder[] = [
  {
    id: 'tr-001',
    trackingNo: 'SY-2024-001234',
    fromWarehouseId: 'wh-001',
    toWarehouseId: 'wh-002',
    category: '电子产品',
    weight: 580,
    volume: 4.2,
    transportMode: 'sea',
    estimatedArrival: '2024-05-20',
    status: 'in_transit',
    createdAt: '2024-04-15',
    carrier: '中远海运',
    value: 85000,
    statusHistory: [
      { status: 'dispatched', time: '2024-04-15 09:00', location: '深圳总仓', remark: '货物已从深圳发出' },
      { status: 'in_transit', time: '2024-04-18 14:30', location: '上海港', remark: '装船，预计航行25天' },
    ],
  },
  {
    id: 'tr-002',
    trackingNo: 'AY-2024-005678',
    fromWarehouseId: 'wh-001',
    toWarehouseId: 'wh-003',
    category: '服装配饰',
    weight: 120,
    volume: 1.8,
    transportMode: 'air',
    estimatedArrival: '2024-05-08',
    actualArrival: '2024-05-07',
    status: 'arrived',
    createdAt: '2024-04-28',
    carrier: '中国国际航空',
    value: 32000,
    statusHistory: [
      { status: 'dispatched', time: '2024-04-28 10:00', location: '深圳总仓', remark: '货物已从深圳发出' },
      { status: 'in_transit', time: '2024-04-28 22:15', location: '深圳宝安机场', remark: '货物已上机，航班CA937' },
      { status: 'customs', time: '2024-05-05 08:30', location: '法兰克福机场', remark: '进入海关清关程序' },
      { status: 'arrived', time: '2024-05-07 16:00', location: '法兰克福仓', remark: '货物已入库' },
    ],
  },
  {
    id: 'tr-003',
    trackingNo: 'LY-2024-009012',
    fromWarehouseId: 'wh-002',
    toWarehouseId: 'wh-005',
    category: '家居用品',
    weight: 340,
    volume: 6.5,
    transportMode: 'sea',
    estimatedArrival: '2024-06-10',
    status: 'dispatched',
    createdAt: '2024-05-01',
    carrier: '马士基',
    value: 28500,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-01 11:00', location: '洛杉矶仓', remark: '货物已从洛杉矶发出' },
    ],
  },
  {
    id: 'tr-004',
    trackingNo: 'SY-2024-003456',
    fromWarehouseId: 'wh-001',
    toWarehouseId: 'wh-004',
    category: '美妆个护',
    weight: 210,
    volume: 2.1,
    transportMode: 'sea',
    estimatedArrival: '2024-05-25',
    status: 'customs',
    createdAt: '2024-04-20',
    carrier: '日本邮船',
    value: 48000,
    statusHistory: [
      { status: 'dispatched', time: '2024-04-20 08:00', location: '深圳总仓', remark: '货物已从深圳发出' },
      { status: 'in_transit', time: '2024-04-22 18:00', location: '深圳盐田港', remark: '完成装船' },
      { status: 'customs', time: '2024-05-10 09:00', location: '大阪港', remark: '正在办理清关手续' },
    ],
  },
  {
    id: 'tr-005',
    trackingNo: 'AY-2024-007890',
    fromWarehouseId: 'wh-003',
    toWarehouseId: 'wh-001',
    category: '机械配件',
    weight: 450,
    volume: 3.8,
    transportMode: 'air',
    estimatedArrival: '2024-05-12',
    actualArrival: '2024-05-12',
    status: 'arrived',
    createdAt: '2024-05-05',
    carrier: '汉莎航空',
    value: 120000,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-05 14:00', location: '法兰克福仓', remark: '货物已从法兰克福发出' },
      { status: 'in_transit', time: '2024-05-05 22:00', location: '法兰克福机场', remark: '装机，航班LH797' },
      { status: 'customs', time: '2024-05-11 07:30', location: '深圳宝安机场', remark: '进入海关清关' },
      { status: 'arrived', time: '2024-05-12 15:00', location: '深圳总仓', remark: '货物已入库完成' },
    ],
  },
  {
    id: 'tr-006',
    trackingNo: 'LY-2024-011234',
    fromWarehouseId: 'wh-004',
    toWarehouseId: 'wh-002',
    category: '食品保健',
    weight: 180,
    volume: 2.4,
    transportMode: 'land',
    estimatedArrival: '2024-05-30',
    status: 'in_transit',
    createdAt: '2024-05-08',
    carrier: '顺丰国际',
    value: 22000,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-08 09:30', location: '大阪仓', remark: '货物已从大阪发出' },
      { status: 'in_transit', time: '2024-05-10 14:00', location: '名古屋', remark: '陆运运输中' },
    ],
  },
  {
    id: 'tr-007',
    trackingNo: 'SY-2024-015678',
    fromWarehouseId: 'wh-002',
    toWarehouseId: 'wh-001',
    category: '电子产品',
    weight: 760,
    volume: 8.2,
    transportMode: 'sea',
    estimatedArrival: '2024-06-25',
    status: 'dispatched',
    createdAt: '2024-05-10',
    carrier: '中远海运',
    value: 195000,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-10 10:00', location: '洛杉矶仓', remark: '货物已从洛杉矶发出' },
    ],
  },
  {
    id: 'tr-008',
    trackingNo: 'AY-2024-019012',
    fromWarehouseId: 'wh-005',
    toWarehouseId: 'wh-003',
    category: '图书文具',
    weight: 95,
    volume: 1.2,
    transportMode: 'air',
    estimatedArrival: '2024-05-18',
    status: 'customs',
    createdAt: '2024-05-12',
    carrier: '英国航空',
    value: 8500,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-12 13:00', location: '伦敦仓', remark: '货物已从伦敦发出' },
      { status: 'in_transit', time: '2024-05-12 21:00', location: '希思罗机场', remark: '装机，航班BA902' },
      { status: 'customs', time: '2024-05-16 08:00', location: '法兰克福机场', remark: '清关处理中' },
    ],
  },
  {
    id: 'tr-009',
    trackingNo: 'SY-2024-021345',
    fromWarehouseId: 'wh-001',
    toWarehouseId: 'wh-005',
    category: '玩具礼品',
    weight: 420,
    volume: 12.0,
    transportMode: 'sea',
    estimatedArrival: '2024-06-15',
    status: 'in_transit',
    createdAt: '2024-04-25',
    carrier: '地中海航运',
    value: 38000,
    statusHistory: [
      { status: 'dispatched', time: '2024-04-25 08:00', location: '深圳总仓', remark: '货物已从深圳发出' },
      { status: 'in_transit', time: '2024-04-28 20:00', location: '厦门港', remark: '完成装船，正在途中' },
    ],
  },
  {
    id: 'tr-010',
    trackingNo: 'LY-2024-023456',
    fromWarehouseId: 'wh-003',
    toWarehouseId: 'wh-005',
    category: '服装配饰',
    weight: 155,
    volume: 2.8,
    transportMode: 'land',
    estimatedArrival: '2024-05-22',
    status: 'arrived',
    actualArrival: '2024-05-21',
    createdAt: '2024-05-14',
    carrier: 'DHL Express',
    value: 42000,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-14 09:00', location: '法兰克福仓', remark: '货物从法兰克福发出' },
      { status: 'in_transit', time: '2024-05-15 12:00', location: '科隆', remark: '陆运途中经科隆' },
      { status: 'arrived', time: '2024-05-21 14:00', location: '伦敦仓', remark: '货物已入库' },
    ],
  },
  {
    id: 'tr-011',
    trackingNo: 'AY-2024-025678',
    fromWarehouseId: 'wh-001',
    toWarehouseId: 'wh-002',
    category: '医疗器械',
    weight: 85,
    volume: 0.9,
    transportMode: 'air',
    estimatedArrival: '2024-05-28',
    status: 'in_transit',
    createdAt: '2024-05-20',
    carrier: '国泰航空',
    value: 280000,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-20 15:00', location: '深圳总仓', remark: '医疗器械，特殊处理发出' },
      { status: 'in_transit', time: '2024-05-20 23:30', location: '香港国际机场', remark: '货物已上机' },
    ],
  },
  {
    id: 'tr-012',
    trackingNo: 'SY-2024-027890',
    fromWarehouseId: 'wh-004',
    toWarehouseId: 'wh-003',
    category: '汽车配件',
    weight: 890,
    volume: 7.5,
    transportMode: 'sea',
    estimatedArrival: '2024-06-30',
    status: 'dispatched',
    createdAt: '2024-05-18',
    carrier: '商船三井',
    value: 165000,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-18 11:00', location: '大阪仓', remark: '汽车配件从大阪发出' },
    ],
  },
  {
    id: 'tr-013',
    trackingNo: 'LY-2024-031234',
    fromWarehouseId: 'wh-005',
    toWarehouseId: 'wh-001',
    category: '家居用品',
    weight: 260,
    volume: 5.1,
    transportMode: 'sea',
    estimatedArrival: '2024-06-28',
    status: 'customs',
    createdAt: '2024-05-05',
    carrier: '赫伯罗特',
    value: 19500,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-05 10:00', location: '伦敦仓', remark: '家居用品从伦敦发出' },
      { status: 'in_transit', time: '2024-05-08 16:00', location: '南安普顿港', remark: '完成装船' },
      { status: 'customs', time: '2024-05-28 08:00', location: '上海港', remark: '正在清关' },
    ],
  },
  {
    id: 'tr-014',
    trackingNo: 'AY-2024-035678',
    fromWarehouseId: 'wh-002',
    toWarehouseId: 'wh-004',
    category: '电子产品',
    weight: 145,
    volume: 1.5,
    transportMode: 'air',
    estimatedArrival: '2024-05-25',
    status: 'in_transit',
    createdAt: '2024-05-19',
    carrier: '美国联合航空',
    value: 72000,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-19 16:00', location: '洛杉矶仓', remark: '货物从洛杉矶发出' },
      { status: 'in_transit', time: '2024-05-19 23:00', location: '洛杉矶国际机场', remark: '已装机' },
    ],
  },
  {
    id: 'tr-015',
    trackingNo: 'SY-2024-039012',
    fromWarehouseId: 'wh-001',
    toWarehouseId: 'wh-003',
    category: '美妆个护',
    weight: 320,
    volume: 3.6,
    transportMode: 'sea',
    estimatedArrival: '2024-06-20',
    status: 'in_transit',
    createdAt: '2024-04-30',
    carrier: '中远海运',
    value: 56000,
    statusHistory: [
      { status: 'dispatched', time: '2024-04-30 10:00', location: '深圳总仓', remark: '美妆产品从深圳发出' },
      { status: 'in_transit', time: '2024-05-03 18:00', location: '广州南沙港', remark: '装船完毕' },
    ],
  },
  {
    id: 'tr-016',
    trackingNo: 'LY-2024-043456',
    fromWarehouseId: 'wh-003',
    toWarehouseId: 'wh-002',
    category: '食品保健',
    weight: 400,
    volume: 4.8,
    transportMode: 'land',
    estimatedArrival: '2024-05-24',
    status: 'arrived',
    actualArrival: '2024-05-23',
    createdAt: '2024-05-16',
    carrier: 'DB Schenker',
    value: 35000,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-16 08:00', location: '法兰克福仓', remark: '食品从法兰克福发出' },
      { status: 'in_transit', time: '2024-05-17 10:00', location: '鹿特丹港', remark: '准备装船运往美国' },
      { status: 'customs', time: '2024-05-21 09:00', location: '迈阿密港', remark: 'FDA清关中' },
      { status: 'arrived', time: '2024-05-23 15:00', location: '洛杉矶仓', remark: '货物已入库' },
    ],
  },
  {
    id: 'tr-017',
    trackingNo: 'AY-2024-047890',
    fromWarehouseId: 'wh-004',
    toWarehouseId: 'wh-005',
    category: '玩具礼品',
    weight: 75,
    volume: 2.2,
    transportMode: 'air',
    estimatedArrival: '2024-05-20',
    status: 'arrived',
    actualArrival: '2024-05-19',
    createdAt: '2024-05-14',
    carrier: '全日空',
    value: 18000,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-14 14:00', location: '大阪仓', remark: '玩具礼品从大阪发出' },
      { status: 'in_transit', time: '2024-05-14 22:30', location: '关西国际机场', remark: '装机，航班NH212' },
      { status: 'customs', time: '2024-05-17 07:00', location: '希思罗机场', remark: '海关检验中' },
      { status: 'arrived', time: '2024-05-19 11:00', location: '伦敦仓', remark: '货物已入库' },
    ],
  },
  {
    id: 'tr-018',
    trackingNo: 'SY-2024-051234',
    fromWarehouseId: 'wh-005',
    toWarehouseId: 'wh-002',
    category: '机械配件',
    weight: 1200,
    volume: 9.8,
    transportMode: 'sea',
    estimatedArrival: '2024-07-10',
    status: 'dispatched',
    createdAt: '2024-05-22',
    carrier: '马士基',
    value: 230000,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-22 09:00', location: '伦敦仓', remark: '机械配件从伦敦发出' },
    ],
  },
  {
    id: 'tr-019',
    trackingNo: 'LY-2024-055678',
    fromWarehouseId: 'wh-002',
    toWarehouseId: 'wh-001',
    category: '图书文具',
    weight: 55,
    volume: 0.8,
    transportMode: 'air',
    estimatedArrival: '2024-05-27',
    status: 'in_transit',
    createdAt: '2024-05-21',
    carrier: 'FedEx国际',
    value: 5500,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-21 15:00', location: '洛杉矶仓', remark: '从洛杉矶发出' },
      { status: 'in_transit', time: '2024-05-22 02:00', location: '洛杉矶国际机场', remark: '货物已上机' },
    ],
  },
  {
    id: 'tr-020',
    trackingNo: 'SY-2024-059012',
    fromWarehouseId: 'wh-001',
    toWarehouseId: 'wh-002',
    category: '汽车配件',
    weight: 680,
    volume: 5.5,
    transportMode: 'sea',
    estimatedArrival: '2024-06-18',
    status: 'in_transit',
    createdAt: '2024-05-02',
    carrier: '阳明海运',
    value: 145000,
    statusHistory: [
      { status: 'dispatched', time: '2024-05-02 08:00', location: '深圳总仓', remark: '汽车配件从深圳发出' },
      { status: 'in_transit', time: '2024-05-05 20:00', location: '深圳盐田港', remark: '完成装船' },
    ],
  },
];

// ===================== Inventory (100+ SKUs) =====================

const categories = ['电子产品', '服装配饰', '家居用品', '美妆个护', '食品保健', '玩具礼品', '机械配件', '图书文具', '医疗器械', '汽车配件'];
const warehouseIds = ['wh-001', 'wh-002', 'wh-003', 'wh-004', 'wh-005'];
const skuNames: Record<string, string[]> = {
  '电子产品': ['无线耳机', '智能手表', '蓝牙音箱', '移动电源', '平板电脑', 'USB集线器', '机械键盘', '游戏鼠标'],
  '服装配饰': ['休闲T恤', '牛仔裤', '运动鞋', '皮革钱包', '太阳镜', '棒球帽', '丝巾', '腰带'],
  '家居用品': ['咖啡机', '电动牙刷', '空气炸锅', '智能台灯', '加湿器', '挂钟', '储物盒', '桌面风扇'],
  '美妆个护': ['保湿精华', '卸妆水', '口红套装', '眉笔', '防晒霜', '洗发水', '身体乳', '面膜'],
  '食品保健': ['蛋白粉', '鱼油胶囊', '复合维生素', '益生菌', '蜂蜜', '茶叶礼盒', '坚果混合', '燕麦片'],
  '玩具礼品': ['积木套装', '遥控汽车', '毛绒玩具', '拼图1000片', '桌游套装', '卡片收藏册', '水彩颜料', '儿童相机'],
  '机械配件': ['轴承套装', '密封圈', '传动皮带', '液压缸', '齿轮组', '螺栓螺母套装', '角磨机', '扭矩扳手'],
  '图书文具': ['笔记本套装', '荧光笔', '圆珠笔', '文件夹', '便利贴', '剪刀', '订书机', '直尺'],
  '医疗器械': ['血压计', '血糖仪', '额温枪', '心率监测仪', '雾化器', '护膝', '医用口罩', '手术灯'],
  '汽车配件': ['机油滤清器', '刹车片', '汽车蜡', '车载充电器', '行车记录仪', '空气滤芯', '雨刷片', '车门防撞条'],
};

function generateInventory(ageWarningDays: number = 90): InventoryItem[] {
  const items: InventoryItem[] = [];
  let index = 1;

  categories.forEach((cat) => {
    const names = skuNames[cat];
    names.forEach((name) => {
      warehouseIds.slice(0, 3).forEach((whId) => {
        const qty = Math.floor(Math.random() * 200) + 10;
        const volPerUnit = parseFloat((Math.random() * 0.08 + 0.01).toFixed(3));
        const valPerUnit = parseFloat((Math.random() * 200 + 20).toFixed(2));
        const daysAgo = Math.floor(Math.random() * 180);
        const inboundDate = dayjs().subtract(daysAgo, 'day').format('YYYY-MM-DD');
        const isAgeWarning = daysAgo > ageWarningDays;

        items.push({
          id: `inv-${String(index).padStart(4, '0')}`,
          sku: `SKU-${cat.substring(0, 2)}-${String(index).padStart(4, '0')}`,
          name,
          warehouseId: whId,
          quantity: qty,
          volumePerUnit: volPerUnit,
          totalVolume: parseFloat((qty * volPerUnit).toFixed(2)),
          inboundDate,
          valuePerUnit: valPerUnit,
          totalValue: parseFloat((qty * valPerUnit).toFixed(2)),
          category: cat,
          isAgeWarning,
        });
        index++;
      });
    });
  });

  return items;
}

export const mockInventory: InventoryItem[] = generateInventory();

// ===================== Volume History (30 days) =====================

export const mockVolumeHistory: VolumeHistoryPoint[] = Array.from({ length: 30 }, (_, i) => {
  const date = dayjs().subtract(29 - i, 'day').format('MM-DD');
  const base = 62;
  const noise = (Math.random() - 0.5) * 10;
  return {
    date,
    utilizationRate: parseFloat((base + noise + i * 0.15).toFixed(1)),
  };
});

// ===================== Monthly Trend (12 months) =====================

export const mockMonthlyTrend: MonthlyTrend[] = [
  { month: '2023-06', inbound: 820, outbound: 760 },
  { month: '2023-07', inbound: 940, outbound: 890 },
  { month: '2023-08', inbound: 1050, outbound: 980 },
  { month: '2023-09', inbound: 880, outbound: 850 },
  { month: '2023-10', inbound: 1120, outbound: 1060 },
  { month: '2023-11', inbound: 1380, outbound: 1290 },
  { month: '2023-12', inbound: 1650, outbound: 1580 },
  { month: '2024-01', inbound: 920, outbound: 870 },
  { month: '2024-02', inbound: 780, outbound: 720 },
  { month: '2024-03', inbound: 1050, outbound: 990 },
  { month: '2024-04', inbound: 1240, outbound: 1150 },
  { month: '2024-05', inbound: 1180, outbound: 1090 },
];

// ===================== Inbound Records =====================

export const mockInboundRecords: InboundRecord[] = [
  { id: 'in-001', warehouseId: 'wh-001', sku: 'SKU-电子-0001', name: '无线耳机', quantity: 200, volume: 1.6, createdAt: '2024-05-01', operator: '张伟', status: 'completed' },
  { id: 'in-002', warehouseId: 'wh-001', sku: 'SKU-服装-0002', name: '休闲T恤', quantity: 500, volume: 2.5, createdAt: '2024-05-03', operator: '张伟', status: 'completed' },
  { id: 'in-003', warehouseId: 'wh-002', sku: 'SKU-家居-0003', name: '咖啡机', quantity: 80, volume: 3.2, createdAt: '2024-05-05', operator: 'David Chen', status: 'completed' },
  { id: 'in-004', warehouseId: 'wh-003', sku: 'SKU-美妆-0004', name: '保湿精华', quantity: 300, volume: 0.9, createdAt: '2024-05-08', operator: 'Klaus Müller', status: 'completed' },
  { id: 'in-005', warehouseId: 'wh-001', sku: 'SKU-电子-0005', name: '智能手表', quantity: 150, volume: 0.75, createdAt: '2024-05-10', operator: '李明', status: 'pending' },
  { id: 'in-006', warehouseId: 'wh-004', sku: 'SKU-玩具-0006', name: '积木套装', quantity: 120, volume: 4.8, createdAt: '2024-05-12', operator: '田中雄一', status: 'completed' },
  { id: 'in-007', warehouseId: 'wh-005', sku: 'SKU-机械-0007', name: '轴承套装', quantity: 400, volume: 2.4, createdAt: '2024-05-15', operator: 'Emma Watson', status: 'completed' },
  { id: 'in-008', warehouseId: 'wh-001', sku: 'SKU-食品-0008', name: '蛋白粉', quantity: 600, volume: 3.0, createdAt: '2024-05-18', operator: '王芳', status: 'pending' },
];

// ===================== Outbound Records =====================

export const mockOutboundRecords: OutboundRecord[] = [
  { id: 'out-001', warehouseId: 'wh-001', sku: 'SKU-电子-0001', name: '无线耳机', quantity: 50, volume: 0.4, createdAt: '2024-05-02', operator: '张伟', destination: '洛杉矶仓' },
  { id: 'out-002', warehouseId: 'wh-002', sku: 'SKU-家居-0003', name: '咖啡机', quantity: 20, volume: 0.8, createdAt: '2024-05-06', operator: 'David Chen', destination: '终端客户' },
  { id: 'out-003', warehouseId: 'wh-001', sku: 'SKU-服装-0002', name: '休闲T恤', quantity: 200, volume: 1.0, createdAt: '2024-05-07', operator: '李明', destination: '法兰克福仓' },
  { id: 'out-004', warehouseId: 'wh-003', sku: 'SKU-美妆-0004', name: '保湿精华', quantity: 100, volume: 0.3, createdAt: '2024-05-09', operator: 'Klaus Müller', destination: '伦敦仓' },
  { id: 'out-005', warehouseId: 'wh-004', sku: 'SKU-玩具-0006', name: '积木套装', quantity: 30, volume: 1.2, createdAt: '2024-05-14', operator: '田中雄一', destination: '终端客户' },
  { id: 'out-006', warehouseId: 'wh-001', sku: 'SKU-电子-0005', name: '智能手表', quantity: 80, volume: 0.4, createdAt: '2024-05-16', operator: '张伟', destination: '大阪仓' },
];

// ===================== Derived / Computed Data =====================

/** 计算各仓库容积利用率（基于件数）— 防御性计算，避免 NaN / Infinity */
export function getWarehouseUtilization(wh: Warehouse): number {
  const total = Number.isFinite(wh.totalItems) && wh.totalItems! > 0 ? wh.totalItems! : (Number.isFinite(wh.totalVolume) ? wh.totalVolume : 1);
  const used = Number.isFinite(wh.usedItems) && wh.usedItems! >= 0 ? wh.usedItems! : (Number.isFinite(wh.usedVolume) ? wh.usedVolume : 0);
  if (total <= 0) return 0;
  const ratio = used / total;
  if (!Number.isFinite(ratio)) return 0;
  return parseFloat((ratio * 100).toFixed(1));
}

/** 获取容积率颜色（支持自定义阈值） */
export function getUtilizationColor(rate: number, warningThreshold: number = 70, fullThreshold: number = 90): 'success' | 'warning' | 'error' {
  if (rate < warningThreshold) return 'success';
  if (rate <= fullThreshold) return 'warning';
  return 'error';
}

/** 按仓库名称获取仓库 */
export function getWarehouseById(id: string): Warehouse | undefined {
  return mockWarehouses.find((w) => w.id === id);
}

/** KPI 计算 */
export const kpiData = {
  totalTransitVolume: parseFloat(
    mockTransitOrders
      .filter((t) => t.status !== 'arrived')
      .reduce((s, t) => s + t.volume, 0)
      .toFixed(1)
  ),
  totalVolumeUtilization: parseFloat(
    (
      (mockWarehouses.reduce((s, w) => s + w.usedVolume, 0) /
        mockWarehouses.reduce((s, w) => s + w.totalVolume, 0)) *
      100
    ).toFixed(1)
  ),
  pendingInboundOrders: mockInboundRecords.filter((r) => r.status === 'pending').length,
  todayOutboundCount: 6,
  /** 库存深度（天）= 当前库存总件数 / 日均出库件数 */
  inventoryDepth: (() => {
    const totalInventoryQty = mockInventory.reduce((s, item) => s + item.quantity, 0);
    // 模拟30天日均出库量
    const avgDailyOutbound = Math.max(1, Math.round(totalInventoryQty / 120));
    return parseFloat((totalInventoryQty / avgDailyOutbound).toFixed(0));
  })(),
};

/** 在途货物状态分布 */
export const transitStatusDistribution = [
  { name: '已发出', value: mockTransitOrders.filter((t) => t.status === 'dispatched').length, color: '#9CA3AF' },
  { name: '运输中', value: mockTransitOrders.filter((t) => t.status === 'in_transit').length, color: '#111827' },
  { name: '清关中', value: mockTransitOrders.filter((t) => t.status === 'customs').length, color: '#6B7280' },
  { name: '已到达', value: mockTransitOrders.filter((t) => t.status === 'arrived').length, color: '#D1D5DB' },
];
