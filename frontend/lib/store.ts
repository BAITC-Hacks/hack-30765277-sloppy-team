import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Task, Application, seedTasks } from './domain';
type Store={tasks:Task[];applications:Application[]};
const file=path.join(process.cwd(),'.data','store.json');
let queue:Promise<unknown>=Promise.resolve();
async function read():Promise<Store>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;return {tasks:seedTasks(),applications:[]};}}
export async function getStore(){await queue;return read();}
export function updateStore<T>(fn:(store:Store)=>T):Promise<T>{const job=queue.then(async()=>{const store=await read();const result=fn(store);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(store,null,2));await fs.rename(file+'.tmp',file);return result;});queue=job.catch(()=>{});return job;}
