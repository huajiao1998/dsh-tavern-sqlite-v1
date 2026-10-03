// V1核心接线只拥有SQL读写/回退；MVU、卡脚本筛选与执行仍走作者浏览器路径。
import { applyClientHistoryAuthorityTransform } from './client-history-authority-transform.mjs'
import { applyAuthorRollbackSyncTransform } from './rollback-sync-author-transform.mjs'
export const CORE_HOST_MARKER = '// [dsh-tavern-v1-storage-host:v1]'
function once(text, before, after, label) {
  const count = text.split(before).length - 1
  if (count !== 1) throw new Error('核心接入锚点不唯一：' + label + '（' + count + '）')
  return text.replace(before, after)
}
export function applyHostTransform(source) {
  if (source.includes('createServerDispatchStore') || source.includes('storageBrowserScripts') || source.includes('// [dsh-tavern-core-host:v1]')) {
    throw new Error('V1不覆盖完整功能线执行接缝；请使用作者2.4原树和V1标准装配')
  }
  if (source.includes(CORE_HOST_MARKER)) {
    for (const required of ['variableSqliteStore = chatJournalStore.variables', 'persistenceProvider: () =>']) {
      if (!source.includes(required)) throw new Error('V1存储Host标记存在但消费者缺失：' + required)
    }
    return applyVariableConsumerTransform(source)
  }
  let next = CORE_HOST_MARKER + '\n' + source
  next = once(next, '  const chatPersistence = createChatPersistence(',
    "  const variableSqliteStore = chatJournalStore.variables\n  if (!variableSqliteStore) throw new Error('核心接入缺少变量SQLite消费者')\n  ctx.effect(() => () => chatJournalStore.dispose(), 'dsh-tavern: SQLite资源释放')\n  const chatPersistence = createChatPersistence(", '变量消费者')
  next = once(next, '    scriptDispatch: tavernScriptDispatch,', `    scriptDispatch: tavernScriptDispatch,
    readRollbackLifecycle: async sessionId => {
      const chatId = (await readSessionMap())[sessionId]
      if (!chatId) return undefined
      const selected = await chatPersistence.readSlice(chatId, [], ['id', 'sessionId', 'tavernHelperLifecycleRevision', 'rollbackPending'])
      return selected?.chat
    },`, '浏览器写回只读SQL生命周期')
  next = once(next, 'readRevision: readChatRevision, write: writeChat, update: updateChat },\n    sessions:',
    'readRevision: readChatRevision, write: writeChat, update: updateChat, readSlice: chatPersistence.readSlice },\n    sessions:', '回退head行键读接口')
  next = once(next, '    sessionPatch,\n  })\n\n  const bodyEditor',
    "    sessionPatch,\n    variableStore: variableSqliteStore,\n    persistenceProvider: () => ctx.get('sessionPersistence'),\n    projectionsProvider: () => ctx.get('sessionProjections'),\n    projectionCacheProvider: () => ctx.get('sessionProjectionCache'),\n    tokenMeterProvider: () => ctx.get('tokenMeter'),\n    webServerProvider: () => ctx.get('webServer'),\n  })\n\n  const bodyEditor", '完整回退实时服务')
  return applyVariableConsumerTransform(next)
}

export function applyVariableConsumerTransform(source) {
  const marker = '// [dsh-tavern-current-variables:v1]'
  if (source.includes(marker)) {
    for (const required of ['const currentVariablesOf = createCurrentVariableReader(', 'readSnapshot: readCurrentVariableSnapshot', '    currentVariablesOf,']) {
      if (!source.includes(required)) throw new Error('当前变量标记存在但消费者缺失：' + required)
    }
    return source
  }
  let next = "import { createCurrentVariableReader } from './domain/storage-current-variables.js'\n" + marker + '\n' + source
  next = once(next, '  const variableSqliteStore = chatJournalStore.variables',
    '  const readCurrentVariableSnapshot = chat => chatJournalStore.readCurrentVariableSnapshot(chat)\n  const currentVariablesOf = createCurrentVariableReader({ lastVariables: lastTavernHelperVariables, readSnapshot: readCurrentVariableSnapshot })\n  const variableSqliteStore = chatJournalStore.variables', '当前变量同revision兜底')
  for (const old of ['lastTavernHelperVariables(recent.chat.messages)', 'lastTavernHelperVariables(chat.messages)']) {
    if (!next.includes(old)) throw new Error('当前变量作者调用锚点缺失：' + old)
    next = next.split(old).join(old.includes('recent.chat') ? 'currentVariablesOf(recent.chat)' : 'currentVariablesOf(chat)')
  }
  next = once(next, '    resolveChat: chatForSession,', '    currentVariablesOf,\n    resolveChat: chatForSession,', '临时上下文SQL读口')
  next = once(next, 'registerVariableReadTool({tools,defineTool,chatForSession})',
    'registerVariableReadTool({tools,defineTool,chatForSession,readSnapshot: readCurrentVariableSnapshot})', '前台查询兜底')
  return next
}
export function applyHelperCurrentTransform(source) {
  const marker = '// [dsh-tavern-helper-current-variables:v1]'
  const anchor = '      const previousVariables = lastTavernHelperVariables(draft.messages)'
  const next = '      const previousVariables = typeof options.currentVariablesOf === "function"\n        ? options.currentVariablesOf(draft) : lastTavernHelperVariables(draft.messages)'
  if (source.includes(marker)) {
    if (!source.includes(next)) throw new Error('Helper当前变量标记存在但消费者缺失')
    return source
  }
  return marker + '\n' + once(source, anchor, next, '临时用户楼继承当前SQL变量')
}
export function applyBudgetTransform(source, target) {
  const marker = '// [dsh-tavern-core-budget:v1:' + target + ']'
  if (source.includes(marker)) return source
  if (target === 'dispatch') return "import { BUDGETS } from './storage-budgets.js'\n" + marker + '\n' + once(source,
    'export const TAVERN_SCRIPT_CLAIM_TIMEOUT_MS = 30000', 'export const TAVERN_SCRIPT_CLAIM_TIMEOUT_MS = BUDGETS.scriptClaimMs', '浏览器脚本认领预算')
  if (target === 'template') return "import { BUDGETS } from './storage-budgets.js'\n" + marker + '\n' + once(source,
    'timeoutMs = 120000, idleMs = 600000', 'timeoutMs = BUDGETS.serverTemplateMs, idleMs = 600000', '作者服务端模板预算')
  throw new Error('未知预算消费者：' + target)
}
export function applyClientRollbackTransform(source) {
  return applyClientHistoryAuthorityTransform(applyAuthorRollbackSyncTransform(source))
}
