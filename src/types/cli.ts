// ---------------------------------------------------------------------------
// CLI Types -- mirrors server-side types from starmynd-app/src/types/cli.ts
// ---------------------------------------------------------------------------

export const CLI_ENTITY_TYPES = ['agent', 'workflow', 'skill', 'rule', 'knowledge'] as const;
export type CliEntityType = (typeof CLI_ENTITY_TYPES)[number];

// Pull
export interface CliPullRequest {
  only?: CliEntityType[];
  include_archived?: boolean;
}

export interface CliPullResponse {
  workspace_id: string;
  workspace_slug: string;
  pulled_at: string;
  entities: CliEntitySnapshot[];
  namespaces: CliNamespaceSnapshot[];
  governance: CliGovernanceSnapshot;
}

export interface CliEntitySnapshot {
  id: string;
  type: CliEntityType;
  slug: string;
  title: string;
  description: string | null;
  content: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  status: string;
  components: CliComponentSnapshot[];
  updated_at: string;
}

export interface CliComponentSnapshot {
  id: string;
  component_type: string;
  title: string | null;
  content: string;
  sort_order: number;
  include_in_prompt: boolean;
}

export interface CliNamespaceSnapshot {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string;
  default_render_mode: string;
  node_count: number;
}

export interface CliGovernanceSnapshot {
  budget_configs: Record<string, unknown>[];
  model_roles: Record<string, unknown>[];
  model_role_assignments: Record<string, unknown>[];
}

// Push
export interface CliPushRequest {
  entities: CliPushEntity[];
}

export interface CliPushEntity {
  type: CliEntityType;
  slug: string;
  title: string;
  description?: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  status?: string;
  components?: CliPushComponent[];
}

export interface CliPushComponent {
  component_type: string;
  title?: string;
  content: string;
  sort_order?: number;
  include_in_prompt?: boolean;
}

export interface CliPushResult {
  created: number;
  updated: number;
  errors: CliPushError[];
}

export interface CliPushError {
  slug: string;
  type: string;
  message: string;
}

// Validate
export interface CliValidateRequest {
  entities: CliPushEntity[];
}

export interface CliValidationResult {
  valid: boolean;
  errors: CliValidationError[];
}

export interface CliValidationError {
  slug: string;
  type: string;
  field: string;
  message: string;
}

// Diff
export interface CliDiffEntry {
  id: string;
  type: string;
  slug: string;
  hash: string;
  updated_at: string;
}

export interface CliDiffResponse {
  workspace_id: string;
  entries: CliDiffEntry[];
  generated_at: string;
}

// Knowledge Upload
export interface CliBulkUploadNode {
  title: string;
  content: string;
  node_type: string;
  namespace_id?: string;
  tags?: string[];
  domain?: string;
  html_content?: string;
  component_type?: string;
  render_mode?: string;
  source_type?: string;
  source_url?: string;
  confidence?: number;
}

export interface CliBulkUploadRequest {
  nodes: CliBulkUploadNode[];
  namespace_id?: string;
}

export interface CliBulkUploadResult {
  created: number;
  errors: Array<{ index: number; title: string; message: string }>;
}

// Config
export interface StarMyndConfig {
  workspace_id: string;
  workspace_slug: string;
  api_endpoint: string;
  last_pull?: string;
  pull_version?: number;
}

// Credentials
export interface Credentials {
  api_key?: string;
  oauth_token?: string;
  token_expires?: string;
  workspace_id: string;
  workspace_slug: string;
  email?: string;
}
