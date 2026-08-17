import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export const dynamic="force-dynamic";
interface UpdateProfileBody{email?:string;password?:string;data?:Record<string,unknown>}
function buildMetadata(a:string|null,n:string|null){return{...(a?{avatar_url:a,user_avatar:a}:{}),...(n?{name:n}:{})}}
async function getGeminiSettings(id:string){const r=await prisma.$queryRaw<any[]>`SELECT "geminiApiKey","geminiModel","updatedAt" FROM "UserSettings" WHERE "userId"=${id} LIMIT 1`;return r[0]??null}
async function upsertGeminiSettings(id:string,g:any){if(!Object.keys(g).length)return;const e=await getGeminiSettings(id);await prisma.$executeRaw`INSERT INTO "UserSettings"("userId","geminiApiKey","geminiModel","updatedAt") VALUES(${id},${g.geminiApiKey??e?.geminiApiKey??null},${g.geminiModel??e?.geminiModel??null},NOW()) ON CONFLICT("userId") DO UPDATE SET "geminiApiKey"=EXCLUDED."geminiApiKey","geminiModel"=EXCLUDED."geminiModel","updatedAt"=NOW()`}
export async function PATCH(req:Request){const s=await auth();const id=s?.user?.id;if(!id)return NextResponse.json({error:"Unauthorized"},{status:401});const b=await req.json() as UpdateProfileBody;const d:any={};const g:any={};if(b.email)d.email=b.email;if(b.password)d.passwordHash=await hash(b.password,12);if(b.data){if(typeof b.data.gemini_api_key==='string')g.geminiApiKey=b.data.gemini_api_key;if(typeof b.data.gemini_model==='string')g.geminiModel=b.data.gemini_model}const u=await prisma.user.update({where:{id},data:d,select:{id:true,email:true,name:true,avatar:true}});await upsertGeminiSettings(id,g);const x=await getGeminiSettings(id);return NextResponse.json({user:{id:u.id,email:u.email,user_metadata:{...buildMetadata(u.avatar,u.name),...(x?.geminiApiKey?{has_gemini_key:true}:{}),...(x?.geminiModel?{gemini_model:x.geminiModel}:{}),...(x?.updatedAt?{gemini_updated_at:x.updatedAt.toISOString()}: {})}}})}
