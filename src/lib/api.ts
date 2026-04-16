import { getAuthToken, getApiEndpoint, getWorkspaceId } from './config.js';
import type {
  CliPullRequest,
  CliPullResponse,
  CliPushRequest,
  CliPushResult,
  CliValidateRequest,
  CliValidationResult,
  CliDiffResponse,
  CliBulkUploadRequest,
  CliBulkUploadResult,
} from '../types/cli.js';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated. Run: starmynd auth login');
  }

  const endpoint = getApiEndpoint();
  const url = `${endpoint}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-StarMynd-CLI': 'true',
  };

  const workspaceId = getWorkspaceId();
  if (workspaceId) {
    headers['X-Workspace-ID'] = workspaceId;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new ApiError(res.status, `API ${method} ${path} failed (${res.status}): ${text}`);
  }

  const json = await res.json() as Record<string, unknown>;
  // API wraps responses in { data: ... } envelope
  return (json.data ?? json) as T;
}

// ---------------------------------------------------------------------------
// CLI API
// ---------------------------------------------------------------------------

export async function pull(req: CliPullRequest = {}): Promise<CliPullResponse> {
  return request<CliPullResponse>('POST', '/api/cli/pull', req);
}

export async function push(req: CliPushRequest): Promise<CliPushResult> {
  return request<CliPushResult>('POST', '/api/cli/push', req);
}

export async function validate(req: CliValidateRequest): Promise<CliValidationResult> {
  return request<CliValidationResult>('POST', '/api/cli/validate', req);
}

export async function diff(): Promise<CliDiffResponse> {
  return request<CliDiffResponse>('GET', '/api/cli/diff');
}

export async function kbUpload(req: CliBulkUploadRequest): Promise<CliBulkUploadResult> {
  return request<CliBulkUploadResult>('POST', '/api/knowledge/upload', req);
}

export async function kbExport(
  namespaceId: string,
): Promise<ArrayBuffer> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated. Run: starmynd auth login');

  const endpoint = getApiEndpoint();
  const url = `${endpoint}/api/knowledge/export?namespace_id=${encodeURIComponent(namespaceId)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-StarMynd-CLI': 'true',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new ApiError(res.status, `KB export failed (${res.status}): ${text}`);
  }

  return res.arrayBuffer();
}

export async function kbRenderComponent(
  html: string,
  tokens: Record<string, string>,
): Promise<string> {
  const result = await request<{ html: string }>('POST', '/api/knowledge/render-component', {
    html,
    tokens,
  });
  return result.html;
}
