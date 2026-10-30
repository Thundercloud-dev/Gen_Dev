import { createClient } from '@supabase/supabase-js'
import './style.css'

const url=import.meta.env.VITE_SUPABASE_URL
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const db=url&&key?createClient(url,key):null
const $=id=>document.getElementById(id)
let user=null,posts=[],filter='all',progress={current_level:1,unlocked_level:1,total_jumps:0,best_score:0,coins:0}
let game

function modal(id,show=true){$(id).classList.toggle('hidden',!show)}
function message(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error)}
function view(name){$('community-view').classList.toggle('hidden',name!=='community');$('game-view').classList.toggle('hidden',name!=='game');document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(name==='game')game.draw();window.scrollTo({top:0,behavior:'smooth'})}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view))
document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>view(b.dataset.goto))
$('explore').onclick=()=>$('community-view').scrollIntoView({behavior:'smooth'})
$('year').textContent=new Date().getFullYear()

function accountUI(){
 $('account').textContent=user?(user.user_metadata?.display_name||user.email):'Browsing as guest'
 $('auth-open').classList.toggle('hidden',!!user);$('signout').classList.toggle('hidden',!user)
 $('save-status').textContent=user?'Signed in — your best score syncs.':'Playing as guest — sign in to save.'
}
function validUrl(raw){if(!raw)return null;try{const u=new URL(raw);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}}
function renderPosts(){
 const root=$('posts');root.replaceChildren()
 const q=$('search').value.trim().toLowerCase()
 const list=posts.filter(p=>(filter==='all'||p.post_type===filter)&&(!q||[p.title,p.body,p.username].join(' ').toLowerCase().includes(q)))
 if(!list.length){const e=document.createElement('div');e.className='empty';e.textContent=posts.length?'No posts match your search.':'No posts yet — be the first to share a clip or tip.';root.append(e);return}
 for(const p of list){
  const card=document.createElement('article');card.className='post'
  const meta=document.createElement('div');meta.className='post-meta'
  const tag=document.createElement('span');tag.className='tag '+p.post_type;tag.textContent=p.post_type==='clip'?'▶ CLIP':'✦ TIP'
  const date=document.createElement('span');date.textContent=new Date(p.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});meta.append(tag,date)
  const title=document.createElement('h3');title.textContent=p.title
  const body=document.createElement('p');body.textContent=p.body
  card.append(meta,title,body)
  const link=validUrl(p.link_url);if(link){const a=document.createElement('a');a.className='post-link';a.href=link;a.target='_blank';a.rel='noopener noreferrer';a.textContent=p.post_type==='clip'?'Watch the clip ↗':'Open reference ↗';card.append(a)}
  const foot=document.createElement('div');foot.className='post-foot';const author=document.createElement('span');author.textContent='●  '+(p.username||'Runner');foot.append(author)
  if(user&&user.id===p.user_id){const del=document.createElement('button');del.className='delete';del.textContent='Delete';del.onclick=()=>deletePost(p.id);foot.append(del)}
  card.append(foot);root.append(card)
 }
}
async function loadPosts(){
 if(!db){$('posts').textContent='Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel.';return}
 const {data,error}=await db.from('community_posts').select('id,user_id,username,post_type,title,body,link_url,created_at').order('created_at',{ascending:false}).limit(60)
 if(error){$('posts').textContent='Could not load posts: '+error.message;return}posts=data||[];renderPosts()
}
async function deletePost(id){if(!user||!db||!confirm('Delete this post?'))return;const {error}=await db.from('community_posts').delete().eq('id',id).eq('user_id',user.id);if(error)alert(error.message);else loadPosts()}
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderPosts()})
$('search').oninput=renderPosts
function openPost(){if(user)modal('post-modal');else modal('auth-modal')}
$('post-open').onclick=openPost;$('share').onclick=openPost
$('auth-open').onclick=()=>modal('auth-modal')
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>modal(b.dataset.close,false))
$('post-form').onsubmit=async e=>{
 e.preventDefault();if(!user){modal('post-modal',false);modal('auth-modal');return}
 const raw=$('post-link').value.trim(),link=validUrl(raw);if(raw&&!link)return message('post-message','Please enter a valid http or https link.',true)
 const button=$('publish');button.disabled=true;button.textContent='Publishing…'
 const {error}=await db.from('community_posts').insert({user_id:user.id,username:user.user_metadata?.display_name||user.email?.split('@')[0]||'Runner',post_type:$('post-type').value,title:$('post-title').value.trim(),body:$('post-body').value.trim(),link_url:link})
 button.disabled=false;button.textContent='Publish post'
 if(error)return message('post-message',error.message,true)
 $('post-form').reset();modal('post-modal',false);await loadPosts()
}
$('auth-form').onsubmit=async e=>{
 e.preventDefault();if(!db)return message('auth-message','Supabase is not configured in Vercel yet.',true)
 message('auth-message','Signing in…')
 const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value})
 if(error)return message('auth-message',error.message,true)
 user=data.user;await afterAuth();modal('auth-modal',false)
}
$('signup').onclick=async()=>{
 if(!db)return message('auth-message','Supabase is not configured in Vercel yet.',true)
 const email=$('email').value.trim(),password=$('password').value
 if(!email||password.length<6)return message('auth-message','Enter an email and a password with at least 6 characters.',true)
 message('auth-message','Creating account…')
 const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:email.split('@')[0].slice(0,24)}}})
 if(error)return message('auth-message',error.message,true)
 if(data.session){user=data.user;await afterAuth();modal('auth-modal',false)}
 else message('auth-message','Account created. Check your email to confirm, then sign in.')
}
async function afterAuth(){accountUI();await Promise.all([loadPosts(),loadProgress()])}
$('signout').onclick=async()=>{const {error}=await db.auth.signOut();if(error)return alert(error.message);user=null;progress={current_level:1,unlocked_level:1,total_jumps:0,best_score:0,coins:0};accountUI();$('best').textContent='0';loadPosts()}
async function loadProgress(){
 if(!user||!db)return
 const {data,error}=await db.from('parkour_progress').select('current_level,unlocked_level,total_jumps,best_score,coins').eq('user_id',user.id).maybeSingle()
 if(error)return message('save-status',error.message,true)
 if(data)progress={...progress,...data}
 game.best=Number(progress.best_score)||0;$('best').textContent=String(game.best)
}
async function saveScore(score,jumps){
 if(!user||!db){$('save-status').textContent='Sign in to save your score.';return}
 progress.best_score=Math.max(Number(progress.best_score)||0,score);progress.total_jumps=(Number(progress.total_jumps)||0)+jumps
 progress.current_level=Math.max(Number(progress.current_level)||1,Math.floor(score/100)+1);progress.unlocked_level=Math.max(Number(progress.unlocked_level)||1,progress.current_level)
 const {error}=await db.from('parkour_progress').upsert({user_id:user.id,...progress,updated_at:new Date().toISOString()},{onConflict:'user_id'})
 if(error)$('save-status').textContent='Could not save: '+error.message
 else{$('best').textContent=String(progress.best_score);$('save-status').textContent='Record saved ✓'}
}

function makeGame(){
 const c=$('runner'),ctx=c.getContext('2d'),ground=295
 let active=false,score=0,jumps=0,speed=5,last=0,spawn=0,items=[],raf=0,best=0
 const player={x:100,y:ground-40,vy:0,on:true}
 function draw(){
  const g=ctx.createLinearGradient(0,0,0,360);g.addColorStop(0,'#19264b');g.addColorStop(1,'#3b5788');ctx.fillStyle=g;ctx.fillRect(0,0,900,360)
  for(let i=0;i<7;i++){let x=(i*160-score*.5%1050+1050)%1050-40;ctx.fillStyle='rgba(255,255,255,.15)';ctx.beginPath();ctx.arc(x,70+i%3*35,19,0,7);ctx.arc(x+24,65+i%3*35,24,0,7);ctx.arc(x+49,75+i%3*35,17,0,7);ctx.fill()}
  ctx.fillStyle='#192642';ctx.fillRect(0,ground,900,65);ctx.fillStyle='#9be6ff';ctx.fillRect(0,ground,900,4)
  items.forEach(o=>{ctx.fillStyle='#ff8296';ctx.beginPath();ctx.roundRect(o.x,o.y,o.w,o.h,7);ctx.fill();ctx.fillStyle='#ffc5ce';ctx.fillRect(o.x+6,o.y+7,o.w-12,5)})
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(player.x+18,player.y+17,16,Math.PI,0);ctx.arc(player.x+35,player.y+17,16,Math.PI,0);ctx.lineTo(player.x+51,player.y+35);ctx.lineTo(player.x+2,player.y+35);ctx.fill()
  ctx.fillStyle='#172442';ctx.beginPath();ctx.arc(player.x+27,player.y+16,2.5,0,7);ctx.arc(player.x+38,player.y+16,2.5,0,7);ctx.fill();$('score').textContent=String(Math.floor(score))
 }
 function jump(){if(active&&player.on){player.vy=-13;player.on=false;jumps++}}
 function finish(){active=false;$('run-status').textContent='RUN COMPLETE';$('overlay-title').textContent='Run complete!';$('overlay-copy').textContent='Score: '+Math.floor(score)+' · Jumps: '+jumps+'. Try again?';$('start').textContent='Run again';$('overlay').classList.remove('hidden');best=Math.max(best,Math.floor(score));$('best').textContent=String(best);saveScore(Math.floor(score),jumps)}
 function loop(t){if(!active)return;const d=Math.min((t-(last||t))/16.67,2);last=t;score+=.12*speed*d;speed=Math.min(10,5+score/450);player.vy+=.62*d;player.y+=player.vy*d;if(player.y+40>=ground){player.y=ground-40;player.vy=0;player.on=true}
  spawn+=d*16.67;if(spawn>Math.max(650,1450-speed*75)){spawn=0;const h=28+Math.random()*24;items.push({x:910,y:ground-h,w:25+Math.random()*18,h})}
  items.forEach(o=>o.x-=speed*d);items=items.filter(o=>o.x+o.w>0)
  if(items.some(o=>player.x+43>o.x+3&&player.x+7<o.x+o.w-3&&player.y+36>o.y+3)){draw();finish();return}
  draw();raf=requestAnimationFrame(loop)
 }
 function start(){cancelAnimationFrame(raf);score=0;jumps=0;speed=5;spawn=0;items=[];player.y=ground-40;player.vy=0;player.on=true;active=true;last=0;$('overlay').classList.add('hidden');$('run-status').textContent='RUNNING';raf=requestAnimationFrame(loop)}
 $('start').onclick=start;$('restart').onclick=start;c.onpointerdown=jump
 window.addEventListener('keydown',e=>{if(['Space','ArrowUp','KeyW'].includes(e.code)&&!$('game-view').classList.contains('hidden')){e.preventDefault();jump()}})
 draw();return{draw,start,get best(){return best},set best(v){best=v;$('best').textContent=String(v)}}
}
game=makeGame();accountUI();loadPosts()
if(db){db.auth.getSession().then(async({data})=>{user=data.session?.user||null;accountUI();if(user)await afterAuth()});db.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;accountUI();if(user)afterAuth()})}
else $('posts').textContent='Supabase setup is missing. Configure the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY environment variables in Vercel.'
