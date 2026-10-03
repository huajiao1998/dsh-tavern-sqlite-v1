// V1只保护上游浏览器写回的回退边界；不执行/分类卡脚本，也不解释MVU数据。
import { rollbackBarrier, rollbackSchedulingBarrier } from './rollback-barrier.js'

// 仅浏览器脚本可能修改状态的Host RPC；读口、心跳及上游服务端模板不受这张表代管。
export const BROWSER_MUTATION_METHODS = new Set([
  'updateTavernHelperPrompts', 'updateTavernHelperVariables', 'updateTavernHelperMessages', 'createTavernHelperMessages',
  'replaceTavernHelperWorldbook', 'saveTavernWorldInfo', 'saveTavernChatData', 'saveTavernExtensionSettings',
])

export function createBrowserRollbackGuard({ dispatch, readLifecycle }) {
  if (typeof dispatch?.dispose !== 'function' || typeof dispatch?.cancelRollbackWork !== 'function' || typeof readLifecycle !== 'function') {
    throw new Error('V1浏览器回退缺少确切租约撤销/生命周期读口')
  }
  const active = new Map()
  function assertOpen(id) {
    if (!id || rollbackBarrier.has(id) || rollbackSchedulingBarrier.has(id)) throw new Error('物理回退期间禁止新浏览器或手动写任务')
  }
  function track(work) {
    return (...args) => {
      const id = String(typeof args[0] === 'object' ? args[0]?.sessionId || '' : args[0] || '')
      try { assertOpen(id) } catch (error) { return Promise.reject(error) }
      const task = Promise.resolve().then(() => { assertOpen(id); return work(...args) })
      if (!active.has(id)) active.set(id, new Set())
      active.get(id).add(task)
      task.finally(() => { const tasks = active.get(id); tasks?.delete(task); if (!tasks?.size) active.delete(id) }).catch(() => {})
      return task
    }
  }
  const guardMutation = track(async (args, work) => {
    const id = String(args?.sessionId || ''), chat = await readLifecycle(id)
    assertOpen(id)
    if (!chat || chat.sessionId !== id || chat.rollbackPending) throw new Error('物理回退未完成或浏览器写回对象已变化')
    // 上游UI手动资源编辑无脚本origin时仍保持其正常契约；脚本转发必须带当前生命周期。
    if (args.apiCallOrigin !== undefined || args.eventId || args.expectedLifecycleRevision !== undefined) {
      const expected = args.expectedLifecycleRevision, current = Number(chat.tavernHelperLifecycleRevision || 0)
      if (!Number.isSafeInteger(expected) || expected < 0 || expected !== current) {
        const error = new Error('浏览器脚本写回属于旧生命周期，回退后的迟到结果已拒绝')
        error.code = 'TAVERN_SCRIPT_ROLLBACK_STALE'
        throw error
      }
    }
    return await work()
  })
  async function whenIdle(id) {
    // 撤销queued/offered/executing及完成收据；旧事件/token不能在新尾部复用。
    dispatch.cancelRollbackWork(id)
    while (active.get(id)?.size) await Promise.allSettled([...active.get(id)])
    dispatch.cancelRollbackWork(id)
  }
  return Object.freeze({ track, guardMutation, whenIdle })
}
