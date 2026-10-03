// 真实driver配原创进程/systemd/包管理替身，零真实Host/存档/停启。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDriver } from '../deploy/maintenance/driver.mjs'
import { maintenanceBudget } from '../deploy/maintenance/budget.mjs'
const name='dsh-tavern-storage-sqlite-v1'
for(const running of [false,true])test('V1真实driver '+(running?'运行中systemd自动识别/停启/401基础验收':'停止态离线原profile装卸且不start'),async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'v1-driver-')),home=path.join(root,'home'),app=path.join(home,'apps','dsh-tavern'),profileDir=path.join(home,'profiles','tavern'),packageRoot=path.join(root,'package'),evidence=path.join(root,'evidence')
 try{
  fs.mkdirSync(path.join(app,'tavern-plugin'),{recursive:true});fs.mkdirSync(path.join(profileDir,'node_modules'),{recursive:true});fs.mkdirSync(packageRoot);fs.mkdirSync(evidence)
  const before={dependencies:{author:'link:../../apps/dsh-tavern/tavern-plugin'},dsh:{profile:{bundles:['author']}}};fs.writeFileSync(path.join(profileDir,'package.json'),JSON.stringify(before),'utf8');fs.writeFileSync(path.join(profileDir,'cordis.patch.yml'),'[]\n','utf8');fs.writeFileSync(path.join(app,'tavern-plugin','package.json'),JSON.stringify({name:'dsh-tavern-plugin',version:'2.4.0'}),'utf8');fs.writeFileSync(path.join(packageRoot,'package.json'),JSON.stringify({name,dependencies:{},files:[]}),'utf8')
  const cli=path.join(home,'runtime','bin','dsh'),argv=['/fixture/node',cli,'--profile','tavern','--host','127.0.0.1','--port','4099','--no-open']
  let live=running?{pid:17,start:'old',argv,cwd:app,port:4099,host:'127.0.0.1',env:{PATH:'/fixture/bin',DSH_HOME:home},cgroup:'0::/system.slice/tavern.service'}:null;const events=[]
  const show=()=>`MainPID=${live?.pid||0}\nType=simple\nKillMode=control-group\nExecStart={ path=/fixture/node ; argv[]=${argv.join(' ')} ; }\nWorkingDirectory=${app}\nFragmentPath=/etc/systemd/system/tavern.service\nRestart=on-failure\nActiveState=${live?'active':'inactive'}\n`
  const driver=createDriver({home,app,profile:'tavern',profileDir},{packageName:name,checkStandardSeams:()=>({ready:true})},packageRoot,evidence,maintenanceBudget(),{
   runtimeResolver:()=>({cli,cliEntries:[cli]}),alive:pid=>live?.pid===pid,portOpen:async()=>false,processFinder:()=>live,processReader:pid=>live?.pid===pid?live:null,
   runCommand:(exe,args)=>{assert.equal(exe,'systemctl');if(args[0]==='show')return show();events.push(args[0]);if(args[0]==='stop')live=null;else if(args[0]==='start')live={pid:18,start:'new',argv,cwd:app,port:4099,host:'127.0.0.1',env:{PATH:'/fixture/bin',DSH_HOME:home},cgroup:'0::/system.slice/tavern.service'};else throw Error('未知系统动作');return ''},
   runPackage:async(exe,args,settings)=>{
    assert.ok(settings.timeout<=18000);assert.equal(settings.env.pnpm_config_offline,'true')
    if(args[1]!=='plugin'){events.push('probe');return}
    assert.equal(args[0],cli);assert.equal(args[2],'--profile');assert.equal(args[3],'tavern');assert.ok(args.includes('--offline'));assert.ok(args.includes('--ignore-scripts'));assert.ok(args.includes('--config.auto-install-peers=false'));assert.equal(settings.cwd,app)
    const mode=args[4];events.push(mode);const installed=path.join(profileDir,'node_modules',name)
    if(mode==='add'){const pkg=JSON.parse(fs.readFileSync(path.join(profileDir,'package.json'),'utf8'));pkg.dependencies[name]='file:'+packageRoot;pkg.dsh.profile.bundles.push(name);fs.writeFileSync(path.join(profileDir,'package.json'),JSON.stringify(pkg),'utf8');fs.mkdirSync(installed);fs.copyFileSync(path.join(packageRoot,'package.json'),path.join(installed,'package.json'))}
    else{fs.writeFileSync(path.join(profileDir,'package.json'),JSON.stringify(before),'utf8');assert.ok(installed.startsWith(root+path.sep));fs.rmSync(installed,{recursive:true})}
   },request:async(_url,settings)=>{assert.equal(settings.method,'HEAD');assert.equal(settings.redirect,'manual');assert.equal(live.pid,18);return {status:401}},
  })
  const state=await driver.preflight('install');assert.equal(state.wasRunning,running);await driver.assertIdentity();if(running)await driver.stop();else await driver.assertStopped();await driver.manage('install');let fresh;if(running)fresh=await driver.start();const proof=await driver.verify('install',{}, {process:fresh});assert.equal(proof.runtimeVerified,false)
  if(running){assert.deepEqual(events.filter(s=>s!=='probe'),['stop','add','start']);assert.equal(proof.basicHealthVerified,true);await driver.stop(fresh)}else{assert.equal(live,null);assert.deepEqual(events.filter(s=>s!=='probe'),['add'])}
  await driver.manage('uninstall');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profileDir,'package.json'),'utf8')),before);assert.equal(fs.existsSync(path.join(evidence,'dependency-rehearsal')),false)
  if(!running){await assert.rejects(driver.start(),/原本停止/);await driver.assertStopped()}
  else {live={pid:18,start:'new',argv,cwd:app,port:4099,host:'127.0.0.1',env:{PATH:'/fixture/bin',DSH_HOME:home},cgroup:'0::/system.slice/tavern.service'};await assert.rejects(driver.stopIfAlive({...live,start:'different'}),/变化/);assert.ok(live,'错误代次不停止真实目标') }
 }finally{assert.ok(root.startsWith(path.join(os.tmpdir(),'v1-driver-')));fs.rmSync(root,{recursive:true,force:true})}
})
