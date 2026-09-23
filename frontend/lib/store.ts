import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Task, Application, seedTasks,emptyCard,scoreCard,taskStatus } from './domain';
import {User} from './auth';
type Store={tasks:Task[];applications:Application[];users:User[]};
const file=path.join(process.cwd(),'.data','store.json');
let queue:Promise<unknown>=Promise.resolve();
async function read():Promise<Store>{try{const data=JSON.parse(await fs.readFile(file,'utf8')) as Store;return {...data,users:data.users??[],tasks:data.tasks.map(task=>{const card_data={...emptyCard,...task.card_data};const score=scoreCard(card_data);return {...task,card_data,score,status:taskStatus(score)};})};}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;return {tasks:seedTasks(),applications:[],users:[]};}}
export async function getStore(){await queue;return read();}
export function updateStore<T>(fn:(store:Store)=>T):Promise<T>{const job=queue.then(async()=>{const store=await read();const result=fn(store);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(store,null,2));await fs.rename(file+'.tmp',file);return result;});queue=job.catch(()=>{});return job;}
