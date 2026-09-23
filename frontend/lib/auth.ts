import {createHmac,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export type User={id:string;email:string;password_hash:string};
const cookieName='praktika_session';
function secret(){const value=process.env.SESSION_SECRET;if(!value||value.length<32)throw Error('SESSION_SECRET должен содержать не менее 32 символов');return value;}
export function validateSessionConfig(){secret();}
export async function hashPassword(password:string){
 const salt=randomBytes(16).toString('hex');
 const hash=await derive(password,salt,64) as Buffer;
 return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password:string,stored:string){
 const valid=/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored);
 const [salt,hash]=valid?stored.split(':'):['0'.repeat(32),'0'.repeat(128)];
 const actual=await derive(password,salt,64) as Buffer;
 return timingSafeEqual(Buffer.from(hash,'hex'),actual)&&valid;
}
function sign(payload:string){return createHmac('sha256',secret()).update(payload).digest('hex');}
export function setSession(response:NextResponse,userId:string){const payload=Buffer.from(JSON.stringify({userId,expires:Date.now()+7*86400000})).toString('base64url');response.cookies.set(cookieName,`${payload}.${sign(payload)}`,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:7*86400});}
export function clearSession(response:NextResponse){response.cookies.delete(cookieName);}
export function sessionUserId(request:NextRequest){try{const token=request.cookies.get(cookieName)?.value;if(!token)return null;const parts=token.split('.');if(parts.length!==2)return null;const [payload,signature]=parts;if(!payload||!signature||!/^[a-f0-9]{64}$/.test(signature))return null;const expected=Buffer.from(sign(payload),'hex');const received=Buffer.from(signature,'hex');if(received.length!==expected.length||!timingSafeEqual(received,expected))return null;const data=JSON.parse(Buffer.from(payload,'base64url').toString());return typeof data.userId==='string'&&typeof data.expires==='number'&&data.expires>Date.now()?data.userId:null;}catch{return null;}}
