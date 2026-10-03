// 客户端接缝按作者实际include归属施加；不替换整份旧产物，不改变读口/页面协议。
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import {applyClientRollbackTransform} from './core-host-transform.mjs'
import {applyAuthorRollbackActionTransform,applyAuthorRollbackRuntimeTransform} from './rollback-sync-author-transform.mjs'
import {applyClientHistoryAuthorityTransform} from './client-history-authority-transform.mjs'
import {applyRollbackSyncInstallTransform,applyRollbackSyncActionGuardTransform} from './rollback-sync-install-transform.mjs'
import {applyClipboardTransform} from './clipboard-transform.mjs'
export function clientCoreWrites(appDir,{browserWrite}={}){
 const source='tavern-plugin/src/client/',built='tavern-plugin/lib/client.js'
 const read=rel=>readFileSync(path.join(appDir,rel),'utf8'),writes=new Map(),main=read(source+'main.js')
 let bundle=applyRollbackSyncInstallTransform(applyClipboardTransform(applyClientRollbackTransform(read(built))))
 if(browserWrite)bundle=browserWrite(bundle)
 writes.set(built,bundle)
 if(main.includes('// @include features/play-controls.js')){
  for(const rel of ['features/play-controls.js','features/turn-history.js','ui/error-center.js',...(browserWrite?['runtime/helper-script-runtime.js']:[])])if(!existsSync(path.join(appDir,source+rel)))throw Error('拆分客户端缺确切include目标：'+rel)
  writes.set(source+'main.js',applyRollbackSyncInstallTransform(applyAuthorRollbackRuntimeTransform(main),{runtimeOnly:true}))
  writes.set(source+'features/play-controls.js',applyRollbackSyncActionGuardTransform(applyAuthorRollbackActionTransform(read(source+'features/play-controls.js'))))
  writes.set(source+'features/turn-history.js',applyClientHistoryAuthorityTransform(read(source+'features/turn-history.js')))
  writes.set(source+'ui/error-center.js',applyClipboardTransform(read(source+'ui/error-center.js')))
  if(browserWrite)writes.set(source+'runtime/helper-script-runtime.js',browserWrite(read(source+'runtime/helper-script-runtime.js')))
 }else{
  let inline=applyRollbackSyncInstallTransform(applyClipboardTransform(applyClientRollbackTransform(main)))
  if(browserWrite)inline=browserWrite(inline)
  writes.set(source+'main.js',inline)
 }
 return writes
}
