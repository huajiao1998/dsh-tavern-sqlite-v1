// 作者2.4消费者：push为同步屏障，RPC只等待同一回执；不二次resync或全局invalidate。
import {applyRollbackViewReaderTransform,applyRollbackLiveViewTransform} from './rollback-sync-state-transform.mjs'
const MARKER='// [dsh-tavern-rollback-sync-author:v1]'
const OLD_MARKER='// [dsh-tavern-core-client-resync:v1]'
const ANCHOR='historyProjection.rolledBack(props.sessionId, result && result.view);'
const OLD=`${ANCHOR}\n                    ${OLD_MARKER}\n                    const nativeSession = props.sessions?.binding(props.sessionId)?.session;\n                    if (!nativeSession || typeof nativeSession.resync !== "function") throw new Error("回退已落盘，但当前宿主缺少Session.resync；请重开页面");\n                    await nativeSession.resync();`
const NEXT=`${MARKER}
                    if (typeof props.sessions?.waitForTavernRollbackSync !== "function") throw new Error("回退已落盘，但宿主缺少同连接同步消费者；请重开页面");
                    const receipt = result?.view?.rolledBack?.sync;
                    await props.sessions.waitForTavernRollbackSync(receipt);
                    // 状态只由push后的新读安装；迟到的rollback RPC旧view不能覆盖新生成/手工编辑。`
const EVENT=`const slots = ctx.slots;
            ctx.effect(function () {
                return ctx.on("tavern-storage/rollback-synced", function (receipt) {
                    // 所有页面只刷新被回退的档；其余Session/输入草稿/选择不动。
                    beginSessionViewRead.rebase(receipt.sessionId);
                    liveTavernView.rebase(receipt.sessionId);
                    tavernCoordination.invalidate(receipt.sessionId);
                });
            }, "dsh-tavern: same-connection rollback sync");`
function once(s,a,b){if(s.split(a).length!==2)throw Error('回退同步作者锚点缺失/不唯一：'+a.slice(0,90));return s.replace(a,b)}
function inlineModule(source,name,transform){
 const start=source.indexOf('function '+name+'('),end=source.indexOf('\n\t\tfunction ',start+10)
 if(start<0 || end<start)throw Error('作者内联状态模块边界漂移：'+name)
 const marker=name==='createSessionViewReader'?'// [dsh-tavern-rollback-view-reader:v1]':'// [dsh-tavern-rollback-live-view:v1]'
 const markerStart=source.lastIndexOf(marker,start),begin=markerStart>=0 && source.slice(markerStart+marker.length,start).trim()===''?markerStart:start
 const raw=source.slice(begin,end).replace(/^\t\t/gm,'')
 return source.slice(0,begin)+transform(raw).replace(/\n/g,'\n\t\t')+source.slice(end)
}
export function applyAuthorRollbackActionTransform(source){
 if(source.includes(MARKER)){
  if(source.split(MARKER).length!==2 || !source.includes(NEXT) || source.includes(OLD_MARKER))throw Error('同连接回退按钮消费者不完整')
  return source
 }
 let out=source.includes(OLD_MARKER)?once(source,OLD,NEXT):once(source,ANCHOR,NEXT)
 const start=out.indexOf('async function rollback()',out.indexOf('function TavernRollbackAction(props)')),end=out.indexOf('if (!canRollback) {',start)
 if(start<0 || end<start)throw Error('回退同步callback边界漂移')
 let callback=out.slice(start,end)
 callback=once(callback,'notifyTavernDataChanged(["sessions"], "play-controls");','// 本操作由同连接push定向通知，不再广播全局data-changed。')
 callback=once(callback,'setRolling(false); liveTavernView.invalidate(props.sessionId); tavernCoordination.invalidate(props.sessionId);','setRolling(false);')
 return out.slice(0,start)+callback+out.slice(end)
}
export function applyAuthorRollbackRuntimeTransform(source){
 const marker='// [dsh-tavern-rollback-sync-runtime:v1]'
 if(source.includes(marker)){
  for(const required of [EVENT,'if (active && generation === rollbackGeneration) handlers.message(coordinationView(result, sessionId));','refresh: function () { rollbackGeneration++; return load(); }'])if(!source.includes(required))throw Error('同连接回退运行消费者不完整')
  return source
 }
 let out=once(source,'const slots = ctx.slots;',EVENT)
 out=once(out,'const result = await rpc("syncSession", { kind: "candidate" }, sessionId);\n\t\t\t\t\t\tif (active) handlers.message(coordinationView(result, sessionId));','const result = await rpc("syncSession", { kind: "candidate" }, sessionId);\n\t\t\t\t\t\tif (active && generation === rollbackGeneration) handlers.message(coordinationView(result, sessionId));')
 out=once(out,'let reloadRequested = false;\n\t\t\t\tasync function load() {','let reloadRequested = false;\n                let rollbackGeneration = 0;\n\t\t\t\tasync function load() {')
 out=once(out,'loading = true;\n\t\t\t\t\ttry {\n\t\t\t\t\t\tconst result = await rpc("syncSession"','loading = true;\n                    const generation = rollbackGeneration;\n\t\t\t\t\ttry {\n\t\t\t\t\t\tconst result = await rpc("syncSession"')
 out=once(out,'if (active) handlers.error(error);','if (active && generation === rollbackGeneration) handlers.error(error);')
 out=once(out,'handlers.message(coordinationView(signal.snapshot, sessionId));','if (rollbackGeneration === 0) handlers.message(coordinationView(signal.snapshot, sessionId)); else void load();')
 return marker+'\n'+once(out,'return { close: function () { active = false; stop(); }, refresh: load };','return { close: function () { active = false; stop(); }, refresh: function () { rollbackGeneration++; return load(); } };')
}
export function applyAuthorRollbackSyncTransform(source){
 const built=source.includes('function createLiveTavernViewModule(options)')
 if(source.includes(MARKER)){
  if(source.split(MARKER).length!==2 || !source.includes(NEXT) || !source.includes(EVENT) || source.includes(OLD_MARKER) || !source.includes('if (active && generation === rollbackGeneration) handlers.message(coordinationView(result, sessionId));') || !source.includes('refresh: function () { rollbackGeneration++; return load(); }') || (built && (!source.includes('begin.rebase = function') || !source.includes('rebase: function (sessionId)'))))throw Error('同连接回退作者消费者不完整')
  if(built){inlineModule(source,'createSessionViewReader',applyRollbackViewReaderTransform);inlineModule(source,'createLiveTavernViewModule',applyRollbackLiveViewTransform)}
  return source
 }
 let out=source
 if(out.includes(OLD_MARKER))out=once(out,OLD,NEXT)
 else out=once(out,ANCHOR,NEXT)
 out=once(out,'const slots = ctx.slots;',EVENT)
 const start=out.indexOf('async function rollback()',out.indexOf('function TavernRollbackAction(props)')),end=out.indexOf('if (!canRollback) {',start)
 if(start<0 || end<start)throw Error('回退同步callback边界漂移')
 let callback=out.slice(start,end)
 callback=once(callback,'notifyTavernDataChanged(["sessions"], "play-controls");','// 本操作由同连接push定向通知，不再广播全局data-changed。')
 callback=once(callback,'setRolling(false); liveTavernView.invalidate(props.sessionId); tavernCoordination.invalidate(props.sessionId);','setRolling(false);')
 out=out.slice(0,start)+callback+out.slice(end)
 if(built){
  out=inlineModule(out,'createSessionViewReader',applyRollbackViewReaderTransform)
  out=inlineModule(out,'createLiveTavernViewModule',applyRollbackLiveViewTransform)
 }else if(!out.includes('// @include modules/session-view-sync.js') || !out.includes('// @include modules/live-tavern-view.js'))throw Error('作者状态模块include布局未知')
 // coordination旧syncSession晚到不得显示旧任务；副作用业务RPC不重发。
 out=once(out,'const result = await rpc("syncSession", { kind: "candidate" }, sessionId);\n\t\t\t\t\t\tif (active) handlers.message(coordinationView(result, sessionId));','const result = await rpc("syncSession", { kind: "candidate" }, sessionId);\n\t\t\t\t\t\tif (active && generation === rollbackGeneration) handlers.message(coordinationView(result, sessionId));')
 out=once(out,'let reloadRequested = false;\n\t\t\t\tasync function load() {','let reloadRequested = false;\n                let rollbackGeneration = 0;\n\t\t\t\tasync function load() {')
 out=once(out,'loading = true;\n\t\t\t\t\ttry {\n\t\t\t\t\t\tconst result = await rpc("syncSession"','loading = true;\n                    const generation = rollbackGeneration;\n\t\t\t\t\ttry {\n\t\t\t\t\t\tconst result = await rpc("syncSession"')
 out=once(out,'if (active) handlers.error(error);','if (active && generation === rollbackGeneration) handlers.error(error);')
 // 独立signal流可能晚到旧snapshot；刷新世代建立后只唤醒权威读，不覆盖回退后的面板。
 out=once(out,'handlers.message(coordinationView(signal.snapshot, sessionId));','if (rollbackGeneration === 0) handlers.message(coordinationView(signal.snapshot, sessionId)); else void load();')
 out=once(out,'return { close: function () { active = false; stop(); }, refresh: load };','return { close: function () { active = false; stop(); }, refresh: function () { rollbackGeneration++; return load(); } };')
 return out
}
export function applyRollbackSyncHostTransform(source){
 const old="    webServerProvider: () => ctx.get('webServer'),"
 const next="    rollbackSyncProvider: () => ctx.get('tavernRollbackSync'),"
 if(source.includes(next)){if(source.split(next).length!==2 || source.includes(old))throw Error('同连接Host接线不完整');return source}
 return once(source,old,next)
}
