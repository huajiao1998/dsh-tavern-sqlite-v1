// 分叉首次publish之前核继承前缀；不改源Chat、不改官方fork或事件日志。
const marker = '// [dsh-tavern-fork-history-markers:v1]'
const original = "    const fork = forkConversationChat(state, { chatId: uid('chat'), sessionId: targetId, id: uid, now: Date.now })"
const next = "    " + marker + "\n    const fork = normalizeForkHistoryMarkers(forkConversationChat(state, { chatId: uid('chat'), sessionId: targetId, id: uid, now: Date.now }), sessionEvents(target), atSeq)"
const imported = "import { normalizeForkHistoryMarkers } from './domain/storage-fork-history.js'\n"
export function applyForkHistoryTransform(source) {
  if (source.includes(marker)) {
    if (!source.includes(next) || !source.includes(imported)) throw new Error('分叉历史接缝发生漂移')
    return source
  }
  if (source.split(original).length !== 2 || source.includes('normalizeForkHistoryMarkers')) throw new Error('分叉历史接缝锚点缺失或重复')
  return imported + source.replace(original, next)
}
