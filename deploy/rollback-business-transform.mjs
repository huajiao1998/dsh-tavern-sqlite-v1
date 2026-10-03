// 接入完整逐轮业务基准，升级已施row-v1源码；未知或半施布局失败关闭。
const MARKER = '// [dsh-tavern-rollback-business:v1]'
function once(source, old, next) {
  if (source.split(old).length !== 2) throw new Error('业务回退接缝锚点未命中/不唯一：'+old.slice(0,80))
  return source.replace(old,next)
}
export function applyRollbackBusinessTimelineTransform(source) {
  const importLine = "import { captureRollbackBusinessState, restoreRollbackBusinessState } from './storage-rollback-business.js'"
  if (source.includes(MARKER)) {
    for (const key of [importLine,'businessBefore: operation.businessBefore','businessBefore: intent.businessBefore || captureRollbackBusinessState(chat, clone)','restoreRollbackBusinessState(chat, checkpoint.businessBefore, clone)']) if (!source.includes(key)) throw new Error('业务回退标记存在但消费者不完整')
    return preserveMacroConfiguration(source)
  }
  let next = importLine+'\n'+MARKER+'\n'+source
  next = once(next,'rowBefore: operation.rowBefore,','rowBefore: operation.rowBefore, businessBefore: operation.businessBefore,')
  next = once(next,'rowBefore: rollbackHead(chat), beforeParticipants:', 'rowBefore: rollbackHead(chat), businessBefore: intent.businessBefore || captureRollbackBusinessState(chat, clone), beforeParticipants:')
  next = once(next,'    restore(chat, restoredState)', '    if (!checkpoint.businessBefore) throw new Error(\'本轮缺少完整业务回退基准，未修改数据库；不能用当前状态冒充上一轮\')\n    restore(chat, restoredState)\n    restoreRollbackBusinessState(chat, checkpoint.businessBefore, clone)')
  return preserveMacroConfiguration(next)
}
// 作者restore先整替macroState；业务恢复随后执行，必须在此处先保留当前用户子字段。
function preserveMacroConfiguration(source){
  if(source.includes('// [dsh-tavern-rollback-macro-config:v1]'))return source
  return once(source,'    restore(chat, restoredState)\n    restoreRollbackBusinessState(chat, checkpoint.businessBefore, clone)',`    // [dsh-tavern-rollback-macro-config:v1]
    const currentMacroState = chat.macroState
    restore(chat, restoredState)
    chat.macroState = currentMacroState
    restoreRollbackBusinessState(chat, checkpoint.businessBefore, clone)`)
}
export function applyRollbackBusinessTurnTransform(source) {
  function failedBodyFence(value) {
    const guard='// [dsh-tavern-failed-body-prepare-fence:v1]'
    if(value.includes(guard))return value
    let next=guard+`\nfunction assertRollbackBodyPreparation(chat) {
  if(Object.values(chat.timeline?.operations || {}).some(op=>op.kind==='body' && op.status==='failed' && (!op.basedOn?.branchId || op.basedOn.branchId===chat.timeline?.branchId)))throw new Error('失败正文必须先统一物理清理，再准备新回合；禁止直接重试覆盖回退基准')
}\n`+value
    next=once(next,'    const rollbackBusinessBefore = captureRollbackBusinessState(chat)','    assertRollbackBodyPreparation(chat)\n    const rollbackBusinessBefore = captureRollbackBusinessState(chat)')
    return once(next,"    const begun = timeline.apply({ chat, intent: { kind: 'body.begin', turn, userText } })","    assertRollbackBodyPreparation(chat)\n    const begun = timeline.apply({ chat, intent: { kind: 'body.begin', turn, userText } })")
  }
  const marker = '// [dsh-tavern-rollback-business-prepare:v1]'
  if (source.includes(marker)) {
    if (!source.includes('businessBefore: rollbackBusinessBefore') || !source.includes('captureRollbackBusinessState(chat)')) throw new Error('前台完整业务基准消费者不完整')
    return failedBodyFence(source)
  }
  let next = "import { captureRollbackBusinessState } from './storage-rollback-business.js'\n"+marker+'\n'+source
  next = once(next,'    let chatChanged = clearStaleStages(chat, turn)',"    if (chat.rollbackPending) throw new Error('物理回退未完成，请先重试回退，禁止继续生成')\n    const rollbackBusinessBefore = captureRollbackBusinessState(chat)\n    let chatChanged = clearStaleStages(chat, turn)")
  next = once(next,"const begun = timeline.apply({ chat: { ...chat, messages: [] }, intent: { kind: 'body.begin', turn, userText } })", "const begun = timeline.apply({ chat: { ...chat, messages: [] }, intent: { kind: 'body.begin', turn, userText, businessBefore: rollbackBusinessBefore } })")
  next = once(next,"    const begun = timeline.apply({ chat, intent: { kind: 'body.begin', turn, userText } })", "    if (chat.rollbackPending) throw new Error('物理回退未完成，请先重试回退')\n    const begun = timeline.apply({ chat, intent: { kind: 'body.begin', turn, userText } })")
  return failedBodyFence(next)
}
