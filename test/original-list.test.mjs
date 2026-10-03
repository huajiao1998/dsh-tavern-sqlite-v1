import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import {zstdCompressSync} from 'node:zlib'
import {fileURLToPath} from 'node:url'
test('普通原档header进入宿主目录且原件/links不变，不读同ID影子',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-original-list-')),old=process.env.DSH_HOME
 try{
  process.env.DSH_HOME=root;const data=path.join(root,'profile-data/tavern/data'),native=path.join(root,'native');fs.mkdirSync(path.join(data,'chats'),{recursive:true});fs.mkdirSync(native)
  const links=path.join(data,'sessions.json');fs.writeFileSync(links,JSON.stringify({'session-original':'chat-original'}),'utf8');const before=fs.readFileSync(links);fs.writeFileSync(path.join(data,'chats/chat-original.json'),'不读正文','utf8')
  const header={id:'session-original',version:3,createdAt:1,cwd:'/fixture',isSeeded:false},file=path.join(native,'project/session-original/session.v3.jsonl.zstd');fs.mkdirSync(path.dirname(file),{recursive:true});const bytes=Buffer.concat([zstdCompressSync(Buffer.from(JSON.stringify(header)+'\n')),Buffer.from([0x28,0xb5,0x2f,0xfd,0xff])]);fs.writeFileSync(file,bytes);fs.writeFileSync(path.join(native,'session-original.db'),'不能打开影子','utf8')
  const state=await import('../lib/tavern-chat-state.js'),reader=await import('../lib/legacy-session-reader.js');assert.deepEqual(state.listLinkedLegacySessionIds(),['session-original'])
  const source=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8'),start=source.indexOf('\tasync list(options) {'),end=source.indexOf('\n\t// ---------- T3',start);assert.ok(start>=0&&end>start)
  const Impl=vm.runInNewContext('(class {'+source.slice(start,end)+'})',{...state,...reader,listLegacyBindings:()=>[],readdirSync:fs.readdirSync,SessionPersistenceRevision:x=>x,console,process})
  const backend=new Impl();backend.root=native;backend.generationFormat={createRestore:h=>({header:h,decodeRow(){assert.fail('不解码正文')},finish(){assert.fail('不恢复正文')}})};backend.tracker={pendingEntries:()=>[]};backend.store={openExisting(){assert.fail('不打开影子')}}
  const items=await backend.list();assert.equal(items.length,1);assert.equal(items[0].header.id,header.id);assert.equal(items[0].eventCount,undefined);assert.deepEqual(fs.readFileSync(file),bytes);assert.deepEqual(fs.readFileSync(links),before)
 }finally{if(old===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=old;assert.ok(root.startsWith(path.join(os.tmpdir(),'public-original-list-')));fs.rmSync(root,{recursive:true,force:true})}
})
