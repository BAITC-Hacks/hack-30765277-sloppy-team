import {createHmac,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
export type User={id:string;email:string;password_hash:string};
const cookieName='praktika_session';
function secret(){const value=process.env.SESSION_SECRET;if(!value||value.length<32)throw Error('SESSION_SECRET должен содержать не менее 32 символов');return value;}
export function validateSessionConfig(){secret();}
export function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
export function verifyPassword(password:string,stored:string){const [salt,hash]=stored.split(':');if(!salt||!hash)return false;const expected=Buffer.from(hash,'hex');const actual=scryptSync(password,salt,expected.length);return timingSafeEqual(expected,actual);}
function sign(payload:string){return createHmac('sha256',secret()).update(payload).digest('hex');}
export function setSession(response:NextResponse,userId:string){const payload=Buffer.from(JSON.stringify({userId,expires:Date.now()+7*86400000})).toString('base64url');response.cookies.set(cookieName,`${payload}.${sign(payload)}`,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:7*86400});}
export function clearSession(response:NextResponse){response.cookies.delete(cookieName);}
export function sessionUserId(request:NextRequest){try{const token=request.cookies.get(cookieName)?.value;if(!token)return null;const parts=token.split('.');if(parts.length!==2)return null;const [payload,signature]=parts;if(!payload||!signature||!/^[a-f0-9]{64}$/.test(signature))return null;const expected=Buffer.from(sign(payload),'hex');const received=Buffer.from(signature,'hex');if(received.length!==expected.length||!timingSafeEqual(received,expected))return null;const data=JSON.parse(Buffer.from(payload,'base64url').toString());return typeof data.userId==='string'&&typeof data.expires==='number'&&data.expires>Date.now()?data.userId:null;}catch{return null;}}
