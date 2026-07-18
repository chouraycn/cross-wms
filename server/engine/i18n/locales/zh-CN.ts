/**
 * 中文 locale
 *
 * 服务端中文翻译资源。
 */

import type { LocaleMessages } from '../types.js';

export const zhCNMessages: LocaleMessages = {
  common: {
    success: '操作成功',
    error: '操作失败',
    loading: '加载中...',
    confirm: '确认',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    create: '创建',
    update: '更新',
    search: '搜索',
    reset: '重置',
    close: '关闭',
    back: '返回',
    next: '下一步',
    previous: '上一步',
    retry: '重试',
    skip: '跳过',
    submit: '提交',
    yes: '是',
    no: '否',
    ok: '确定',
  },
  errors: {
    unknown: '未知错误',
    network: '网络错误',
    timeout: '请求超时',
    unauthorized: '未授权',
    forbidden: '禁止访问',
    notFound: '未找到',
    internalServer: '服务器内部错误',
    badRequest: '请求错误',
    validationFailed: '验证失败',
    rateLimit: '请求过于频繁，请稍后再试',
  },
  chat: {
    newChat: '新对话',
    send: '发送',
    typing: '正在输入...',
    errorSending: '发送失败',
    history: '历史记录',
    clearHistory: '清空历史',
    deleteSession: '删除会话',
    sessionDeleted: '会话已删除',
    messageTooLong: '消息过长',
    emptyMessage: '消息不能为空',
    thinking: '思考中...',
  },
  mcp: {
    connected: '已连接',
    disconnected: '已断开',
    connecting: '连接中...',
    error: '连接错误',
    toolsLoaded: '工具已加载',
    toolCallFailed: '工具调用失败',
    serverNotFound: '服务器未找到',
  },
  hooks: {
    installed: '钩子已安装',
    installFailed: '安装失败',
    updated: '钩子已更新',
    updateFailed: '更新失败',
    uninstalled: '钩子已卸载',
    uninstallFailed: '卸载失败',
  },
  gmail: {
    setup: 'Gmail 设置',
    setupComplete: 'Gmail 设置完成',
    setupFailed: 'Gmail 设置失败',
    watcherRunning: 'Gmail 观察器运行中',
    watcherStopped: 'Gmail 观察器已停止',
    watcherError: 'Gmail 观察器错误',
    accountRequired: '需要 Gmail 账户',
    topicRequired: '需要 Pub/Sub 主题',
    pushTokenRequired: '需要推送令牌',
  },
  commitments: {
    extracted: '承诺已提取',
    extractionFailed: '提取失败',
    saved: '承诺已保存',
    saveFailed: '保存失败',
    expired: '承诺已过期',
    completed: '承诺已完成',
  },
  trajectory: {
    recorded: '轨迹已记录',
    exportStarted: '导出已开始',
    exportComplete: '导出完成',
    exportFailed: '导出失败',
    cleanupComplete: '清理完成',
  },
};

export default zhCNMessages;
