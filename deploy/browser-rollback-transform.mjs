// V1保留作者浏览器执行协议；这里只撤销回退租约、拒绝迟到写回，不改脚本语义。
const DISPATCH_MARKER = '// [dsh-tavern-v1-browser-dispatch-rollback:v1]'
const CLIENT_MARKER = '// [dsh-tavern-v1-browser-write-lifecycle:v1]'
function once(source, old, next, label) {
  if (source.split(old).length !== 2) throw new Error('V1浏览器回退锚点不唯一：' + label)
  return source.replace(old, next)
}
export function applyBrowserDispatchRollbackTransform(source) {
  if (source.includes(DISPATCH_MARKER)) {
    for (const required of ['function cancelRollbackWork(sessionId)', 'blockedForRollback(id)', 'cancelRollbackWork, status']) {
      if (!source.includes(required)) throw new Error('V1浏览器回退标记不完整：' + required)
    }
    return source
  }
  let next = "import { rollbackBarrier, rollbackSchedulingBarrier } from './storage-rollback-business.js'\n" + DISPATCH_MARKER + '\n' + source
  next = once(next, '  const receipts = new Map()', `  const receipts = new Map()
  const blockedForRollback = id => rollbackBarrier.has(id) || rollbackSchedulingBarrier.has(id)
  function cancelRollbackWork(sessionId) {
    const id = str(sessionId)
    dispose(id)
    for (const key of receipts.keys()) if (JSON.parse(key)[0] === id) receipts.delete(key)
  }`, '撤销当前会话工作及已完成收据')
  next = once(next, "    if (id === '' || owner === '') return false", "    if (id === '' || owner === '' || blockedForRollback(id)) return false", '屏障期间心跳不触发就绪重调度')
  next = once(next, '    const current = presence.get(str(sessionId))\n    if (!current ||', '    if (blockedForRollback(str(sessionId))) return false\n    const current = presence.get(str(sessionId))\n    if (!current ||', '屏障期间start与workState不能续旧租约')
  next = once(next, '    if (receipts.has(key)) return true', '    if (blockedForRollback(id)) return false\n    if (receipts.has(key)) return true', '迟到完成回执不命中旧收据')
  next = once(next, "    if (work.signal?.aborted) return { handled: false, disposed: true, args: clone(args) }", "    if (blockedForRollback(id) || work.signal?.aborted) return { handled: false, disposed: true, args: clone(args) }", '屏障期间不排新浏览器工作')
  return once(next, 'subscribeSettled, dispose, status })', 'subscribeSettled, dispose, cancelRollbackWork, status })', '暴露精确撤销入口')
}
export function applyBrowserWriteLifecycleTransform(source) {
  const old = '\t\t\t\t\tif (data.method === "updateTavernHelperPrompts" || data.method === "updateTavernHelperVariables" || data.method === "updateTavernHelperMessages" || data.method === "createTavernHelperMessages") {'
  const replacement = '\t\t\t\t\t' + CLIENT_MARKER + '\n\t\t\t\t\tif (true) { // 所有脚本转发均带生命周期；不改上游手动资源编辑。'
  if (source.includes(CLIENT_MARKER)) {
    if (!source.includes(replacement)) throw new Error('V1浏览器写回生命周期标记不完整')
    return source
  }
  return once(source, old, replacement, '脚本世界书/资源写口也携带生命周期')
}
export function applyBrowserRpcGuardTransform(source) {
  const marker = '// [dsh-tavern-v1-browser-rpc-rollback:v1]'
  if (source.includes(marker)) {
    if (!source.includes('tavernScriptHostAdapter.guardBrowserMutation(args') || !source.includes('async function dispatchMethodNow(')) throw new Error('V1浏览器RPC回退标记不完整')
    return source
  }
  let next = "import { BROWSER_MUTATION_METHODS } from './domain/storage-browser-rollback.js'\n" + marker + '\n' + source
  return once(next, '  async function dispatchMethod(method, args, serverTemplate = false) {', `  async function dispatchMethod(method, args, serverTemplate = false) {
    if (!serverTemplate && BROWSER_MUTATION_METHODS.has(method)) {
      return await tavernScriptHostAdapter.guardBrowserMutation(args, () => dispatchMethodNow(method, args, serverTemplate))
    }
    return await dispatchMethodNow(method, args, serverTemplate)
  }
  async function dispatchMethodNow(method, args, serverTemplate = false) {`, '浏览器所有写回先过精确对象/生命周期门禁')
}
