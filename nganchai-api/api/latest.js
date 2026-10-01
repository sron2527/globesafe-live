const ORIGINS=new Set((process.env.ALLOWED_ORIGINS||"https://sron2527.github.io").split(",").map(s=>s.trim()).filter(Boolean));
const KEYWORDS=["admin","accounting","sales","marketing","customer service","warehouse","IT","engineer","production","part time"];
function cors(req,res){
  const o=req.headers.origin;
  if(o&&ORIGINS.has(o)){res.setHeader("Access-Control-Allow-Origin",o);res.setHeader("Vary","Origin")}
  res.setHeader("Access-Control-Allow-Methods","GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
}
function clean(v,max=180){return String(v??"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,max)}
function strip(v=""){return String(v).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim()}
function norm(v=""){return clean(v,1200).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}+#. ]/gu," ").replace(/\s+/g," ").trim()}
async function json(url,opt={},ms=10000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{const r=await fetch(url,{...opt,signal:c.signal});if(!r.ok)throw new Error("HTTP "+r.status);return await r.json()}finally{clearTimeout(t)}
}
function mapJooble(d,keyword){
  return (d?.jobs||[]).map(j=>({
    id:"jooble-"+clean(j.id||j.link,100),
    title:clean(j.title,180),
    company:clean(j.company,160),
    location:clean(j.location||"ประเทศไทย",160),
    remote:/remote|รีโมต|work from home/i.test((j.title||"")+" "+(j.location||"")+" "+(j.snippet||"")),
    type:clean(j.type,80),
    salary:clean(j.salary,120),
    description:clean(strip(j.snippet),2200),
    tags:[keyword].filter(Boolean),
    url:String(j.link||""),
    source:clean(j.source||"Jooble Thailand",80),
    updated:clean(j.updated,80)
  }))
}
function dedupe(a){
  const seen=new Set();
  return a.filter(j=>{const k=norm(j.title+"|"+j.company+"|"+j.location);if(!k||seen.has(k))return false;seen.add(k);return true})
}
function thaiOnly(j){
  const h=norm((j.location||"")+" "+(j.source||""));
  return !/(united states|usa|germany|berlin|munich|london|europe|canada|worldwide|remote only)/.test(h)
}
async function search(keyword){
  const key=process.env.JOOBLE_API_KEY;
  if(!(key&&process.env.JOOBLE_ENABLED==="true"))return [];
  const body={keywords:keyword,location:"Thailand",radius:"80",page:1,ResultOnPage:25,companysearch:false};
  const d=await json("https://th.jooble.org/api/"+encodeURIComponent(key),{
    method:"POST",
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify(body)
  });
  return mapJooble(d,keyword)
}
export default async function handler(req,res){
  cors(req,res);
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  if(!(process.env.JOOBLE_API_KEY&&process.env.JOOBLE_ENABLED==="true"))return res.status(503).json({error:"Jooble not configured"});
  res.setHeader("Cache-Control","public, max-age=0, s-maxage=604800, stale-while-revalidate=86400");
  res.setHeader("Vercel-CDN-Cache-Control","public, s-maxage=604800, stale-while-revalidate=86400");
  try{
    const results=await Promise.allSettled(KEYWORDS.map(search));
    const all=[];
    const categories=[];
    results.forEach((r,i)=>{
      if(r.status==="fulfilled"&&r.value.length){
        all.push(...r.value);
        categories.push({keyword:KEYWORDS[i],count:r.value.length});
      }
    });
    const jobs=dedupe(all).filter(thaiOnly).slice(0,40);
    return res.status(200).json({ok:true,privacyMode:"public-jobs-cache",cachedForSeconds:604800,categories,count:jobs.length,jobs});
  }catch{
    return res.status(502).json({error:"โหลดงานไทยล่าสุดไม่สำเร็จ"})
  }
}