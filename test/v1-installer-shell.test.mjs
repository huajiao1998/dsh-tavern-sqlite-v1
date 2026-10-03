// Git Bash仅验证SH获取链，不安装Host；原创微型包报告参数和计时。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
const sourceRoot=path.resolve('.'),script=path.join(sourceRoot,'deploy','install.sh')
test('真实SH本地包入口及sh -s流水入口参数正确、没有下载',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'v1-sh-test-')),home=path.join(root,'home'),pkg=path.join(root,'offline'),profile=path.join(home,'profiles','tavern')
 try{
  fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'package.json'),'{}','utf8');fs.mkdirSync(path.join(pkg,'deploy','maintenance'),{recursive:true})
  fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'dsh-tavern-storage-sqlite-v1',dependencies:{},files:['index.js','cordis.patch.yml','deploy/**']}),'utf8')
  for(const rel of ['index.js','cordis.patch.yml','deploy/maintenance/runner.mjs','deploy/maintenance/source.mjs','deploy/maintenance/driver.mjs'])fs.writeFileSync(path.join(pkg,rel),'// fixture\n','utf8')
  fs.writeFileSync(path.join(pkg,'deploy','maintenance.mjs'),"console.log('SH_FIXTURE_OK '+JSON.stringify(process.argv.slice(2)))\n",'utf8')
  const args=['install','--home',home,'--package',pkg],env={...process.env,MSYS_NO_PATHCONV:'1',DSH_STORAGE_RELEASE_URL:'invalid-network-must-not-be-used',DSH_STORAGE_RELEASE_SHA256:'invalid'}
  for(const piped of [false,true]){
   const result=spawnSync('bash',['-c','exec sh "$@"','v1-sh-test',...(piped?['-s','--',...args]:[script,...args])],{input:piped?fs.readFileSync(script,'utf8'):undefined,env,encoding:'utf8',timeout:5000})
   assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/SH_FIXTURE_OK/);assert.match(result.stdout,/--elapsed/);assert.ok(!result.stdout.includes('下载固定发行包'))
  }
 }finally{assert.ok(root.startsWith(path.join(os.tmpdir(),'v1-sh-test-')));fs.rmSync(root,{recursive:true,force:true})}
})
