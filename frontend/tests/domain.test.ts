import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyCard,scoreCard,taskStatus,safeUrl,seedTasks} from '../lib/domain';
test('scoring uses optional fields and ignores whitespace',()=>{
 assert.equal(scoreCard(emptyCard),0);
 assert.equal(scoreCard({...emptyCard,title:'Test',context:'Business need'}),30);
 assert.equal(scoreCard({...emptyCard,contacts:'   '}),0);
 assert.equal(scoreCard(Object.fromEntries(Object.keys(emptyCard).map(k=>[k,'filled'])) as typeof emptyCard),100);
});
test('status boundaries',()=>{assert.equal(taskStatus(69),'WORKING');assert.equal(taskStatus(70),'READY');assert.equal(taskStatus(84),'READY');assert.equal(taskStatus(85),'PRIORITY')});
test('external links reject executable schemes',()=>{assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('data:text/html,hello'),null);assert.equal(safeUrl('https://example.com'),'https://example.com/')});
test('seed scores agree with live calculation',()=>{for(const t of seedTasks()){assert.equal(t.score,scoreCard(t.card_data));assert.equal(t.status,taskStatus(t.score))}});
