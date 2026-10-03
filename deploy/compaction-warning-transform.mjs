// 警告投影的纯源码接缝；路由恢复不是压缩成功，不改存档历史。
const MARKER = '// [dsh-tavern-compaction-warning:v1]'
function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('压缩警告消费者锚点不唯一：' + before)
  return source.replace(before, after)
}
export function applyCompactionWarningTransform(source) {
  if (source.includes(MARKER)) {
    for (const required of ['projectCompactionWarning(chat.contextCompaction, ctx.llm.listProviders())', "from './domain/storage-compaction-warning.js'"]) {
      if (!source.includes(required)) throw new Error('压缩警告接缝消费者缺失：' + required)
    }
    return source
  }
  let next = `import { projectCompactionWarning } from './domain/storage-compaction-warning.js'\n${MARKER}\n` + source
  next = once(next, 'contextCompaction: chat.contextCompaction || null,', 'contextCompaction: projectCompactionWarning(chat.contextCompaction, ctx.llm.listProviders()),')
  const before = 'function volatileSessionViewFields(chat, activity, changes) { return sessionStateView.volatile(chat, activity, changes) }'
  next = once(next, before, 'function volatileSessionViewFields(chat, activity, changes) { return { ...sessionStateView.volatile(chat, activity, changes), contextCompaction: projectCompactionWarning(chat.contextCompaction, ctx.llm.listProviders()) } }')
  return next
}
