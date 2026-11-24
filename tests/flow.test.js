'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});s.on('error',reject);});}
test('teacher and two separate students play a full game safely',async()=>{
 const port=await freePort();const srv=spawn(process.execPath,['server.js'],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,PORT:String(port)}});
 const base=`http://127.0.0.1:${port}`;
 const post=async (path,body)=>{const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:res.status,data:await res.json()};};
 try{
  for(let i=0;i<80;i++){try{const res=await fetch(base+'/health');if(res.ok)break;}catch{} await new Promise(r=>setTimeout(r,25));}
  let {data:host}=await post('/api/create',{limit:4});assert.equal(host.code.length,6);assert.ok(host.token);
  const students=[];for(let i=0;i<4;i++){let {status,data}=await post('/api/join',{code:host.code});assert.equal(status,200);students.push(data);}
  const creds=(s)=>({code:host.code,token:s.token});
  let {data:waiting}=await post('/api/state',creds(students[0]));assert.equal(waiting.phase,'lobby');assert.equal(waiting.self.score,null);assert.ok(waiting.participants.every(p=>p.score===null));
  let {status:badStart}=await post('/api/action',{...creds(students[0]),action:'start'});assert.equal(badStart,409);
  // Check that a real-time subscription receives a server notification.
  const feed = await fetch(base+`/api/events?code=${host.code}&token=${students[0].token}`);
  assert.equal(feed.status,200);
  const reader=feed.body.getReader();
  const first = await reader.read();assert.match(new TextDecoder().decode(first.value), /event: update/);
  let {status:start}=await post('/api/action',{...creds(host),action:'start'});assert.equal(start,200);
  const next = await reader.read();assert.match(new TextDecoder().decode(next.value), /event: update/);
  await reader.cancel();
  let {data:s0}=await post('/api/state',creds(students[0]));let {data:s1}=await post('/api/state',creds(students[1]));
  assert.equal(s0.self.score,null);assert.ok(s0.participants.find(p=>p.id===s1.self.id).score!==null);
  assert.equal(s0.participants.find(p=>p.id===s0.self.id).score,null);
  let {status:sent}=await post('/api/action',{...creds(students[0]),action:'send',to:s1.self.id});assert.equal(sent,200);
  let {data:received}=await post('/api/state',creds(students[1]));assert.equal(received.inbox.length,1);
  let {status:spoof}=await post('/api/action',{...creds(students[2]),action:'accept',requestId:received.inbox[0].id});assert.equal(spoof,409);
  let {status:accepted}=await post('/api/action',{...creds(students[1]),action:'accept',requestId:received.inbox[0].id});assert.equal(accepted,200);
  let {data:paired}=await post('/api/state',creds(students[0]));assert.equal(paired.self.partner,s1.self.id);
  let {status:again}=await post('/api/action',{...creds(students[0]),action:'send',to:students[2].id});assert.equal(again,409);
  let {status:reveal}=await post('/api/action',{...creds(host),action:'reveal'});assert.equal(reveal,200);
  let {data:result}=await post('/api/state',creds(students[0]));assert.ok(result.self.score!==null);assert.equal(result.phase,'revealed');assert.equal(result.matched,1);
  let {status:afterReveal}=await post('/api/action',{...creds(students[2]),action:'send',to:students[3].id});assert.equal(afterReveal,409);
  const web=await fetch(base+'/');assert.equal(web.status,200);assert.match(await web.text(),/Online Dating Pairing Game/);
  let {status:closed}=await post('/api/action',{...creds(host),action:'close'});assert.equal(closed,200);
  let {status:gone}=await post('/api/state',creds(host));assert.equal(gone,404);
 }finally{srv.kill('SIGTERM');}
});
