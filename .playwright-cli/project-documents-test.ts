import assert from 'node:assert/strict';
import { mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { listProjectDocuments, readProjectDocument } from '../src/pipeline/projectDetails.js';
import { env } from '../src/config/env.js';
const id = 'verify-folder-' + Date.now();
const root = resolve(env.PROJECTS_WORKSPACE_DIR, id);
const other = resolve(env.PROJECTS_WORKSPACE_DIR, id + '-other');
assert(root.startsWith(resolve(env.PROJECTS_WORKSPACE_DIR)));
try {
  await mkdir(resolve(root, 'docs'), { recursive: true });
  await mkdir(resolve(root, 'intake'), { recursive: true });
  await mkdir(other, { recursive: true });
  await writeFile(resolve(root, 'PRD.md'), '# Unique project context');
  await writeFile(resolve(root, 'docs', 'SOP.md'), 'Project SOP');
  await writeFile(resolve(root, 'intake', 'token.json'), 'SECRET');
  await writeFile(resolve(other, 'PRD.md'), 'Other context');
  await writeFile(resolve(root, 'docs', 'large.txt'), 'x'.repeat(524289));
  await symlink(other, resolve(root, 'legal'), 'junction');
  const project = { id, workspace: root };
  assert.deepEqual((await listProjectDocuments(project)).map(f => f.path).sort(), ['PRD.md', 'docs/SOP.md', 'docs/large.txt']);
  assert.equal((await readProjectDocument(project, 'PRD.md'))?.content, '# Unique project context');
  assert.equal(await readProjectDocument(project, '../' + id + '-other/PRD.md'), null);
  assert.equal(await readProjectDocument(project, 'intake/token.json'), null);
  assert.equal(await readProjectDocument(project, 'legal/PRD.md'), null);
  assert.equal(await readProjectDocument({ id, workspace: other }, 'PRD.md'), null);
  assert.equal((await readProjectDocument(project, 'docs/large.txt'))?.tooLarge, true);
  console.log('PASS: project documents scoped; traversal, secrets, symlink and oversize guarded');
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(other, { recursive: true, force: true });
}
