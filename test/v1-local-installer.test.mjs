// V1新安装器定向闸：原创目标/时钟/网络，不读真实业务、不SSH、不调用模型。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { options, packagePolicyArgs } from '../deploy/maintenance/target.mjs'
import { invocation, parseEnvironment, sameProcess, darwinArgumentsFromText } from '../deploy/maintenance/process.mjs'
import { maintenanceBudget } from '../deploy/maintenance/budget.mjs'
import { basicHttpStatus } from '../deploy/maintenance/driver.mjs'
import { selectLocal, downloadArchive, unpackArchive, bootstrap, validatePackage } from '../deploy/bootstrap.mjs'
const base = new URL('../', import.meta.url)
function fixture() { return fs.mkdtempSync(path.join(os.tmpdir(), 'v1-local-installer-')) }
function clean(root) { assert.ok(root.startsWith(path.join(os.tmpdir(), 'v1-local-installer-'))); fs.rmSync(root, { recursive: true, force: true }) }
function tinyPackage(dir) {
  fs.mkdirSync(path.join(dir, 'deploy', 'maintenance'), { recursive: true })
  const manifest = { name: 'dsh-tavern-storage-sqlite-v1', version: '0.1.0', dependencies: {}, files: ['deploy/**', 'index.js', 'cordis.patch.yml'] }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest), 'utf8')
  for (const rel of ['deploy/maintenance.mjs', 'deploy/maintenance/runner.mjs', 'deploy/maintenance/source.mjs', 'deploy/maintenance/driver.mjs', 'index.js', 'cordis.patch.yml']) fs.writeFileSync(path.join(dir, rel), '// fixture\n', 'utf8')
}
function tar(entries) {
  const blocks = []
  for (const { name, body = '', type = '0' } of entries) {
    const bytes = Buffer.from(body), head = Buffer.alloc(512)
    head.write(name, 0, 100, 'utf8'); head.write('0000600\0', 100); head.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); head.write(type, 156); head.fill(32, 148, 156)
    const sum = head.reduce((a, b) => a + b, 0); head.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
    blocks.push(head, bytes, Buffer.alloc((512 - bytes.length % 512) % 512))
  }
  blocks.push(Buffer.alloc(1024)); return gzipSync(Buffer.concat(blocks))
}
test('本地完整包/显式tgz/脚本旁包/缓存/已装卸载优先，缺包才下载', async () => {
  const root = fixture()
  try {
    const pkg = path.join(root, 'package'); tinyPackage(pkg)
    assert.equal(selectLocal({ action: 'install', local: pkg, version: '0.1.0' }).file, pkg)
    assert.equal(selectLocal({ action: 'install', scriptDir: path.join(pkg, 'deploy'), version: '0.1.0' }).file, pkg)
    assert.equal(selectLocal({ action: 'uninstall', installed: pkg, cwd: root, version: '0.1.0' }).file, pkg)
    assert.equal(selectLocal({ action: 'uninstall', cwd: root, version: '0.1.0' }).kind, 'absent')
    assert.throws(() => selectLocal({ action: 'install', local: path.join(root, 'missing') }), /不存在/)
    const cache = path.join(root, 'cache'); fs.mkdirSync(cache)
    const file = path.join(cache, 'dsh-tavern-storage-sqlite-v1-0.1.0.tgz'); fs.writeFileSync(file, 'synthetic', 'utf8')
    const empty=path.join(root,'empty');fs.mkdirSync(empty)
    assert.equal(selectLocal({ action: 'install', cwd: empty, cache, version: '0.1.0' }).file, file)
    assert.equal(selectLocal({ action: 'install', cwd: empty, version: '0.1.0' }), null)
    const home = path.join(root, 'home'), profile = path.join(home, 'profiles', 'tavern'); fs.mkdirSync(profile, { recursive: true }); fs.writeFileSync(path.join(profile, 'package.json'), '{}', 'utf8')
    let invoked = 0
    const env = { DSH_STORAGE_RELEASE_VERSION: '0.1.0' }
    const rc = await bootstrap(['install', '--home', home, '--package', pkg], { env, request: () => { throw Error('本地包禁止网络') }, invoke: (_node, argv) => { invoked++; assert.equal(argv[1], 'install'); assert.ok(argv.includes('--elapsed')); return 0 } })
    assert.equal(rc, 0); assert.equal(invoked, 1)
    const uninstall = await bootstrap(['uninstall', '--home', home], { env, request: () => { throw Error('卸载禁止网络') }, invoke: () => { throw Error('未安装不应执行') } })
    assert.equal(uninstall, 0)
    fs.unlinkSync(path.join(pkg,'deploy','maintenance','driver.mjs'));await assert.rejects(bootstrap(['install','--home',home,'--package',pkg],{env,invoke:()=>{throw Error('不得调用旧认证执行器')}}),/旧代执行器/)
    fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({dependencies:{'dsh-tavern-storage-sqlite-v1':'file:missing'},dsh:{profile:{bundles:['dsh-tavern-storage-sqlite-v1']}}}),'utf8')
    await assert.rejects(bootstrap(['uninstall','--home',home],{env,request:()=>{throw Error('不应联网')}}),/不一致/)
  } finally { clean(root) }
})
test('固定发行下载摘要、HTTPS、大小边界；损坏本地tgz不联网覆盖', async () => {
  const root = fixture()
  try {
    const bytes = Buffer.from('synthetic archive'), digest = createHash('sha256').update(bytes).digest('hex'), file = path.join(root, 'download.tgz')
    let calls = 0
    await downloadArchive('https://github.com/example/repo/releases/download/v0.1.0/a.tgz', digest, file, { request: async (_url, settings) => { calls++; assert.ok(settings.signal); return { ok: true, body: (async function* () { yield bytes })() } } })
    assert.equal(calls, 1); assert.deepEqual(fs.readFileSync(file), bytes)
    await assert.rejects(downloadArchive('http://example/a', digest, file), /固定/)
    await assert.rejects(downloadArchive('https://example/a', '0'.repeat(64), path.join(root, 'bad.tgz'), { request: async () => ({ ok: true, body: (async function* () { yield bytes })() }) }), /SHA256/)
    assert.equal(fs.existsSync(path.join(root, 'bad.tgz')), false)
    await assert.rejects(downloadArchive('https://example/too-large','0'.repeat(64),path.join(root,'large.tgz'),{request:async()=>({ok:true,body:(async function*(){yield Buffer.alloc(16*1024*1024+1)})()})}),/16MiB/)
    assert.equal(fs.existsSync(path.join(root,'large.tgz')),false)
  } finally { clean(root) }
})
test('tgz只能解普通package路径，拒绝越界/链接/重复/摘要错/不完整', () => {
  const root = fixture()
  try {
    for (const entry of [{ name: 'package/../../escape' }, { name: 'package/link', type: '2' }, { name: 'package/absolute', type: 'x' }]) {
      const file = path.join(root, 'bad.tgz'); fs.writeFileSync(file, tar([entry])); assert.throws(() => unpackArchive(file, path.join(root, 'out')), /越界|链接|特殊/)
    }
    const file = path.join(root, 'repeat.tgz'); fs.writeFileSync(file, tar([{ name: 'package/one' }, { name: 'package/one' }])); assert.throws(() => unpackArchive(file, path.join(root, 'duplicate')), /重复/)
    assert.throws(() => unpackArchive(file, path.join(root, 'hash'), '0'.repeat(64)), /摘要/)
    const corrupt=path.join(root,'checksum.tgz'),compressed=tar([{name:'package/one'}]);compressed[10]^=1;fs.writeFileSync(corrupt,compressed);assert.throws(()=>unpackArchive(corrupt,path.join(root,'checksum')))
    const oversized=path.join(root,'oversized.tgz');fs.writeFileSync(oversized,Buffer.alloc(16*1024*1024+1));assert.throws(()=>unpackArchive(oversized,path.join(root,'oversized')),/16MiB/)
    const incomplete = path.join(root, 'incomplete'); tinyPackage(incomplete); fs.unlinkSync(path.join(incomplete, 'index.js')); assert.throws(() => validatePackage(incomplete), /不完整/)
  } finally { clean(root) }
})
test('下载完整闭环只拉一次，准备后离线调用；第二次复用缓存',async()=>{
 const root=fixture(),priorCwd=process.cwd()
 try{
  const home=path.join(root,'home');fs.mkdirSync(path.join(home,'profiles','tavern'),{recursive:true});fs.writeFileSync(path.join(home,'profiles','tavern','package.json'),'{}','utf8')
  const manifest={name:'dsh-tavern-storage-sqlite-v1',version:'0.1.0',dependencies:{},files:['deploy/**','index.js','cordis.patch.yml']}
  const bytes=tar([{name:'package/package.json',body:JSON.stringify(manifest)},...['deploy/maintenance.mjs','deploy/maintenance/runner.mjs','deploy/maintenance/source.mjs','deploy/maintenance/driver.mjs','index.js','cordis.patch.yml'].map(rel=>({name:'package/'+rel,body:'// fixture\n'}))])
  const env={DSH_STORAGE_RELEASE_VERSION:'0.1.0',DSH_STORAGE_RELEASE_URL:'https://github.com/example/repo/releases/download/v0.1.0/a.tgz',DSH_STORAGE_RELEASE_SHA256:createHash('sha256').update(bytes).digest('hex'),XDG_CACHE_HOME:path.join(root,'cache')}
  process.chdir(root);let requests=0,invocations=0;const extracted=[];const opts={env,request:async()=>{requests++;return {ok:true,body:(async function*(){yield bytes})()}},invoke:(_node,argv)=>{invocations++;extracted.push(path.dirname(path.dirname(argv[0])));assert.equal(argv[1],'install');assert.ok(Number(argv.at(-1))<60000);assert.ok(!argv.includes('--online'));return 0}}
  assert.equal(await bootstrap(['install','--home',home],opts),0);assert.equal(requests,1);assert.equal(await bootstrap(['install','--home',home],{...opts,request:()=>{throw Error('缓存禁止网络')}}),0);assert.equal(invocations,2);for(const dir of extracted)assert.equal(fs.existsSync(dir),false,'本次解包临时目录应在执行器完成后清理')
 }finally{process.chdir(priorCwd);clean(root)}
})
test('停止态不需要端口；多目录拒绝；参数不给联网或凭证入口', () => {
  const root = fixture()
  try {
    const home = path.join(root, 'home'), profile = path.join(home, 'profiles', 'tavern'), app = path.join(home, 'apps', 'dsh-tavern')
    fs.mkdirSync(path.join(profile, 'node_modules'), { recursive: true }); fs.mkdirSync(path.join(app, 'tavern-plugin'), { recursive: true }); fs.writeFileSync(path.join(profile, 'package.json'), '{}', 'utf8')
    fs.symlinkSync(path.join(app, 'tavern-plugin'), path.join(profile, 'node_modules', 'dsh-tavern-plugin'), 'junction')
    const op = options(['install', '--home', home], { cwd: root, env: {}, userHome: root })
    assert.equal(op.port, undefined); assert.equal(op.apply, true); assert.equal(op.app, fs.realpathSync(app))
    assert.deepEqual(packagePolicyArgs({ online: true }), ['--offline', '--ignore-scripts', '--config.auto-install-peers=false'])
    assert.throws(() => options(['install', '--home', home, '--online'], { env: {} }), /未知/)
    assert.throws(() => options(['install', '--home', home, '--port', '65536'], { env: {} }), /端口/)
    const other=path.join(root,'other');fs.mkdirSync(path.join(other,'profiles','tavern'),{recursive:true});fs.writeFileSync(path.join(other,'profiles','tavern','package.json'),'{}','utf8')
    assert.throws(()=>options(['install'],{cwd:root,env:{DSH_HOME:home,DSH_TAVERN_CLI_HOME:other},userHome:root}),/多个/)
    assert.throws(()=>options(['install','--home',home,'--profile','web'],{env:{}}),/仅适配tavern/)
  } finally { clean(root) }
})
test('3091/任意端口/IPv6参数身份完整，PID代次及环境解析不误认', () => {
  const target = { cliEntries: ['/fixture/runtime/bin/dsh'], profile: 'tavern' }
  for (const host of ['127.0.0.1', '0.0.0.0', '::1', '::']) {
    const argv = ['/node', '/fixture/runtime/bin/dsh', '--profile', 'tavern', '--host', host, '--port', '3091', '--no-open']
    assert.deepEqual(invocation(argv, target), { host, port: 3091 })
    assert.throws(() => invocation(argv, { ...target, port: 3081 }), /端口/)
    assert.throws(() => invocation([...argv, '--unknown'], target), /不支持/)
  }
  const macTarget={...target,cliEntries:['/Volumes/My Tavern/runtime/bin/dsh']},macText='/Applications/Node Runtime/node --experimental-vm-modules /Volumes/My Tavern/runtime/bin/dsh --profile tavern --host 127.0.0.1 --port 4099 --no-open'
  const macArgv=darwinArgumentsFromText(macText,macTarget);assert.equal(macArgv[0],'/Applications/Node Runtime/node');assert.deepEqual(invocation(macArgv,macTarget),{port:4099,host:'127.0.0.1'})
  assert.equal(invocation(['/other', '--profile', 'tavern'], target), null)
  const current = { pid: 1, start: 'a', cwd: '/fixture', argv: ['node'] }; assert.doesNotThrow(() => sameProcess(current, { ...current })); assert.throws(() => sameProcess(current, { ...current, start: 'b' }), /变化/)
  assert.deepEqual(parseEnvironment('PATH=/a:/b DSH_HOME=/path with space USER=test'), { PATH: '/a:/b', DSH_HOME: '/path with space', USER: 'test' })
})
test('统一60秒时钟与无凭证基础健康，V1不调用依赖预演/认证/launcher', () => {
  let now = 0; const b = maintenanceBudget({ now: () => now }); assert.equal(b.remaining(18000), 18000); now = 59000; assert.equal(b.remaining(18000), 1000); now = 60000; assert.throws(() => b.remaining(), /60秒/)
  for (const status of [200, 302, 303, 401, 403]) assert.equal(basicHttpStatus({ status }), true)
  assert.equal(basicHttpStatus({ status: 500 }), false)
  const runner = fs.readFileSync(new URL('deploy/maintenance/runner.mjs', base), 'utf8'), driver = fs.readFileSync(new URL('deploy/maintenance/driver.mjs', base), 'utf8')
  assert.ok(!runner.includes('dependency-rehearsal')); assert.ok(!runner.includes('authenticatedRuntime')); assert.ok(!driver.includes('maintenanceCredentials'))
  assert.ok(driver.includes("'plugin', '--profile'")); assert.ok(driver.includes('...packagePolicyArgs()')); assert.ok(!driver.includes('dsh-tavern.mjs'))
})
