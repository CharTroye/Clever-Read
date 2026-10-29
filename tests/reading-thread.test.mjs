import test from 'node:test';
import assert from 'node:assert/strict';
import { sameTarget, conversationTurns, conversationHistory } from '../public/reading-thread.mjs';

const selected = { text: 'attention', blockId: 'p1', page: 1 };
const make = (id, parentId = null, overrides = {}) => ({ id, parentId, docId: 'doc', selected, question: '问题 ' + id, result: { mode: 'model', summary: '回答 ' + id }, ...overrides });

test('follow-ups restore their own lineage and regeneration branches from the previous parent', () => {
  const records = [make('1'), make('2', '1'), make('3', '2'), make('4', '3'), make('regenerated', '2')];
  assert.deepEqual(conversationTurns(records[3], records).map(r => r.id), ['1', '2', '3', '4']);
  assert.deepEqual(conversationHistory(records[3], records).filter(m => m.role === 'user').map(m => m.content), ['问题 2', '问题 3', '问题 4']);
  assert.deepEqual(conversationTurns(records[4], records).map(r => r.id), ['1', '2', 'regenerated']);
});

test('targets on other pages, documents and image regions cannot leak into a conversation', () => {
  assert.equal(sameTarget(selected, { ...selected, endBlockId: 'p1' }), true);
  for (const other of [{ ...selected, page: 2 }, { ...selected, endBlockId: 'p2' }, { ...selected, includeImage: true }]) assert.equal(sameTarget(selected, other), false);
  const region = { ...selected, region: { x: 0, y: 0, w: .2, h: .3 } };
  assert.equal(sameTarget(region, { ...region, region: { ...region.region, w: .4 } }), false);
  const a = make('a'), b = make('b', 'a', { docId: 'other' });
  assert.deepEqual(conversationTurns(b, [a, b]).map(r => r.id), ['b']);
});

test('older records, missing parents, local dictionary results and cyclic data are safe', () => {
  const old = make('old'); delete old.parentId;
  assert.equal(conversationTurns(old, [old]).length, 1);
  const a = make('a', 'b'), b = make('b', 'a');
  assert.equal(conversationTurns(a, [a, b]).length, 2);
  const orphan = make('orphan', 'deleted');
  assert.equal(conversationTurns(orphan, [orphan]).length, 1);
  const local = make('local', null, { result: { mode: 'local', summary: '词典定义' } });
  const followup = make('ask', 'local');
  assert.equal(conversationHistory(followup, [local, followup]).length, 2);
});
