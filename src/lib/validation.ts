// Client-side validation mirroring server-side validation.ts
import { CLI_ENTITY_TYPES } from '../types/cli.js';
import type { CliPushEntity, CliValidationError } from '../types/cli.js';

const VALID_STATUSES = ['active', 'draft', 'archived', 'disabled'];
const MAX_TITLE_LENGTH = 255;
const MAX_SLUG_LENGTH = 128;
const MAX_CONTENT_LENGTH = 500_000;
const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 64;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

const VALID_COMPONENT_TYPES = [
  'persona', 'soul', 'instructions', 'technique', 'patterns',
  'context', 'guidelines', 'policy', 'checklist', 'output_format',
  'quality_standards', 'examples', 'sql_queries', 'custom',
];

export function validateEntity(entity: CliPushEntity): CliValidationError[] {
  const errors: CliValidationError[] = [];
  const base = { slug: entity.slug || '(missing)', type: entity.type || '(missing)' };

  if (!entity.type || !(CLI_ENTITY_TYPES as readonly string[]).includes(entity.type)) {
    errors.push({ ...base, field: 'type', message: `Invalid entity type. Must be one of: ${CLI_ENTITY_TYPES.join(', ')}` });
  }

  if (!entity.slug?.trim()) {
    errors.push({ ...base, field: 'slug', message: 'Slug is required' });
  } else if (entity.slug.length > MAX_SLUG_LENGTH) {
    errors.push({ ...base, field: 'slug', message: `Slug must be ${MAX_SLUG_LENGTH} characters or fewer` });
  } else if (!SLUG_PATTERN.test(entity.slug)) {
    errors.push({ ...base, field: 'slug', message: 'Slug must be lowercase alphanumeric with hyphens/underscores, starting with a letter or number' });
  }

  if (!entity.title?.trim()) {
    errors.push({ ...base, field: 'title', message: 'Title is required' });
  } else if (entity.title.length > MAX_TITLE_LENGTH) {
    errors.push({ ...base, field: 'title', message: `Title must be ${MAX_TITLE_LENGTH} characters or fewer` });
  }

  if (entity.content && entity.content.length > MAX_CONTENT_LENGTH) {
    errors.push({ ...base, field: 'content', message: `Content must be ${MAX_CONTENT_LENGTH} characters or fewer` });
  }

  if (entity.status && !VALID_STATUSES.includes(entity.status)) {
    errors.push({ ...base, field: 'status', message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  if (entity.tags) {
    if (!Array.isArray(entity.tags)) {
      errors.push({ ...base, field: 'tags', message: 'Tags must be an array of strings' });
    } else if (entity.tags.length > MAX_TAGS) {
      errors.push({ ...base, field: 'tags', message: `Maximum ${MAX_TAGS} tags allowed` });
    } else {
      for (const tag of entity.tags) {
        if (typeof tag !== 'string' || tag.length > MAX_TAG_LENGTH) {
          errors.push({ ...base, field: 'tags', message: `Each tag must be a string of ${MAX_TAG_LENGTH} characters or fewer` });
          break;
        }
      }
    }
  }

  if (entity.components) {
    if (!Array.isArray(entity.components)) {
      errors.push({ ...base, field: 'components', message: 'Components must be an array' });
    } else {
      for (let i = 0; i < entity.components.length; i++) {
        const comp = entity.components[i];
        if (!comp.component_type || !VALID_COMPONENT_TYPES.includes(comp.component_type)) {
          errors.push({ ...base, field: `components[${i}].component_type`, message: `Invalid component_type. Must be one of: ${VALID_COMPONENT_TYPES.join(', ')}` });
        }
        if (!comp.content?.trim()) {
          errors.push({ ...base, field: `components[${i}].content`, message: 'Component content is required' });
        }
      }
    }
  }

  return errors;
}

export function validateEntities(entities: CliPushEntity[]): CliValidationError[] {
  const allErrors: CliValidationError[] = [];

  if (!Array.isArray(entities)) {
    return [{ slug: '(root)', type: '(root)', field: 'entities', message: 'Entities must be an array' }];
  }

  if (entities.length === 0) {
    return [{ slug: '(root)', type: '(root)', field: 'entities', message: 'At least one entity is required' }];
  }

  if (entities.length > 200) {
    return [{ slug: '(root)', type: '(root)', field: 'entities', message: 'Maximum 200 entities per push' }];
  }

  const seen = new Set<string>();
  for (const entity of entities) {
    const key = `${entity.type}:${entity.slug}`;
    if (seen.has(key)) {
      allErrors.push({ slug: entity.slug, type: entity.type, field: 'slug', message: `Duplicate slug "${entity.slug}" for type "${entity.type}"` });
    }
    seen.add(key);
    allErrors.push(...validateEntity(entity));
  }

  return allErrors;
}
