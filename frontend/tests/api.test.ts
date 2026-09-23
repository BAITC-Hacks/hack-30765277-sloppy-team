import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {NextRequest} from 'next/server';
import {emptyCard} from '../lib/domain';
test('publish, apply, select one team, and block later decisions',async()=>{
 const original=process.cwd();
 const directory=await mkdtemp(path.join(original,'.test-data-'));
 process.chdir(directory);
 try{
  const {GET,POST,PATCH}=await import('../app/api/[...path]/route');
  const req=(url:string,method:string,body?:unknown)=>new NextRequest('http://localhost'+url,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const clarify=await POST(req('/api/ai/clarify','POST',{draft_text:'Нужен удобный сервис для записи на занятия'}));
  assert.equal((await clarify.json()).questions.length,3);
  const built=await POST(req('/api/ai/build-card','POST',{draft:'Нужен сервис',answers:['Рабочий прототип','Таблицы','Четыре недели']}));
  assert.equal((await built.json()).card_data.criteria,'Рабочий прототип');
  const published=await POST(req('/api/tasks','POST',{card_data:{...emptyCard,title:'Integration task',context:'A useful business problem'}}));
  assert.equal(published.status,201);
  const task=await published.json();
  assert.equal(task.score,30);
  const ids:string[]=[];
  for(const team_name of ['Team One','Team Two']){
   const response=await POST(req('/api/applications','POST',{task_id:task.id,team_name,idea:'Prototype',plan:'Research and build'}));
   assert.equal(response.status,201);ids.push((await response.json()).id);
  }
  assert.equal((await PATCH(req('/api/applications/'+ids[0]+'/status','PATCH',{status:'ACCEPTED'}))).status,200);
  assert.equal((await PATCH(req('/api/applications/'+ids[1]+'/status','PATCH',{status:'ACCEPTED'}))).status,409);
  assert.equal((await POST(req('/api/applications','POST',{task_id:task.id,team_name:'Late team',idea:'Idea',plan:'Plan'}))).status,400);
  const apps=await (await GET(req('/api/tasks/'+task.id+'/applications','GET'))).json();
  assert.equal(apps.filter((a:{status:string})=>a.status==='ACCEPTED').length,1);
  assert.equal((await POST(req('/api/applications','POST',{task_id:task.id,team_name:'Bad link',idea:'Idea',plan:'Plan',prototype:'javascript:alert(1)'}))).status,400);
 }finally{process.chdir(original);await rm(directory,{recursive:true,force:true});}
});
