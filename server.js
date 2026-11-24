'use strict';
// Dependency-free classroom demo. All sessions are transient and live in one server process.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const roomCreates = new Map(); // light abuse protection for a public pilot
const MAX_ROOM_AGE = 6 * 60 * 60 * 1000;
const rand = (n=24) => crypto.randomBytes(n).toString('base64url');
const code = () => Array.from(crypto.randomBytes(6), x => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join('');
const names = ['Alex','Blair','Casey','Drew','Emery','Finley','Gray','Harper','Indigo','Jules','Kai','Lane','Morgan','Noel','Oakley','Parker','Quinn','Reese','Sage','Taylor','Uma','Val','Wren','Xen','Yael','Zion','Avery','Rowan','Sky','River','Robin','Ellis','Cameron','Shiloh','Micah','Sam','Phoenix','Jamie','Ari','Riley','Alden','Peyton','Skyler','Charlie','Frankie','Quincy','Ashton','Remy','Devon'];
const shuffle = arr => {for(let i=arr.length-1;i>0;i--){const j=crypto.randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];} return arr;};
function send(res, status, body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}
function failure(res,status,message){return send(res,status,{error:message});}
function parseBody(req){return new Promise((resolve,reject)=>{let data='';req.on('data',s=>{data+=s;if(data.length>16000){reject(new Error('Request too large'));req.destroy();}});req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch{reject(new Error('Invalid JSON'));}});req.on('error',reject);});}
function identity(room,token){if(token===room.teacherKey)return {role:'teacher'};let player=room.players.find(p=>p.token===token);if(player)return {role:'student',player};return null;}
function status(room,id){let self=id.player;return {code:room.code,phase:room.phase,limit:room.limit,joined:room.players.filter(p=>p.token).length,matched:room.players.filter(p=>p.partner).length/2,total:room.players.length,round:room.round,role:id.role,self:self?{id:self.id,name:self.name,score:room.phase==='revealed'?self.score:null,partner:self.partner}:null,participants:room.players.map(p=>({id:p.id,name:p.name,score:(id.role==='teacher'||room.phase==='revealed'||self?.id!==p.id && room.phase==='active')?p.score:null,joined:!!p.token,partner:room.phase==='revealed'||id.role==='teacher'?p.partner:!!p.partner})),inbox:self?room.requests.filter(r=>r.to===self.id&&r.status==='pending').map(r=>({id:r.id,from:r.from,name:room.players.find(p=>p.id===r.from).name,score:room.players.find(p=>p.id===r.from).score})):[],outgoing:self?room.requests.filter(r=>r.from===self.id&&r.status==='pending').map(r=>({id:r.id,to:r.to})):[],history:id.role==='teacher'||room.phase==='revealed'?room.history:[],roomSettings:{observers:room.observers}};}
function notify(room){room.version++;for(const subscriber of room.clients){try{subscriber.write(`event: update\ndata: ${JSON.stringify({version:room.version})}\n\n`);}catch{room.clients.delete(subscriber);}}}
function closeRoom(room){for(const res of room.clients)try{res.end();}catch{} rooms.delete(room.code);}
function getRoom(body){return rooms.get(String(body.code||'').trim().toUpperCase());}
function credentials(room,body){return identity(room,String(body.token||''));}
function handleAction(room,id,action,body){const self=id.player;
 if(action==='start'){if(id.role!=='teacher')throw Error('Instructor only');if(room.phase!=='lobby')throw Error('Already started');if(room.players.filter(p=>p.token).length<2)throw Error('At least two students must join');room.phase='active';room.round=1;return {};}
 if(action==='reveal'){if(id.role!=='teacher')throw Error('Instructor only');if(room.phase!=='active')throw Error('Start the game first');room.phase='revealed';for(const r of room.requests)if(r.status==='pending')r.status='canceled';return {};}
 if(action==='next-round'){if(id.role!=='teacher')throw Error('Instructor only');if(room.phase!=='active')throw Error('Game is not active');room.round++; for(const r of room.requests)if(r.status==='pending')r.status='expired'; return {};}
 if(action==='close'){if(id.role!=='teacher')throw Error('Instructor only');return {close:true};}
 if(id.role!=='student'||!self)throw Error('Student only');
 if(room.phase!=='active')throw Error('Waiting for the instructor to start or game already revealed');
 if(self.partner)throw Error('Your fictional role has already matched');
 if(!['send','accept','reject'].includes(action))throw Error('Unknown action');
 if(action==='send'){
   const to=room.players.find(p=>p.id===body.to);if(!to||to.id===self.id||!to.token||to.partner)throw Error('Recipient is unavailable');
   if(room.requests.some(r=>r.from===self.id&&r.status==='pending'))throw Error('Respond to your existing request first');
   const r={id:rand(9),from:self.id,to:to.id,status:'pending',round:room.round};room.requests.push(r);room.history.push({event:'request',from:r.from,to:r.to,round:room.round});return {};
 }
 const r=room.requests.find(r=>r.id===body.requestId&&r.to===self.id&&r.status==='pending');if(!r)throw Error('Request is unavailable');
 const sender=room.players.find(p=>p.id===r.from);if(sender.partner){r.status='canceled';throw Error('Sender has already matched');}
 if(action==='reject'){r.status='rejected';room.history.push({event:'reject',from:r.from,to:r.to,round:room.round});return {};}
 r.status='accepted';sender.partner=self.id;self.partner=sender.id;room.history.push({event:'match',from:r.from,to:r.to,round:room.round});
 for(const item of room.requests)if(item.status==='pending'&&[sender.id,self.id].some(pid=>pid===item.from||pid===item.to))item.status='canceled';
 return {};
}
function serveStatic(req,res){let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{return failure(res,400,'Bad URL');}
 const route=pathname==='/'?'/index.html':pathname;
 const known={'/index.html':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8'};
 if(!known[route])return failure(res,404,'Not found');
 const file=path.join(__dirname,'public',route);
 fs.readFile(file,(err,data)=>{if(err)return failure(res,404,'Not found');res.writeHead(200,{'Content-Type':known[route],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'"});res.end(data);});}
const server = http.createServer(async (req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 if(req.method==='GET'&&route==='/health')return send(res,200,{status:'ok',version:'0.2.0'});
 if(req.method==='GET'&&route==='/api/events'){
   const url=new URL(req.url,'http://localhost');const room=rooms.get((url.searchParams.get('code')||'').toUpperCase());
   if(!room||!identity(room,url.searchParams.get('token')||''))return failure(res,401,'Invalid room credentials');
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no','Referrer-Policy':'no-referrer'});
   room.clients.add(res);res.write(`event: update\ndata: ${JSON.stringify({version:room.version})}\n\n`);
   const keepalive=setInterval(()=>{try{res.write(': heartbeat\n\n');}catch{}},20000);
   req.on('close',()=>{clearInterval(keepalive);room.clients.delete(res);});return;
 }
 if(req.method==='POST'&&route.startsWith('/api/')){
   let body;try{body=await parseBody(req);}catch(e){return failure(res,400,e.message);}
   if(route==='/api/create'){
     const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
     const now=Date.now();const history=(roomCreates.get(ip)||[]).filter(t=>now-t<60_000);
     if(history.length>=5)return failure(res,429,'Too many classrooms created. Try again later.');
     if(rooms.size>=100)return failure(res,503,'Classroom capacity reached. Try again later.');
     history.push(now);roomCreates.set(ip,history);
     const limit=Number(body.limit||20);if(!Number.isInteger(limit)||limit<4||limit>40)return failure(res,400,'Choose 4–40 roles');
     let roomCode;do{roomCode=code();}while(rooms.has(roomCode));
     const scores=shuffle(Array.from({length:limit},(_,i)=>1+(i%10)));
     const labels=shuffle([...names]).slice(0,limit);
     const room={code:roomCode,teacherKey:rand(),phase:'lobby',limit,round:0,version:1,created:Date.now(),players:labels.map((name,i)=>({id:`P${String(i+1).padStart(2,'0')}`,name,score:scores[i],token:null,partner:null})),requests:[],history:[],clients:new Set(),observers:0};rooms.set(room.code,room);
     return send(res,200,{code:room.code,token:room.teacherKey});
   }
   const room=getRoom(body);if(!room)return failure(res,404,'Room not found (server may have restarted)');
   if(route==='/api/join'){
     if(room.phase!=='lobby')return failure(res,409,'Joining is closed after game starts');
     const empty=room.players.find(p=>!p.token);if(!empty)return failure(res,409,'Room is full');
     empty.token=rand();notify(room);return send(res,200,{code:room.code,token:empty.token,id:empty.id,name:empty.name});
   }
   const id=credentials(room,body);if(!id)return failure(res,401,'Invalid classroom token');
   if(route==='/api/state')return send(res,200,status(room,id));
   if(route==='/api/action'){
     try{const result=handleAction(room,id,String(body.action||''),body);if(result.close){closeRoom(room);return send(res,200,{ok:true,closed:true});}notify(room);return send(res,200,{ok:true});}
     catch(e){return failure(res,409,e.message);}
   }
   return failure(res,404,'Unknown API route');
 }
 if(req.method!=='GET')return failure(res,405,'Method not allowed');return serveStatic(req,res);
});
setInterval(()=>{for(const room of rooms.values())if(Date.now()-room.created>MAX_ROOM_AGE)closeRoom(room);},60000).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Online Dating Pairing Game running on port ${PORT}`));
