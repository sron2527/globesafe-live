import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getDatabase, ref, query, orderByChild, limitToLast, onValue, push, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBToAvkIoJX-pABrC9gNNUH2qBHQjmt-E',
  authDomain: 'globesafe-live.firebaseapp.com',
  databaseURL: 'https://globesafe-live-default-rtdb.firebaseio.com',
  projectId: 'globesafe-live',
  storageBucket: 'globesafe-live.firebasestorage.app',
  messagingSenderId: '546530087085',
  appId: '1:546530087085:web:7343207416bbab6fb1b624'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const ROOM_META = {
  global:{icon:'🌐',en:['Global','Worldwide conversation'],th:['ทั่วโลก','พูดคุยกับผู้คนทั่วโลก']},
  thailand:{icon:'🇹🇭',en:['Thailand','Talk about Thailand'],th:['ประเทศไทย','พูดคุยเรื่องประเทศไทย']},
  disaster:{icon:'⚠️',en:['Disaster','Hazards and local conditions'],th:['ภัยพิบัติ','ภัยและสถานการณ์ในพื้นที่']},
  weather:{icon:'🌧️',en:['Weather','Rain, storms and weather'],th:['สภาพอากาศ','ฝน พายุ และสภาพอากาศ']},
  local:{icon:'📍',en:['Local Reports','Share what you see locally'],th:['รายงานจากพื้นที่','แชร์สิ่งที่คุณพบเห็นในพื้นที่']}
};

const DICT = {
  en:{
    kicker:'COMMUNITY LIVE',title:'Talk, share and help each other.',
    desc:'Live community chat for sharing local situations and experiences. Posts are user-generated and are not verified emergency alerts.',
    connecting:'Connecting…',online:'Connected',offline:'Offline',nickname:'YOUR NICKNAME',save:'Save',
    nicknameNote:'No public account is required. Firebase creates an anonymous session in your browser.',
    global:'Global',globalDesc:'Worldwide conversation',thailandDesc:'Talk about Thailand',
    disaster:'Disaster',disasterDesc:'Hazards and local conditions',weather:'Weather',weatherDesc:'Rain, storms and weather',
    localReports:'Local Reports',localDesc:'Share what you see locally',safetyTitle:'Community safety',
    safetyText:'Do not post private addresses, phone numbers, passwords or unverified evacuation instructions. Use official authorities for urgent safety decisions.',
    loading:'Loading community messages…',send:'Send',disclaimer:'Community messages are user-generated content. GlobeSafe Live does not verify posts as official warnings. Report harmful or misleading posts and follow official authorities for emergencies.',
    placeholder:'Share an update or story…',namePlaceholder:'Nickname',nameSaved:'Nickname saved.',
    enterName:'Choose a nickname first.',messageEmpty:'Write a message first.',tooFast:'Please wait a few seconds before sending again.',
    sent:'Sent',sendFailed:'Could not send. Check Firebase Rules or your connection.',noMessages:'No messages yet. Start the conversation.',
    report:'Report',reportReason:'Why are you reporting this message?',reported:'Report sent. Thank you.',reportFailed:'Could not send report.',
    anonymous:'Anonymous'
  },
  th:{
    kicker:'คอมมูนิตี้สด',title:'พูดคุย แชร์เรื่องราว และช่วยกันรับรู้สถานการณ์',
    desc:'ห้องแชทสดสำหรับแบ่งปันสถานการณ์และประสบการณ์จากพื้นที่ ข้อความเป็นเนื้อหาจากผู้ใช้และไม่ใช่คำเตือนฉุกเฉินที่ยืนยันแล้ว',
    connecting:'กำลังเชื่อมต่อ…',online:'เชื่อมต่อแล้ว',offline:'ออฟไลน์',nickname:'ชื่อที่ใช้ในแชท',save:'บันทึก',
    nicknameNote:'ไม่ต้องสมัครบัญชีสาธารณะ Firebase จะสร้างเซสชันแบบไม่ระบุตัวตนในเบราว์เซอร์',
    global:'ทั่วโลก',globalDesc:'พูดคุยกับผู้คนทั่วโลก',thailandDesc:'พูดคุยเรื่องประเทศไทย',
    disaster:'ภัยพิบัติ',disasterDesc:'ภัยและสถานการณ์ในพื้นที่',weather:'สภาพอากาศ',weatherDesc:'ฝน พายุ และสภาพอากาศ',
    localReports:'รายงานจากพื้นที่',localDesc:'แชร์สิ่งที่คุณพบเห็นในพื้นที่',safetyTitle:'ความปลอดภัยของชุมชน',
    safetyText:'อย่าโพสต์ที่อยู่ส่วนตัว เบอร์โทร รหัสผ่าน หรือคำสั่งอพยพที่ยังไม่ได้ยืนยัน เหตุฉุกเฉินให้ยึดประกาศจากหน่วยงานทางการ',
    loading:'กำลังโหลดข้อความ…',send:'ส่ง',disclaimer:'ข้อความใน Community เป็นเนื้อหาที่ผู้ใช้โพสต์ GlobeSafe Live ไม่ยืนยันว่าเป็นคำเตือนทางการ หากพบข้อความอันตรายหรือทำให้เข้าใจผิดให้กดรายงาน และเหตุฉุกเฉินให้ติดตามหน่วยงานทางการ',
    placeholder:'แชร์สถานการณ์หรือเรื่องราว…',namePlaceholder:'ชื่อเล่น',nameSaved:'บันทึกชื่อแล้ว',
    enterName:'กรุณาตั้งชื่อเล่นก่อน',messageEmpty:'กรุณาพิมพ์ข้อความก่อน',tooFast:'กรุณารอสักครู่ก่อนส่งข้อความถัดไป',
    sent:'ส่งแล้ว',sendFailed:'ส่งไม่ได้ กรุณาตรวจ Rules ของ Firebase หรือการเชื่อมต่อ',noMessages:'ยังไม่มีข้อความ เริ่มพูดคุยได้เลย',
    report:'รายงาน',reportReason:'ต้องการรายงานข้อความนี้เพราะอะไร?',reported:'ส่งรายงานแล้ว ขอบคุณครับ',reportFailed:'ส่งรายงานไม่สำเร็จ',
    anonymous:'ไม่ระบุตัวตน'
  }
};

let currentRoom='global';
let currentUser=null;
let stopRoomListener=null;
let initialized=false;
let lastSentAt=0;
let lastSentText='';

const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const lang=()=>document.documentElement.lang==='th'?'th':'en';
const t=k=>DICT[lang()][k]||DICT.en[k]||k;

function setStatus(text,type=''){
  const el=$('#communityStatus'); if(!el)return;
  const b=el.querySelector('b'); if(b)b.textContent=text;
  el.classList.toggle('online',type==='online');
  el.classList.toggle('error',type==='error');
}
function setSendState(text,type=''){
  const el=$('#communitySendState'); if(!el)return;
  el.textContent=text||'';
  el.className='community-send-state'+(type?' '+type:'');
}
function cleanName(v){return String(v||'').replace(/\s+/g,' ').trim().slice(0,24);}
function cleanText(v){return String(v||'').replace(/\r/g,'').trim().slice(0,500);}

function applyCommunityLanguage(){
  $$('[data-community-i18n]').forEach(el=>{
    const key=el.dataset.communityI18n;
    if(DICT[lang()]?.[key]||DICT.en[key])el.textContent=t(key);
  });
  const name=$('#communityName'),msg=$('#communityMessage');
  if(name)name.placeholder=t('namePlaceholder');
  if(msg)msg.placeholder=t('placeholder');
  updateRoomHeader();
  if(initialized)setStatus(currentUser?t('online'):t('connecting'),currentUser?'online':'');
}
function updateRoomHeader(){
  const meta=ROOM_META[currentRoom]||ROOM_META.global;
  const labels=meta[lang()]||meta.en;
  const icon=$('#communityRoomIcon'),title=$('#communityRoomTitle'),sub=$('#communityRoomSubtitle');
  if(icon)icon.textContent=meta.icon;
  if(title)title.textContent=labels[0];
  if(sub)sub.textContent=labels[1];
}

function relativeTime(ts){
  const n=Number(ts); if(!Number.isFinite(n))return'';
  const seconds=Math.max(0,Math.floor((Date.now()-n)/1000));
  if(seconds<60)return lang()==='th'?'เมื่อสักครู่':'just now';
  const mins=Math.floor(seconds/60); if(mins<60)return lang()==='th'?mins+' นาทีที่แล้ว':mins+' min ago';
  const hrs=Math.floor(mins/60); if(hrs<24)return lang()==='th'?hrs+' ชม.ที่แล้ว':hrs+' hr ago';
  const days=Math.floor(hrs/24); return lang()==='th'?days+' วันที่แล้ว':days+' d ago';
}

function messageElement(id,m){
  const article=document.createElement('article');
  article.className='community-message'+(m.uid===currentUser?.uid?' mine':'');
  const avatar=document.createElement('div'); avatar.className='community-avatar';
  avatar.textContent=(m.name||t('anonymous')).trim().charAt(0).toUpperCase()||'?';

  const body=document.createElement('div'); body.className='community-message-body';
  const head=document.createElement('div'); head.className='community-message-meta';
  const name=document.createElement('strong'); name.textContent=m.name||t('anonymous');
  const time=document.createElement('small'); time.textContent=relativeTime(m.createdAt);
  head.append(name,time);

  const text=document.createElement('p'); text.textContent=m.text||'';
  body.append(head,text);

  const actions=document.createElement('div'); actions.className='community-message-actions';
  if(m.uid!==currentUser?.uid){
    const report=document.createElement('button');
    report.type='button'; report.textContent='⚑ '+t('report');
    report.addEventListener('click',()=>reportMessage(id,m));
    actions.append(report);
  }
  body.append(actions);
  article.append(avatar,body);
  return article;
}

function subscribeRoom(room){
  if(stopRoomListener){stopRoomListener();stopRoomListener=null;}
  const list=$('#communityMessages'); if(!list)return;
  list.innerHTML='<div class="community-empty">'+t('loading')+'</div>';
  const q=query(ref(db,'messages/'+room),orderByChild('createdAt'),limitToLast(80));
  stopRoomListener=onValue(q,snap=>{
    const rows=[];
    snap.forEach(child=>rows.push({id:child.key,...(child.val()||{})}));
    list.innerHTML='';
    if(!rows.length){
      const empty=document.createElement('div');empty.className='community-empty';empty.textContent=t('noMessages');list.append(empty);
    }else rows.forEach(row=>list.append(messageElement(row.id,row)));
    list.scrollTop=list.scrollHeight;
  },err=>{
    console.error('GlobeSafe community read:',err);
    const code=String(err?.code||'database-error');
    list.innerHTML='<div class="community-empty error">Firebase: '+code+'</div>';
    setStatus('Firebase: '+code,'error');
    setSendState('Firebase: '+code,'error');
  });
}

async function ensureAuth(){
  if(currentUser)return currentUser;
  setStatus(t('connecting'));
  try{
    if(typeof auth.authStateReady==='function')await auth.authStateReady();
    if(!auth.currentUser)await signInAnonymously(auth);
    currentUser=auth.currentUser;
    setStatus(t('online'),'online');
    return currentUser;
  }catch(err){
    console.error('GlobeSafe anonymous auth:',err);
    const code=String(err?.code||'auth-error');
    setStatus('Firebase: '+code,'error');
    setSendState('Firebase: '+code,'error');
    throw err;
  }
}

async function initCommunity(){
  if(initialized)return;
  initialized=true;
  applyCommunityLanguage();
  const saved=cleanName(localStorage.getItem('globesafe.communityName')||'');
  if($('#communityName'))$('#communityName').value=saved;
  try{
    await ensureAuth();
    subscribeRoom(currentRoom);
  }catch{}
}

function chooseRoom(room){
  if(!ROOM_META[room])return;
  currentRoom=room;
  $$('#communityRooms [data-room]').forEach(b=>b.classList.toggle('active',b.dataset.room===room));
  updateRoomHeader();
  if(currentUser)subscribeRoom(room);
}

async function sendMessage(){
  const name=cleanName($('#communityName')?.value);
  const text=cleanText($('#communityMessage')?.value);
  if(name.length<2){setSendState(t('enterName'),'error');$('#communityName')?.focus();return;}
  if(!text){setSendState(t('messageEmpty'),'error');return;}
  const now=Date.now();
  if(now-lastSentAt<8000){setSendState(t('tooFast'),'error');return;}
  if(text===lastSentText&&now-lastSentAt<30000){setSendState(t('tooFast'),'error');return;}
  const urlCount=(text.match(/https?:\/\//gi)||[]).length;
  if(urlCount>2){setSendState(t('tooFast'),'error');return;}

  try{
    await ensureAuth();
    localStorage.setItem('globesafe.communityName',name);
    const btn=$('#sendCommunityMessage');if(btn)btn.disabled=true;
    await push(ref(db,'messages/'+currentRoom),{
      uid:currentUser.uid,
      name,
      text,
      createdAt:serverTimestamp()
    });
    lastSentAt=Date.now();lastSentText=text;
    if($('#communityMessage'))$('#communityMessage').value='';
    if($('#communityCharCount'))$('#communityCharCount').textContent='0 / 500';
    setSendState(t('sent'),'ok');
    setTimeout(()=>setSendState(''),1800);
  }catch(err){
    console.error('GlobeSafe community write:',err);
    setSendState('Firebase: '+String(err?.code||'write-error'),'error');
  }finally{
    const btn=$('#sendCommunityMessage');if(btn)btn.disabled=false;
  }
}

async function reportMessage(messageId,m){
  const reason=window.prompt(t('reportReason'));
  const clean=cleanText(reason).slice(0,200);
  if(!clean)return;
  try{
    await ensureAuth();
    await push(ref(db,'reports'),{
      reporterUid:currentUser.uid,
      messageId:String(messageId),
      room:currentRoom,
      reason:clean,
      createdAt:serverTimestamp()
    });
    setSendState(t('reported'),'ok');
    setTimeout(()=>setSendState(''),2400);
  }catch(err){
    console.error('GlobeSafe report:',err);
    setSendState(t('reportFailed'),'error');
  }
}

document.addEventListener('click',e=>{
  const open=e.target.closest('[data-view="community"]');
  if(open)setTimeout(()=>initCommunity(),30);
});
$$('#communityRooms [data-room]').forEach(btn=>btn.addEventListener('click',()=>chooseRoom(btn.dataset.room)));
$('#saveCommunityName')?.addEventListener('click',()=>{
  const name=cleanName($('#communityName')?.value);
  if(name.length<2){setSendState(t('enterName'),'error');return;}
  localStorage.setItem('globesafe.communityName',name);
  if($('#communityName'))$('#communityName').value=name;
  setSendState(t('nameSaved'),'ok');setTimeout(()=>setSendState(''),1600);
});
$('#sendCommunityMessage')?.addEventListener('click',sendMessage);
$('#communityMessage')?.addEventListener('input',e=>{
  if($('#communityCharCount'))$('#communityCharCount').textContent=e.target.value.length+' / 500';
});
$('#communityMessage')?.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}
});
$('#languageSelect')?.addEventListener('change',()=>setTimeout(applyCommunityLanguage,0));
applyCommunityLanguage();
