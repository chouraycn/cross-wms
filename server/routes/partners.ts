/**
 * Partners Routes — 客商管理 API
 *
 * 提供客商的 CRUD 操作和快速创建端点。
 * 所有响应遵循统一格式：{ code: number, data: T | null, message: string }
 *
 * 端点列表：
 *   GET    /api/partners            — 分页列表（支持 type/search/page/pageSize）
 *   GET    /api/partners/all        — 全部客商（供 Autocomplete 使用）
 *   GET    /api/partners/:id        — 单个客商详情
 *   POST   /api/partners            — 创建客商（含名称唯一性校验）
 *   PUT    /api/partners/:id        — 更新客商（允许 type 变更）
 *   DELETE /api/partners/:id        — 删除客商（含引用检查保护）
 *   POST   /api/partners/quick-create — 快速创建客商
 */
import { Router, type Request, type Response } from 'express';
import * as partnerDao from '../dao/partnerDao.js';

const router = Router();

// ===================== GET /api/partners — 分页列表 =====================

router.get('/', (req: Request, res: Response) => {
  const type = req.query.type as 'supplier' | 'customer' | undefined;
  const search = req.query.search as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.max(1, parseInt(req.query.pageSize as string, 10) || 20);

  // 校验 type 参数
  if (type && type !== 'supplier' && type !== 'customer') {
    res.status(400).json({ code: 400, data: null, message: 'type 必须是 supplier 或 customer' });
    return;
  }

  const result = partnerDao.listPartners(type, search, page, pageSize);
  res.json({
    code: 0,
    data: {
      items: result.items,
      total: result.total,
      page,
      pageSize,
    },
    message: 'ok',
  });
});

// ===================== GET /api/partners/all — 全部客商 (Autocomplete) =====================
// 注意：此路由必须在 GET /:id 之前注册，否则 'all' 会被当作 :id 参数

router.get('/all', (req: Request, res: Response) => {
  const type = req.query.type as 'supplier' | 'customer' | undefined;

  if (type && type !== 'supplier' && type !== 'customer') {
    res.status(400).json({ code: 400, data: null, message: 'type 必须是 supplier 或 customer' });
    return;
  }

  const data = partnerDao.getAllPartnersByType(type);
  res.json({ code: 0, data, message: 'ok' });
});

// ===================== POST /api/partners/quick-create — 快速创建 =====================
// 注意：此路由必须在 GET /:id 之前注册，否则 'quick-create' 会被当作 :id 参数

router.post('/quick-create', (req: Request, res: Response) => {
  const { name, type } = req.body;

  // 校验 name
  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: '名称不能为空' });
    return;
  }

  // 校验 type
  if (!type || (type !== 'supplier' && type !== 'customer')) {
    res.status(400).json({ code: 400, data: null, message: '类型必须是 supplier 或 customer' });
    return;
  }

  const data = partnerDao.quickCreatePartner(name.trim(), type as 'supplier' | 'customer');
  res.status(201).json({ code: 0, data, message: 'ok' });
});

// ===================== GET /api/partners/:id — 单个客商详情 =====================

router.get('/:id', (req: Request, res: Response) => {
  const data = partnerDao.getPartnerById(req.params.id);
  if (!data) {
    res.status(404).json({ code: 404, data: null, message: '客商不存在' });
    return;
  }
  res.json({ code: 0, data, message: 'ok' });
});

// ===================== POST /api/partners — 创建客商 =====================

router.post('/', (req: Request, res: Response) => {
  const { name, type, contact, phone, address, remark } = req.body;

  // 校验 name
  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: '名称不能为空' });
    return;
  }

  // 校验 type
  if (!type || (type !== 'supplier' && type !== 'customer')) {
    res.status(400).json({ code: 400, data: null, message: '类型必须是 supplier 或 customer' });
    return;
  }

  // 名称唯一性校验（同 type 下不可重复）
  const trimmedName = name.trim();
  const allOfType = partnerDao.getAllPartnersByType(type as 'supplier' | 'customer');
  const duplicate = allOfType.find((p) => p.name === trimmedName);
  if (duplicate) {
    res.status(409).json({ code: 409, data: null, message: '该名称已存在' });
    return;
  }

  try {
    const data = partnerDao.createPartner({
      name: trimmedName,
      type: type as 'supplier' | 'customer',
      contact: typeof contact === 'string' ? contact : '',
      phone: typeof phone === 'string' ? phone : '',
      address: typeof address === 'string' ? address : '',
      remark: typeof remark === 'string' ? remark : '',
    });
    res.status(201).json({ code: 0, data, message: 'ok' });
  } catch (e) {
    const message = (e as Error).message;
    // 防御性处理 UNIQUE 约束冲突（如并发场景）
    if (message.includes('UNIQUE constraint')) {
      res.status(409).json({ code: 409, data: null, message: '该名称已存在' });
      return;
    }
    res.status(400).json({ code: 400, data: null, message });
  }
});

// ===================== PUT /api/partners/:id — 更新客商 =====================

router.put('/:id', (req: Request, res: Response) => {
  const { name, type, contact, phone, address, remark } = req.body;

  // 校验 type（如果传入）
  if (type !== undefined && type !== 'supplier' && type !== 'customer') {
    res.status(400).json({ code: 400, data: null, message: '类型必须是 supplier 或 customer' });
    return;
  }

  // 校验 name（如果传入）
  if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
    res.status(400).json({ code: 400, data: null, message: '名称不能为空' });
    return;
  }

  // 构建更新对象（仅包含传入的非 undefined 字段）
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (type !== undefined) updates.type = type;
  if (contact !== undefined) updates.contact = contact;
  if (phone !== undefined) updates.phone = phone;
  if (address !== undefined) updates.address = address;
  if (remark !== undefined) updates.remark = remark;

  try {
    const data = partnerDao.updatePartner(req.params.id, updates as Parameters<typeof partnerDao.updatePartner>[1]);
    if (!data) {
      res.status(404).json({ code: 404, data: null, message: '客商不存在' });
      return;
    }
    res.json({ code: 0, data, message: 'ok' });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes('UNIQUE constraint')) {
      res.status(409).json({ code: 409, data: null, message: '该名称已存在' });
      return;
    }
    res.status(400).json({ code: 400, data: null, message });
  }
});

// ===================== DELETE /api/partners/:id — 删除客商 =====================

router.delete('/:id', (req: Request, res: Response) => {
  const result = partnerDao.deletePartner(req.params.id);

  if (!result.success) {
    if (result.message === '客商不存在') {
      res.status(404).json({ code: 404, data: null, message: result.message! });
    } else {
      res.status(409).json({ code: 409, data: null, message: result.message! });
    }
    return;
  }

  res.json({ code: 0, data: null, message: 'ok' });
});

export default router;
