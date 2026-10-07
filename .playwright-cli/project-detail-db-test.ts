import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db/pool.js';
import { buildProjectDetail } from '../src/pipeline/projectDetails.js';
import { buildBusinessBoard } from '../src/pipeline/businessBoard.js';
const client = await pool.connect();
const original = pool.query.bind(pool);
const a = randomUUID(), b = randomUUID();
try {
  await client.query('BEGIN');
  pool.query = client.query.bind(client) as typeof pool.query;
  await client.query(`INSERT INTO projects(id,title,meta) VALUES($1,'Project A',$3::jsonb),($2,'Project B','{}'::jsonb)`, [a,b,JSON.stringify({objective:'Unique A',intakeToken:'DO_NOT_EXPOSE'})]);
  await client.query(`INSERT INTO invoices(id,project_id,amount) VALUES($1,$2,111),($3,$4,222)`, [randomUUID(),a,randomUUID(),b]);
  await client.query(`INSERT INTO jobs(id,type,payload,status) VALUES($1,'qa.run',$2::jsonb,'running'),($3,'scribe.docs',$4::jsonb,'done')`, [randomUUID(),JSON.stringify({projectId:a}),randomUUID(),JSON.stringify({projectId:b})]);
  await client.query(`INSERT INTO events(type,entity_id,payload) VALUES('prd.ready',$1,$3::jsonb),('docs.ready',$2,'{}')`, [a,b,JSON.stringify({intakeToken:'DO_NOT_EXPOSE'})]);
  const detailA = await buildProjectDetail(a), detailB = await buildProjectDetail(b);
  assert.equal(detailA?.invoices.length,1);
  assert.equal(detailA?.invoices[0]?.amount,111);
  assert.equal(detailB?.invoices[0]?.amount,222);
  assert.deepEqual(detailA?.jobs.map(j=>j.type),['qa.run']);
  assert.deepEqual(detailA?.events.map(e=>e.type),['prd.ready']);
  assert.equal(detailA?.context.objective,'Unique A');
  assert(!JSON.stringify(detailA).includes('DO_NOT_EXPOSE'));
  assert.equal(await buildProjectDetail('missing-project'),null);
  const board = await buildBusinessBoard();
  assert(board.records.some(r=>r.projectId===a));
  console.log('PASS: real database project detail isolates invoices, jobs, events, context; board SQL valid. All test rows rolled back.');
} finally {
  pool.query = original;
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
