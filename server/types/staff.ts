/**
 * StaffDeck 共享类型定义 — 完整移植自 StaffDeck-main/backend/app/db/models.py
 *
 * 设计原则：
 * 1. 类型名与原 SQLModel 类名一一对应（如 AgentProfile → AgentProfileRow）
 * 2. 后缀 `Row` 表示数据库行结构，`Input` 表示创建输入，`Read` 表示对外输出
 * 3. JSON 字段使用 `Record<string, unknown>` 或 `unknown[]`，由应用层负责具体类型
 * 4. 时间字段统一使用 `number`（Unix 秒）
 * 5. 布尔字段使用 `0 | 1`（SQLite 兼容）— Read 类型可选 `boolean` 转换
 */

// ============================ 通用工具类型 ============================

/** SQLite 行中的 JSON 字段（存储为 TEXT，应用层负责序列化） */
export type JsonField = string;

/** 创建时间戳的输入与读取差异 */
export interface TimestampMixin {
  created_at: number;
  updated_at: number;
}

/** 租户字段 mixin */
export interface TenantMixin {
  tenant_id: string;
}

// ============================ 租户与用户 ============================

export interface TenantRow extends TimestampMixin {
  id: string;
  name: string;
}

export interface UserRow extends TenantMixin, TimestampMixin {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  password_hash: string;
}

export interface UserRead extends Omit<UserRow, 'password_hash'> {
  display_name: string | null;
}

// ============================ Agent Profile ============================

export interface AgentProfileRow extends TenantMixin, TimestampMixin {
  id: string;
  name: string;
  description: string | null;
  persona_prompt: string | null;
  is_overall: 0 | 1;
  status: string;
  metadata_json: JsonField;
}

export interface AgentProfileRead {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  persona_prompt: string | null;
  is_overall: boolean;
  status: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface AgentProfileInput {
  tenant_id?: string;
  name: string;
  description?: string | null;
  persona_prompt?: string | null;
  is_overall?: boolean;
  status?: string;
  metadata?: Record<string, unknown>;
}

// ============================ Agent Usage / Bindings ============================

export interface AgentUsageRow extends TenantMixin, TimestampMixin {
  id: string;
  user_id: string;
  agent_id: string;
  metadata_json: JsonField;
}

export interface AgentModelBindingRow extends TenantMixin, TimestampMixin {
  id: string;
  agent_id: string;
  role: string;
  model_config_id: string;
}

export interface AgentResourceBindingRow extends TenantMixin, TimestampMixin {
  id: string;
  agent_id: string;
  resource_type: string;
  resource_id: string;
  status: string;
  metadata_json: JsonField;
}

// ============================ Skills ============================

export interface SkillRow extends TenantMixin, TimestampMixin {
  id: string;
  skill_id: string;
  version: string;
  name: string;
  business_domain: string | null;
  description: string | null;
  content_json: JsonField;
  status: string;
}

export interface SkillRead {
  id: string;
  tenant_id: string;
  skill_id: string;
  version: string;
  name: string;
  business_domain: string | null;
  description: string | null;
  content: Record<string, unknown>;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface SkillVersionRow extends TenantMixin, TimestampMixin {
  id: string;
  skill_id: string;
  version: string;
  name: string;
  business_domain: string | null;
  description: string | null;
  content_json: JsonField;
  status: string;
}

export interface AgentSkillBranchRow extends TenantMixin, TimestampMixin {
  id: string;
  agent_id: string;
  skill_id: string;
  source_skill_id: string;
  base_version: string;
  head_version: string;
  content_json: JsonField;
  status: string;
  sync_state: string;
  metadata_json: JsonField;
}

export interface AgentSkillBranchVersionRow extends TenantMixin, TimestampMixin {
  id: string;
  agent_id: string;
  skill_id: string;
  source_skill_id: string;
  version: string;
  base_version: string;
  content_json: JsonField;
  status: string;
  sync_state: string;
  change_summary: string | null;
}

export interface GeneralSkillRow extends TenantMixin, TimestampMixin {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  homepage: string | null;
  skill_markdown: string;
  skill_files_json: JsonField;
  metadata_json: JsonField;
  status: string;
  permissions_json: JsonField;
  runtime_config_json: JsonField;
}

export interface GeneralSkillRead {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  description: string | null;
  homepage: string | null;
  skill_markdown: string;
  skill_files: unknown[];
  metadata: Record<string, unknown>;
  status: string;
  permissions: Record<string, unknown>;
  runtime_config: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

// ============================ 知识库 ============================

export interface KnowledgeBaseRow extends TenantMixin, TimestampMixin {
  id: string;
  name: string;
  description: string | null;
  status: string;
  metadata_json: JsonField;
}

export interface KnowledgeBaseRead {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface KnowledgeBaseVersionRow extends TenantMixin, TimestampMixin {
  id: string;
  knowledge_base_id: string;
  version: string;
  name: string;
  description: string | null;
  status: string;
  metadata_json: JsonField;
}

export interface AgentKnowledgeBranchRow extends TenantMixin, TimestampMixin {
  id: string;
  agent_id: string;
  knowledge_base_id: string;
  base_version: string;
  head_version: string;
  status: string;
  sync_state: string;
  metadata_json: JsonField;
}

// ============================ 知识文档与切片 ============================

export interface KnowledgeDocumentRow extends TenantMixin, TimestampMixin {
  id: string;
  knowledge_base_id: string;
  knowledge_base_version_id: string | null;
  filename: string;
  file_type: string;
  title: string | null;
  status: string;
  bucket_count: number;
  chunk_count: number;
  metadata_json: JsonField;
  error: string | null;
}

export interface KnowledgeBucketRow extends TenantMixin, TimestampMixin {
  id: string;
  knowledge_base_id: string;
  document_id: string;
  bucket_id: string;
  knowledge_base_version_id: string | null;
  bucket_key: string;
  title: string;
  summary: string;
  token_estimate: number;
  metadata_json: JsonField;
}

export interface KnowledgeChunkRow extends TenantMixin, TimestampMixin {
  id: string;
  knowledge_base_id: string;
  document_id: string;
  bucket_id: string;
  knowledge_base_version_id: string | null;
  chunk_index: number;
  content: string;
  summary: string | null;
  source_ref: string | null;
  metadata_json: JsonField;
}

export interface KnowledgeConceptRow extends TenantMixin, TimestampMixin {
  id: string;
  knowledge_base_id: string;
  concept_id: string;
  concept_type: string;
  knowledge_base_version_id: string | null;
  document_id: string | null;
  title: string;
  description: string | null;
  content_md: string;
  frontmatter_json: JsonField;
  links_json: JsonField;
  citations_json: JsonField;
  source_refs_json: JsonField;
  status: string;
}

export interface KnowledgeDiscoverySuggestionRow extends TenantMixin, TimestampMixin {
  id: string;
  knowledge_base_id: string;
  document_id: string;
  suggestion_type: string;
  knowledge_base_version_id: string | null;
  bucket_id: string | null;
  title: string;
  status: string;
  payload_json: JsonField;
  source_refs_json: JsonField;
  reason: string | null;
}

export interface KnowledgeIngestJobRow extends TenantMixin, TimestampMixin {
  id: string;
  knowledge_base_id: string;
  knowledge_base_version_id: string | null;
  document_id: string | null;
  filename: string;
  status: string;
  stage: string;
  progress: number;
  error: string | null;
  metadata_json: JsonField;
  started_at: number | null;
  finished_at: number | null;
}

// ============================ 模型配置 ============================

export interface ModelConfigRow extends TenantMixin, TimestampMixin {
  id: string;
  name: string;
  provider: string;
  api_protocol: string;
  base_url: string | null;
  api_key_encrypted: string;
  model: string;
  temperature: number;
  max_output_tokens: number;
  extra_body_json: JsonField;
  protocol_options_json: JsonField;
  legacy_unmapped_options_json: JsonField;
  trust_status: string;
  verified_at: number | null;
  verified_fingerprint: string | null;
  verification_attempt_id: string | null;
  verification_started_at: number | null;
  verification_attempt_status: string;
  verification_attempt_error_code: string | null;
  config_revision: number;
  security_revision: number;
  key_revision: number;
  is_default: 0 | 1;
  enabled: 0 | 1;
}

export interface ModelConfigRead {
  id: string;
  tenant_id: string;
  name: string;
  provider: string;
  api_protocol: string;
  base_url: string | null;
  model: string;
  temperature: number;
  max_output_tokens: number;
  extra_body: Record<string, unknown>;
  protocol_options: Record<string, unknown>;
  legacy_unmapped_options: Record<string, unknown>;
  trust_status: string;
  verified_at: number | null;
  verified_fingerprint: string | null;
  verification_attempt_id: string | null;
  verification_started_at: number | null;
  verification_attempt_status: string;
  verification_attempt_error_code: string | null;
  config_revision: number;
  security_revision: number;
  key_revision: number;
  is_default: boolean;
  enabled: boolean;
  created_at: number;
  updated_at: number;
  // 安全字段：不暴露 api_key_encrypted
}

export interface ModelConfigInput {
  tenant_id?: string;
  name: string;
  provider?: string;
  api_protocol?: string;
  base_url?: string | null;
  api_key_encrypted: string;
  model: string;
  temperature?: number;
  max_output_tokens?: number;
  extra_body?: Record<string, unknown>;
  protocol_options?: Record<string, unknown>;
  legacy_unmapped_options?: Record<string, unknown>;
  trust_status?: string;
  enabled?: boolean;
  is_default?: boolean;
}

// ============================ 工具与 MCP 服务器 ============================

export interface ToolRow extends TenantMixin, TimestampMixin {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  bucket: string;
  tool_type: string;
  method: string;
  url: string;
  headers_json: JsonField;
  auth_json: JsonField;
  config_json: JsonField;
  input_schema: JsonField;
  output_schema: JsonField;
  allowed_skills_json: JsonField;
  mcp_server_id: string | null;
  enabled: 0 | 1;
}

export interface ToolRead {
  id: string;
  tenant_id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  bucket: string;
  tool_type: string;
  method: string;
  url: string;
  headers: Record<string, unknown>;
  auth: Record<string, unknown>;
  config: Record<string, unknown>;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  allowed_skills: string[];
  mcp_server_id: string | null;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface McpServerRow extends TenantMixin, TimestampMixin {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  bucket: string;
  transport: string;
  url: string | null;
  headers_json: JsonField;
  command: string | null;
  args_json: JsonField;
  env_json: JsonField;
  cwd: string | null;
  discovered_tools_json: JsonField;
  last_synced_at: number | null;
  enabled: 0 | 1;
}

export interface McpServerRead {
  id: string;
  tenant_id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  bucket: string;
  transport: string;
  url: string | null;
  headers: Record<string, unknown>;
  command: string | null;
  args: string[];
  env: Record<string, unknown>;
  cwd: string | null;
  discovered_tools: unknown[];
  last_synced_at: number | null;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

// ============================ 定时任务 ============================

export interface ScheduledTaskRow extends TenantMixin, TimestampMixin {
  id: string;
  agent_id: string;
  created_by_user_id: string | null;
  title: string;
  prompt: string;
  description: string | null;
  schedule_type: string;
  schedule_json: JsonField;
  timezone: string;
  rrule: string | null;
  status: string;
  concurrency_policy: string;
  misfire_policy: string;
  max_runs: number | null;
  end_at: number | null;
  next_run_at: number | null;
  last_run_at: number | null;
  last_status: string | null;
  run_count: number;
  lease_owner: string | null;
  lease_until: number | null;
  source_session_id: string | null;
  metadata_json: JsonField;
}

export interface ScheduledTaskRead {
  id: string;
  tenant_id: string;
  agent_id: string;
  created_by_user_id: string | null;
  title: string;
  prompt: string;
  description: string | null;
  schedule_type: string;
  schedule: Record<string, unknown>;
  timezone: string;
  rrule: string | null;
  status: string;
  concurrency_policy: string;
  misfire_policy: string;
  max_runs: number | null;
  end_at: number | null;
  next_run_at: number | null;
  last_run_at: number | null;
  last_status: string | null;
  run_count: number;
  lease_owner: string | null;
  lease_until: number | null;
  source_session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ScheduledTaskRunRow extends TenantMixin, TimestampMixin {
  id: string;
  scheduled_task_id: string;
  agent_id: string;
  user_id: string | null;
  session_id: string | null;
  scheduled_for: number;
  status: string;
  started_at: number | null;
  finished_at: number | null;
  result_summary: string | null;
  error: string | null;
  trace_json: JsonField;
}

// ============================ 会话与消息 ============================

export interface ChatSessionRow extends TenantMixin, TimestampMixin {
  id: string;
  user_id: string | null;
  agent_id: string | null;
  title: string | null;
  active_skill_id: string | null;
  active_step_id: string | null;
  slots_json: JsonField;
  skill_stack_json: JsonField;
  pending_tasks_json: JsonField;
  resume_after_answer_json: string | null;
  awaiting_input_json: string | null;
  knowledge_context_json: JsonField;
  context_state_json: JsonField;
  summary: string | null;
  last_agent_question: string | null;
  status: string;
}

export interface ChatSessionRead {
  id: string;
  tenant_id: string;
  user_id: string | null;
  agent_id: string | null;
  title: string | null;
  active_skill_id: string | null;
  active_step_id: string | null;
  slots: Record<string, unknown>;
  skill_stack: unknown[];
  pending_tasks: unknown[];
  resume_after_answer: unknown | null;
  awaiting_input: unknown | null;
  knowledge_context: unknown[];
  context_state: Record<string, unknown>;
  summary: string | null;
  last_agent_question: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  tenant_id: string;
  session_id: string;
  role: string;
  content: string;
  metadata_json: JsonField;
  created_at: number;
}

export interface MessageRead {
  id: string;
  tenant_id: string;
  session_id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: number;
}

export interface HumanHandoffRequestRow extends TenantMixin, TimestampMixin {
  id: string;
  session_id: string;
  agent_id: string;
  requester_user_id: string | null;
  assignee_user_id: string | null;
  trigger_skill_id: string | null;
  trigger_step_id: string | null;
  context_summary: string | null;
  pending_question: string | null;
  status: string;
  human_reply: string | null;
  resume_payload_json: JsonField;
  metadata_json: JsonField;
  answered_at: number | null;
}

export interface MessageFeedbackRow extends TenantMixin, TimestampMixin {
  id: string;
  session_id: string;
  message_id: string;
  user_id: string;
  rating: string;
  analysis_status: string;
  analysis_bucket: string | null;
  analysis_reason: string | null;
  analysis_summary: string | null;
  analysis_confidence: number | null;
  analysis_json: JsonField;
  analyzed_at: number | null;
}

export interface SkillFeedbackRow extends TenantMixin, TimestampMixin {
  id: string;
  skill_id: string;
  session_id: string;
  message_id: string;
  user_id: string;
  skill_version: string | null;
  step_id: string | null;
  rating: string;
}

// ============================ 记忆与事件 ============================

export interface MemoryRecordRow extends TenantMixin, TimestampMixin {
  id: string;
  user_id: string;
  username: string | null;
  session_id: string | null;
  kind: string;
  content: string;
  importance: number;
  metadata_json: JsonField;
}

export interface MemoryRecordRead {
  id: string;
  tenant_id: string;
  user_id: string;
  username: string | null;
  session_id: string | null;
  kind: string;
  content: string;
  importance: number;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface AgentEventRow {
  id: string;
  tenant_id: string;
  session_id: string;
  event_type: string;
  payload_json: JsonField;
  created_at: number;
}

export interface AgentEventRead {
  id: string;
  tenant_id: string;
  session_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: number;
}

// ============================ 配置 ============================

export interface PersonaConfigRow {
  tenant_id: string;
  system_prompt: string;
  created_at: number;
  updated_at: number;
}

export interface PersonaConfigRead {
  tenant_id: string;
  system_prompt: string;
  created_at: number;
  updated_at: number;
}

export interface UiConfigRow {
  tenant_id: string;
  show_thinking_trace: 0 | 1;
  show_skill_trace: 0 | 1;
  show_tool_trace: 0 | 1;
  reflection_max_rounds: number;
  agent_loop_max_actions: number;
  created_at: number;
  updated_at: number;
}

export interface UiConfigRead {
  tenant_id: string;
  show_thinking_trace: boolean;
  show_skill_trace: boolean;
  show_tool_trace: boolean;
  reflection_max_rounds: number;
  agent_loop_max_actions: number;
  created_at: number;
  updated_at: number;
}

// ============================ Mock Orders ============================

export interface MockOrderRow extends TimestampMixin {
  order_id: string;
  user_id: string | null;
  product_id: string | null;
  sku_id: string | null;
  quantity: number;
  status: string;
  payment_status: string | null;
  order_status: string | null;
  signed_days: number;
  refundable: 0 | 1;
  total_amount: number;
  currency: string;
  metadata_json: JsonField;
}

// ============================ API 通用响应类型 ============================

/** StaffDeck API 统一响应格式 — 与 cross-wms 现有格式一致 */
export interface StaffApiResponse<T> {
  code: number;
  data: T | null;
  message: string;
}

/** 分页响应 */
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================ SSE 流事件类型 ============================

export type StaffStreamEventType =
  | 'session.created'
  | 'session.restored'
  | 'thinking.delta'
  | 'thinking.end'
  | 'text.delta'
  | 'text.end'
  | 'skill.start'
  | 'skill.step'
  | 'skill.end'
  | 'tool.call'
  | 'tool.result'
  | 'reflection.start'
  | 'reflection.delta'
  | 'reflection.end'
  | 'handoff.requested'
  | 'awaiting_input'
  | 'message.saved'
  | 'done'
  | 'error';

export interface StaffStreamEvent {
  type: StaffStreamEventType;
  data: Record<string, unknown>;
}

// ============================ 鉴权与上下文类型 ============================

/** 请求上下文 — 通过 res.locals 注入 */
export interface StaffRequestContext {
  tenantId: string;
  userId: string;
  username: string;
  role: 'admin' | 'member';
}

/** 鉴权响应 — /api/auth/me */
export interface AuthMeResponse {
  id: string;
  tenant_id: string;
  username: string;
  display_name: string | null;
  role: string;
}

/** 鉴权登录响应 — /api/auth/login */
export interface AuthLoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: AuthMeResponse;
}
