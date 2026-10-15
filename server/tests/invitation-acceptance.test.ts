import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import auth from '../src/auth.routes.js';
import { pool } from '../src/db.js';

const userId='00000000-0000-4000-8000-000000000091';
const route=auth.stack.find((layer:any)=>layer.route?.path==='/invitation/complete').route.stack.at(-1).handle;
afterEach(()=>mock.restoreAll());
function fixture(options:{missing?:boolean;disabled?:boolean;providerReject?:boolean;failNotice?:boolean;recentInvite?:boolean}={}) {
  let accepted=false,transactionAccepted=false,notices=0,transactionNotices=0;
  const requests:Array<RequestInit>=[];
  mock.method(pool,'connect',async()=>({release(){},async query(sql:string){
    if(sql==='BEGIN'){transactionAccepted=accepted;transactionNotices=notices;}
    if(sql==='COMMIT'){accepted=transactionAccepted;notices=transactionNotices;}
    if(sql.includes('SELECT role,accepted_at'))return{rows:options.missing?[]:[{role:'doctor',accepted_at:transactionAccepted?new Date():null}],rowCount:options.missing?0:1};
    if(sql.includes('SELECT active,deletion_requested_at'))return{rows:[{active:!options.disabled}],rowCount:1};
    if(sql.includes('UPDATE account_invitations'))transactionAccepted=true;
    if(sql.includes('INSERT INTO notifications')){if(options.failNotice){options.failNotice=false;throw new Error('Private transaction fixture');}transactionNotices++;}
    return{rows:[],rowCount:1};
  }}));
  mock.method(globalThis,'fetch',async(_input:unknown,init?:RequestInit)=>{requests.push(init!);return Response.json(options.providerReject?{message:'Private provider failure'}:{id:userId},{status:options.providerReject?422:200});});
  return{requests,get accepted(){return accepted;},get notices(){return notices;},async call(password='fixture-own-password'){
    const result={status:200,body:undefined as any};const res={status(status:number){result.status=status;return res;},json(body:unknown){result.body=body;return res;}};
    await route({body:{password},headers:{authorization:'Bearer fixture-token'},auth:{userId,role:'doctor',email:'doctor@gmail.com',profile:{full_name:'Invited Doctor Fixture'},...(options.recentInvite?{invitedAt:new Date().toISOString()}:{})}},res);
    return result;
  }};
}
test('password acknowledgement precedes acceptance and duplicate retries notify once',async()=>{
  const f=fixture();assert.equal((await f.call()).status,200);assert.equal(f.accepted,true);assert.equal(f.notices,1);
  assert.equal(JSON.parse(String(f.requests[0].body)).password,'fixture-own-password');
  assert.equal(f.requests[0].redirect,'error');assert.ok(f.requests[0].signal);
  assert.equal((await f.call('second-fixture-password')).status,200);assert.equal(f.notices,1);
  assert.equal(JSON.parse(String(f.requests[1].body)).password,'second-fixture-password');
});
test('untracked and malformed invitations cannot change passwords or send notices',async()=>{
  const f=fixture({missing:true});assert.equal((await f.call()).status,403);assert.equal((await f.call('short')).status,400);assert.equal(f.requests.length,0);assert.equal(f.notices,0);
});
test('a freshly confirmed provider invitation can retry while its tracking transaction commits',async()=>{
  const f=fixture({missing:true,recentInvite:true});const response=await f.call();assert.equal(response.status,503);assert.equal(response.body.code,'ACCOUNT_SETUP_PENDING');assert.equal(response.body.retryAfterSeconds,1);assert.equal(f.requests.length,0);
});
test('provider rejection never records acceptance or notifications',async()=>{
  const f=fixture({providerReject:true});const response=await f.call();assert.equal(response.status,422);assert.equal(f.accepted,false);assert.equal(f.notices,0);assert.ok(!JSON.stringify(response.body).includes('Private'));
});
test('suspension during password setup denies acceptance and cannot activate an account',async()=>{
  const f=fixture({disabled:true});const response=await f.call();assert.equal(response.status,403);assert.equal(response.body.code,'ACCOUNT_DISABLED');assert.equal(f.accepted,false);assert.equal(f.notices,0);
});
test('notice persistence failure rolls back acceptance and a retry completes once',async()=>{
  const f=fixture({failNotice:true});assert.equal((await f.call()).status,503);assert.equal(f.accepted,false);assert.equal(f.notices,0);
  assert.equal((await f.call()).status,200);assert.equal(f.accepted,true);assert.equal(f.notices,1);
});
