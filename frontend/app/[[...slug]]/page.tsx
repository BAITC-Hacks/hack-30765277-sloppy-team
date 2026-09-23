import {notFound} from 'next/navigation';
import {getStore} from '@/lib/store';
import Workspace from '@/components/workspace';
export default async function Page({params}:{params:Promise<{slug?:string[]}>}){const slug=(await params).slug??[];const path='/'+slug.join('/');if(slug.length===0||['/catalog','/create-task','/my-tasks'].includes(path))return <Workspace/>;const match=path.match(/^\/(?:tasks\/([^/]+)|my-tasks\/([^/]+)\/apps)$/);if(!match)notFound();const db=await getStore();if(!db.tasks.some(t=>t.id===(match[1]??match[2])))notFound();return <Workspace/>;}
