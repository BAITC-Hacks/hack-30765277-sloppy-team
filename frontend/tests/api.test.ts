import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {NextRequest} from 'next/server';
import {emptyCard} from '../lib/domain';

test('AI contract, sessions, ownership and closed applications',async()=>{
 const original=process.cwd();const directory=await mkdtemp(path.join(original,'.test-data-'));
 const oldSecret=process.env.SESSION_SECRET;process.env.SESSION_SECRET='test-secret-at-least-thirty-two-characters';process.chdir(directory);
 const oldFetch=global.fetch;const aiCalls:unknown[]=[];
 global.fetch=(async(_url:RequestInfo|URL,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));aiCalls.push(body);if(String(_url).endsWith('/clarify'))return Response.json({questions:['Q1','Q2','Q3']});return Response.json({card:{title:'Generated',context:'A long business context describing the task',data_materials:null,expected_result:null,success_criteria:null,constraints:null,target_audience:null,contacts:null,interaction_format:null},scoring:{score:20,status:'DRAFT',breakdown:{},missing_fields:[]}})}) as typeof fetch;
 try{
  const {GET,POST,PATCH}=await import('../app/api/[...path]/route');
  const req=(url:string,method:string,body?:unknown,cookie?:string)=>new NextRequest('http://localhost'+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const clarified=await POST(req('/api/ai/clarify','POST',{draft_text:'A detailed business problem text'}));assert.deepEqual((await clarified.json()).questions,['Q1','Q2','Q3']);
  const built=await POST(req('/api/ai/build-card','POST',{draft_text:'A detailed business problem text',qa_pairs:[{question:'Q1',answer:'A1'},{question:'Q2',answer:'A2'},{question:'Q3',answer:'A3'}]}));assert.equal((await built.json()).card_data.context,'A long business context describing the task');assert.equal((aiCalls[1] as {qa_pairs:unknown[]}).qa_pairs.length,3);
  const card={...emptyCard,title:'Integration task',context:'A useful business problem with enough detail'};
  assert.equal((await POST(req('/api/tasks','POST',{card_data:card}))).status,401);
  const owner=await POST(req('/api/auth/register','POST',{email:'owner@example.com',password:'a-long-password-123'}));assert.equal(owner.status,201);const ownerCookie=owner.headers.get('set-cookie')!.split(';')[0];
  const other=await POST(req('/api/auth/register','POST',{email:'other@example.com',password:'a-long-password-123'}));assert.equal(other.status,201);const otherCookie=other.headers.get('set-cookie')!.split(';')[0];
  const published=await POST(req('/api/tasks','POST',{card_data:card},ownerCookie));assert.equal(published.status,201);const task=await published.json();
  assert.equal((await GET(req('/api/tasks/'+task.id+'/applications','GET',undefined,otherCookie))).status,403);
  assert.equal((await POST(req('/api/applications','POST',{task_id:task.id,team_name:'Own',idea:'Idea',plan:'Plan'},ownerCookie))).status,400);
  const applied=await POST(req('/api/applications','POST',{task_id:task.id,team_name:'Other',idea:'Idea',plan:'Plan'},otherCookie));assert.equal(applied.status,201);const application=await applied.json();
  assert.equal((await PATCH(req('/api/applications/'+application.id+'/status','PATCH',{status:'ACCEPTED'},otherCookie))).status,409);
  assert.equal((await PATCH(req('/api/applications/'+application.id+'/status','PATCH',{status:'ACCEPTED'},ownerCookie))).status,200);
  const detail=await (await GET(req('/api/tasks/'+task.id,'GET'))).json();assert.equal(detail.applications_open,false);
  assert.equal((await POST(req('/api/applications','POST',{task_id:task.id,team_name:'Late',idea:'Idea',plan:'Plan'},otherCookie))).status,400);
 }finally{global.fetch=oldFetch;process.chdir(original);if(oldSecret===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=oldSecret;await rm(directory,{recursive:true,force:true});}
});
