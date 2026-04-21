// File parsing utilities: YAML frontmatter, HTML with YAML comments, etc.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import type { CliPushEntity, CliEntityType, CliBulkUploadNode } from '../types/cli.js';

// ---------------------------------------------------------------------------
// YAML entity file parsing
// ---------------------------------------------------------------------------

interface ParsedYamlEntity {
  type: CliEntityType;
  slug: string;
  title: string;
  description?: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  status?: string;
  components?: Array<{
    component_type: string;
    title?: string;
    content: string;
    sort_order?: number;
    include_in_prompt?: boolean;
  }>;
}

export function parseEntityFile(filePath: string): CliPushEntity {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    // Handle YAML files with frontmatter separators (---\n...\n---\n...)
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const yamlContent = fmMatch ? fmMatch[1] : raw;
    const bodyContent = fmMatch ? fmMatch[2].trim() : undefined;

    const parsed = yaml.load(yamlContent) as ParsedYamlEntity;
    return {
      type: parsed.type,
      slug: parsed.slug,
      title: parsed.title,
      description: parsed.description,
      content: bodyContent || parsed.content,
      tags: parsed.tags,
      metadata: parsed.metadata,
      status: parsed.status,
      components: parsed.components,
    };
  }

  // Markdown with YAML frontmatter
  if (ext === '.md') {
    return parseMarkdownEntity(raw, filePath);
  }

  throw new Error(`Unsupported file format: ${ext}. Use .yaml, .yml, or .md`);
}

function parseMarkdownEntity(raw: string, filePath: string): CliPushEntity {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error(`No YAML frontmatter found in ${filePath}`);
  }

  const frontmatter = yaml.load(fmMatch[1]) as Record<string, unknown>;
  const body = fmMatch[2].trim();

  return {
    type: (frontmatter.type as CliEntityType) || 'knowledge',
    slug: (frontmatter.slug as string) || path.basename(filePath, path.extname(filePath)),
    title: (frontmatter.title as string) || path.basename(filePath, path.extname(filePath)),
    description: frontmatter.description as string | undefined,
    content: body,
    tags: frontmatter.tags as string[] | undefined,
    metadata: frontmatter.metadata as Record<string, unknown> | undefined,
    status: (frontmatter.status as string) || 'active',
  };
}

// ---------------------------------------------------------------------------
// KB node file parsing
// ---------------------------------------------------------------------------

export function parseKbFile(filePath: string, namespaceId?: string): CliBulkUploadNode {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath, ext);

  if (ext === '.html' || ext === '.htm') {
    // HTML files: check for YAML comment at top
    const yamlMatch = raw.match(/^<!--\n([\s\S]*?)\n-->\n([\s\S]*)$/);
    const meta = yamlMatch ? (yaml.load(yamlMatch[1]) as Record<string, unknown>) : {};
    const htmlContent = yamlMatch ? yamlMatch[2].trim() : raw;

    return {
      title: (meta.title as string) || basename,
      content: (meta.description as string) || basename,
      node_type: 'visual',
      namespace_id: namespaceId,
      tags: meta.tags as string[] | undefined,
      domain: meta.domain as string | undefined,
      html_content: htmlContent,
      component_type: (meta.component_type as string) || 'custom',
      render_mode: 'visual',
      source_type: 'cli_upload',
    };
  }

  if (ext === '.md') {
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const meta = fmMatch ? (yaml.load(fmMatch[1]) as Record<string, unknown>) : {};
    const body = fmMatch ? fmMatch[2].trim() : raw;

    return {
      title: (meta.title as string) || basename,
      content: body,
      node_type: (meta.node_type as string) || 'text',
      namespace_id: namespaceId,
      tags: meta.tags as string[] | undefined,
      domain: meta.domain as string | undefined,
      render_mode: 'text',
      source_type: 'cli_upload',
    };
  }

  // Fallback: treat as plain text
  return {
    title: basename,
    content: raw,
    node_type: 'text',
    namespace_id: namespaceId,
    render_mode: 'text',
    source_type: 'cli_upload',
  };
}

// ---------------------------------------------------------------------------
// Directory scanning
// ---------------------------------------------------------------------------

// Collection-scope files that are generated or structural, not entities.
// Matched against the path relative to the scan root.
// Fixes SC-028 Gate 5: fresh `starmynd init` + `validate .starmynd/` produced
// 12 errors on these files because the scanner treated every yaml/md as a
// candidate entity.
export const COLLECTION_SKIP_PATHS: ReadonlySet<string> = new Set([
  'GUIDE.md',
  'config.yaml',
  'governance/config.yaml',
  'namespaces/_index.yaml',
]);

export function scanDirectory(dir: string, extensions?: string[]): string[] {
  const results: string[] = [];
  const exts = extensions || ['.yaml', '.yml', '.md', '.html', '.htm'];

  function walk(d: string) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) walk(fullPath);
      } else if (exts.includes(path.extname(entry.name).toLowerCase())) {
        const rel = path.relative(dir, fullPath).split(path.sep).join('/');
        if (COLLECTION_SKIP_PATHS.has(rel)) continue;
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results.sort();
}

// ---------------------------------------------------------------------------
// Hashing for diff
// ---------------------------------------------------------------------------

export function hashFileContent(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function hashString(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Matches the server-side hashEntity in /api/cli/diff/route.ts exactly:
// JSON.stringify the same fields in the same order, sha256, first 16 hex chars.
export function hashEntity(entity: CliPushEntity): string {
  const payload = JSON.stringify({
    type: entity.type,
    slug: entity.slug,
    title: entity.title,
    description: entity.description,
    content: entity.content,
    tags: entity.tags,
    metadata: entity.metadata,
    status: entity.status,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
