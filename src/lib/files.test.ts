import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COLLECTION_SKIP_PATHS, scanDirectory } from './files.js';

describe('COLLECTION_SKIP_PATHS', () => {
  it('includes the four collection-scope paths from SC-028 gate 5', () => {
    assert.ok(COLLECTION_SKIP_PATHS.has('GUIDE.md'));
    assert.ok(COLLECTION_SKIP_PATHS.has('config.yaml'));
    assert.ok(COLLECTION_SKIP_PATHS.has('governance/config.yaml'));
    assert.ok(COLLECTION_SKIP_PATHS.has('namespaces/_index.yaml'));
  });
});

describe('scanDirectory skip behavior', () => {
  let tmp: string;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sc033-scan-'));
    // Collection-scope files (should be skipped)
    fs.writeFileSync(path.join(tmp, 'GUIDE.md'), '# Auto-generated, no frontmatter\n');
    fs.writeFileSync(path.join(tmp, 'config.yaml'), 'workspace_id: ws_1\n');
    fs.mkdirSync(path.join(tmp, 'governance'));
    fs.writeFileSync(path.join(tmp, 'governance', 'config.yaml'), 'model_roles: []\n');
    fs.mkdirSync(path.join(tmp, 'namespaces'));
    fs.writeFileSync(path.join(tmp, 'namespaces', '_index.yaml'), 'namespaces: []\n');

    // Real entity files (should be included)
    fs.mkdirSync(path.join(tmp, 'agents'));
    fs.writeFileSync(
      path.join(tmp, 'agents', 'team-lead.yaml'),
      'type: agent\nslug: team-lead\ntitle: Team Lead\n',
    );
    // An entity file with schema-invalid content at a non-skipped path.
    // Skip logic must NOT mask this; downstream validator still errors.
    fs.writeFileSync(
      path.join(tmp, 'agents', 'broken.yaml'),
      'this_is_not_a_valid_entity: true\n',
    );
    // Legitimate file named GUIDE.md at a NON-root depth is still excluded
    // when its relative path isn't in the skip set. This one is at a path
    // not in the set, so it should be included.
    fs.mkdirSync(path.join(tmp, 'knowledge'));
    fs.writeFileSync(
      path.join(tmp, 'knowledge', 'GUIDE.md'),
      '---\ntype: knowledge\nslug: guide\ntitle: Guide\n---\nBody\n',
    );
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips top-level GUIDE.md', () => {
    const files = scanDirectory(tmp);
    const rels = files.map(f => path.relative(tmp, f).split(path.sep).join('/'));
    assert.ok(!rels.includes('GUIDE.md'), `expected GUIDE.md to be skipped, got: ${rels.join(', ')}`);
  });

  it('skips top-level config.yaml', () => {
    const files = scanDirectory(tmp);
    const rels = files.map(f => path.relative(tmp, f).split(path.sep).join('/'));
    assert.ok(!rels.includes('config.yaml'));
  });

  it('skips governance/config.yaml', () => {
    const files = scanDirectory(tmp);
    const rels = files.map(f => path.relative(tmp, f).split(path.sep).join('/'));
    assert.ok(!rels.includes('governance/config.yaml'));
  });

  it('skips namespaces/_index.yaml', () => {
    const files = scanDirectory(tmp);
    const rels = files.map(f => path.relative(tmp, f).split(path.sep).join('/'));
    assert.ok(!rels.includes('namespaces/_index.yaml'));
  });

  it('includes real entity files at non-skipped paths', () => {
    const files = scanDirectory(tmp);
    const rels = files.map(f => path.relative(tmp, f).split(path.sep).join('/'));
    assert.ok(rels.includes('agents/team-lead.yaml'));
  });

  it('still includes schema-invalid files at non-skipped paths (skip is path-based, not content-based)', () => {
    const files = scanDirectory(tmp);
    const rels = files.map(f => path.relative(tmp, f).split(path.sep).join('/'));
    assert.ok(
      rels.includes('agents/broken.yaml'),
      'schema-invalid files at non-skipped paths must still be scanned so real violations surface downstream',
    );
  });

  it('does not skip same-named files at non-skipped relative paths', () => {
    // knowledge/GUIDE.md is not in the skip set; top-level GUIDE.md match
    // must be anchored to the scan root, not just basename.
    const files = scanDirectory(tmp);
    const rels = files.map(f => path.relative(tmp, f).split(path.sep).join('/'));
    assert.ok(rels.includes('knowledge/GUIDE.md'));
  });
});
