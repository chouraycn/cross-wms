/**
 * API Credentials REST API — 凭证管理端点
 *
 * v3.0: CRUD 端点（不暴露明文值）
 * - GET    /api/api-credentials           — 列出凭证（不含明文值）
 * - GET    /api/api-credentials/:id       — 获取凭证详情（不含明文值）
 * - POST   /api/api-credentials           — 创建凭证（body 含 value，加密存储）
 * - PUT    /api/api-credentials/:id       — 更新凭证
 * - DELETE /api/api-credentials/:id       — 删除凭证
 */

import { Router } from 'express';
import {
  listCredentials,
  getCredential,
  createCredential,
  updateCredential,
  deleteCredential,
} from '../dao/apiCredentials.js';
import { ok, created, fail, notFound, serverError, BizCode } from './_shared/respond.js';

const router = Router();

// GET /api/api-credentials — 列出凭证
router.get('/', (req, res) => {
  try {
    const domain = req.query.domain as string | undefined;
    const result = listCredentials(domain);
    return ok(res, result);
  } catch (e) {
    return serverError(res, `获取凭证列表失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// GET /api/api-credentials/:id — 获取凭证详情
router.get('/:id', (req, res) => {
  try {
    const credential = getCredential(req.params.id);
    if (!credential) {
      return notFound(res, `凭证不存在: ${req.params.id}`);
    }
    return ok(res, credential);
  } catch (e) {
    return serverError(res, `获取凭证失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// POST /api/api-credentials — 创建凭证
router.post('/', (req, res) => {
  try {
    const { name, credentialType, value, domain, headerName } = req.body;

    // 必填字段验证
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return fail(res, BizCode.BAD_REQUEST, 'name 不能为空', 400);
    }
    if (!value || typeof value !== 'string' || value.trim() === '') {
      return fail(res, BizCode.BAD_REQUEST, 'value 不能为空', 400);
    }
    if (!domain || typeof domain !== 'string' || domain.trim() === '') {
      return fail(res, BizCode.BAD_REQUEST, 'domain 不能为空', 400);
    }

    const credential = createCredential({
      name: name.trim(),
      credentialType: credentialType || 'api_key',
      value: value,
      domain: domain.trim(),
      headerName: headerName || 'Authorization',
    });

    return created(res, credential);
  } catch (e) {
    return serverError(res, `创建凭证失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// PUT /api/api-credentials/:id — 更新凭证
router.put('/:id', (req, res) => {
  try {
    const { name, value, domain, headerName, credentialType } = req.body;

    const updated = updateCredential(req.params.id, {
      name,
      value,
      domain,
      headerName,
      credentialType,
    });

    if (!updated) {
      return notFound(res, `凭证不存在: ${req.params.id}`);
    }

    return ok(res, updated);
  } catch (e) {
    return serverError(res, `更新凭证失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// DELETE /api/api-credentials/:id — 删除凭证
router.delete('/:id', (req, res) => {
  try {
    const success = deleteCredential(req.params.id);
    if (!success) {
      return notFound(res, `凭证不存在: ${req.params.id}`);
    }
    return ok(res, { success: true });
  } catch (e) {
    return serverError(res, `删除凭证失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

export default router;
