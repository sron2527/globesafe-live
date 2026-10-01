const ORIGINS = new Set((process.env.ALLOWED_ORIGINS || "https://sron2527.github.io").split(",").map(s=>s.trim()).filter(Boolean));

function cors(req,res){
  const o=req.headers.origin;
  if(o && ORIGINS.has(o)){res.setHeader("Access-Control-Allow-Origin",o);res.setHeader("Vary","Origin");}
  res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
}
function clean(v,max=160){return String(v??"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,max)}
function norm(v=""){return clean(v,5000).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}+#. ]/gu," ").replace(/\s+/g," ").trim()}
function strip(v=""){return String(v).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim()}
function profileOf(b={}){
  const skills=Array.isArray(b.skills)?[...new Set(b.skills.map(x=>clean(x,60)).filter(Boolean))].slice(0,20):[];
  return {skills,experience:Math.max(0,Math.min(50,Number(b.experience)||0)),education:clean(b.education,120),location:clean(b.location,120),salary:Math.max(0,Math.min(1000000,Number(b.salary)||0)),workType:clean(b.workType,40),interest:clean(b.interest,120),goal:clean(b.goal,120),latest:Boolean(b.latest)};
}
async function json(url,opt={},ms=9000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{const r=await fetch(url,{...opt,signal:c.signal});if(!r.ok)throw new Error("HTTP "+r.status);return await r.json()}finally{clearTimeout(t)}
}
function q(p){
  if(p.latest) return "พนักงาน, เจ้าหน้าที่, ธุรการ, บัญชี, การตลาด, ฝ่ายขาย, ไอที, คลังสินค้า, บริการลูกค้า";
  return clean([...p.skills.slice(0,8),p.interest,p.goal,p.education].filter(Boolean).join(", "),220)
}
function salary(v=""){const a=String(v).replace(/,/g,"").match(/\d{4,7}/g)?.map(Number)||[];return a.length?Math.max(...a):0}
function dedupe(a){const s=new Set();return a.filter(j=>{const k=norm(j.title+"|"+j.company+"|"+j.location);if(!k||s.has(k))return false;s.add(k);return true})}
function wantsThailand(p){
  const l=norm(p.location||"");
  if(!l)return false;
  return /ประเทศไทย|thailand|กรุงเทพ|bangkok|เชียงใหม่|chiang mai|ภูเก็ต|phuket|ชลบุรี|chon buri|ระยอง|rayong|พัทยา|pattaya|นนทบุรี|nonthaburi|ปทุม|pathum|สมุทร|samut|อยุธยา|ayutthaya|โคราช|korat|nakhon ratchasima|ขอนแก่น|khon kaen|อุดร|udon|อุบล|ubon|สงขลา|songkhla|หาดใหญ่|hat yai|สุราษฎร์|surat|ลำปาง|lampang|ลำพูน|lamphun|เชียงราย|chiang rai|พิษณุโลก|phitsanulok/.test(l);
}
function isThaiJob(j){
  const h=norm((j.location||"")+" "+(j.source||""));
  return /ประเทศไทย|thailand|กรุงเทพ|bangkok|เชียงใหม่|chiang mai|ภูเก็ต|phuket|ชลบุรี|chon buri|ระยอง|rayong|พัทยา|pattaya|นนทบุรี|nonthaburi|ปทุม|pathum|สมุทร|samut|อยุธยา|ayutthaya|โคราช|korat|nakhon ratchasima|ขอนแก่น|khon kaen|อุดร|udon|อุบล|ubon|สงขลา|songkhla|หาดใหญ่|hat yai|สุราษฎร์|surat|ลำปาง|lampang|ลำพูน|lamphun|เชียงราย|chiang rai|พิษณุโลก|phitsanulok|jooble/.test(h);
}
function mapJooble(d){return (d?.jobs||[]).map(j=>({id:"jooble-"+clean(j.id,80),title:clean(j.title,180),company:clean(j.company,160),location:clean(j.location,160),remote:/remote|รีโมต|work from home/i.test((j.title||"")+" "+(j.location||"")+" "+(j.snippet||"")),type:clean(j.type,80),salary:clean(j.salary,120),description:clean(strip(j.snippet),2200),tags:[],url:String(j.link||""),source:clean(j.source||"Jooble",80)}))}
function mapRemotive(d){return (d?.jobs||[]).map(j=>({id:"rem-"+j.id,title:clean(j.title,180),company:clean(j.company_name,160),location:clean(j.candidate_required_location||"Remote",160),remote:true,type:clean(j.job_type||"remote",80),salary:clean(j.salary,120),description:clean(strip(j.description),2200),tags:[j.category,...(j.tags||[])].map(x=>clean(x,60)).filter(Boolean).slice(0,12),url:String(j.url||""),source:"Remotive"}))}
function mapArbeit(d){return (d?.data||[]).map(j=>({id:"arb-"+clean(j.slug,120),title:clean(j.title,180),company:clean(j.company_name,160),location:clean(j.location,160),remote:Boolean(j.remote),type:(j.job_types||[]).map(x=>clean(x,60)).join(", "),salary:"",description:clean(strip(j.description),2200),tags:[...(j.tags||[]),...(j.job_types||[])].map(x=>clean(x,60)).filter(Boolean).slice(0,12),url:String(j.url||""),source:"Arbeitnow"}))}
async function jooble(p){
  if(!(process.env.JOOBLE_API_KEY && process.env.JOOBLE_ENABLED==="true"))return [];
  const b={keywords:q(p)||"งาน",location:p.location||"ประเทศไทย",radius:"80",page:1,ResultOnPage:30,companysearch:false};
  if(p.salary)b.salary=p.salary;
  return mapJooble(await json("https://th.jooble.org/api/"+encodeURIComponent(process.env.JOOBLE_API_KEY),{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(b)},10000));
}
async function remotive(p){
  const k=encodeURIComponent((q(p).split(",")[0]||"").trim());
  return mapRemotive(await json("https://remotive.com/api/remote-jobs?limit=100"+(k?"&search="+k:""),{headers:{Accept:"application/json"}},9000));
}
async function arbeit(){return mapArbeit(await json("https://www.arbeitnow.com/api/job-board-api",{headers:{Accept:"application/json"}},9000))}
function score(j,p){
  const hay=norm([j.title,j.company,j.description,(j.tags||[]).join(" ")].join(" "));
  const sk=p.skills.map(norm).filter(Boolean),matched=sk.filter(x=>hay.includes(x));
  let n=p.skills.length?(matched.length/p.skills.length)*55:12;
  if(p.location){const l=norm(p.location),jl=norm(j.location);n+=j.remote&&/remote|รีโมต|ออนไลน์/.test(l)?13:(jl.includes(l)||l.includes(jl))?13:j.remote?6:1}else n+=8;
  if(p.workType){const t=norm(j.type+" "+(j.remote?"remote":""));n+=((p.workType==="remote"&&j.remote)||t.includes(norm(p.workType).replace("-"," ")))?9:2}else n+=6;
  const intent=norm(p.interest+" "+p.goal+" "+p.education);if(intent){const w=intent.split(" ").filter(x=>x.length>2);n+=Math.min(12,3+w.filter(x=>hay.includes(x)).length*2.5)}else n+=5;
  if(p.salary){const m=salary(j.salary);n+=m?(m>=p.salary?8:2):4}else n+=5;
  const senior=/senior|lead|manager|head|director|principal/.test(hay),junior=/junior|entry|intern|trainee|graduate/.test(hay);
  n+=p.experience<=1&&junior?8:p.experience>=4&&senior?8:5;
  return {...j,score:Math.max(18,Math.min(98,Math.round(n))),matchedSkills:matched.slice(0,6),reason:matched.length?"ตรงกับทักษะ: "+matched.slice(0,4).join(", "):"ใกล้เคียงจากชื่องาน ความสนใจ และเงื่อนไขที่กรอก"};
}
async function aiRank(p,jobs){
  if(!(process.env.GEMINI_API_KEY && process.env.GEMINI_ENABLED==="true"))return null;
  const model=process.env.GEMINI_MODEL||"gemini-3.5-flash-lite";
  const c=jobs.slice(0,18).map(j=>({id:j.id,title:j.title,company:j.company,location:j.location,type:j.type,salary:j.salary,tags:j.tags,description:j.description.slice(0,700)}));
  const prompt="คุณเป็นระบบช่วยจับคู่ทักษะกับงาน ไม่ใช่ผู้ตัดสินการจ้างงาน\\nประเมินเฉพาะความสอดคล้องจากทักษะ ประสบการณ์โดยประมาณ วุฒิ/สายเรียน พื้นที่ เงินเดือน รูปแบบงาน ความสนใจ และเป้าหมาย ห้ามอนุมานคุณลักษณะอ่อนไหวใดๆ\\nคืน JSON รูปแบบ {\\\"matches\\\":[{\\\"id\\\":\\\"...\\\",\\\"score\\\":0,\\\"reason\\\":\\\"ภาษาไทยสั้นๆ\\\",\\\"missingSkills\\\":[\\\"...\\\"]}]} และต้องมีทุก id ที่ส่งมา\\nPROFILE:\\n"+JSON.stringify(p)+"\\nJOBS:\\n"+JSON.stringify(c);
  const d=await json("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:.2}})},12000);
  const raw=d?.candidates?.[0]?.content?.parts?.find(x=>x.text)?.text;if(!raw)return null;
  const parsed=JSON.parse(raw.trim());
  const m=new Map((parsed?.matches||[]).map(x=>[String(x.id),x]));
  return jobs.map(j=>{const a=m.get(String(j.id));return a?{...j,score:Math.max(0,Math.min(100,Number(a.score)||j.score)),reason:clean(a.reason||j.reason,220),missingSkills:Array.isArray(a.missingSkills)?a.missingSkills.map(x=>clean(x,60)).filter(Boolean).slice(0,6):[],aiRanked:true}:j}).sort((a,b)=>b.score-a.score);
}
export default async function handler(req,res){
  cors(req,res);if(req.method==="OPTIONS")return res.status(204).end();if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  res.setHeader("Cache-Control","no-store");
  try{
    const p=profileOf(req.body||{});if(!p.latest&&!p.skills.length&&!p.interest&&!p.goal)return res.status(400).json({error:"กรุณาระบุทักษะ งานที่สนใจ หรือสิ่งที่อยากทำ"});
    const thaiMode=wantsThailand(p) && p.workType!=="remote";
    const providers=p.latest?[jooble(p)]:[jooble(p),remotive(p),arbeit()];
    const names=p.latest?["Jooble Thailand"]:["Jooble Thailand","Remotive","Arbeitnow"];
    const rr=await Promise.allSettled(providers),all=[],sources=[];
    rr.forEach((r,i)=>{if(r.status==="fulfilled"&&r.value.length){
      const vals=thaiMode ? r.value.filter(isThaiJob) : r.value;
      if(vals.length){all.push(...vals);sources.push({name:names[i],count:vals.length})}
    }});
    let ranked=dedupe(all).map(j=>score(j,p)).sort((a,b)=>b.score-a.score).slice(0,35),aiUsed=false;
    if(!p.latest){try{const a=await aiRank(p,ranked);if(a){ranked=a;aiUsed=true}}catch{}}
    return res.status(200).json({ok:true,privacyMode:"stateless",aiUsed,sources,count:ranked.length,jobs:ranked.slice(0,24)});
  }catch{return res.status(502).json({error:"ไม่สามารถดึงหรือจับคู่งานได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง"})}
}