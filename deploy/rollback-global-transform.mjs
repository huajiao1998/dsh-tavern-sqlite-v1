// V1保持共享变量SQL权威及独立编辑边界；adapter仅跟踪浏览器Host写任务，不接执行器。
const MARKER='// [dsh-tavern-rollback-globals:v1]'
function once(source,old,next){if(source.split(old).length!==2)throw Error('共享变量回退锚点未命中/不唯一：'+old);return source.replace(old,next)}
export function applyRollbackGlobalAdapterTransform(source){
  if(source.includes('serverExecution') || source.includes('// [dsh-tavern-adapter-runs:v1]'))throw Error('V1需要作者浏览器adapter原树，拒绝覆盖完整功能执行接缝')
  function addJoin(value){
    if(value.includes('// [dsh-tavern-v1-adapter-runs:v1]'))return addClear(value)
    let next="import { createBrowserRollbackGuard } from './storage-browser-rollback.js'\n"+value
    next=once(next,'  assertDependencies()',`  assertDependencies()
  // [dsh-tavern-v1-adapter-runs:v1]
  const browserRollback=createBrowserRollbackGuard({ dispatch: options.scriptDispatch, readLifecycle: options.readRollbackLifecycle })
  const trackRollbackAdapterRun=browserRollback.track
  const whenRollbackAdapterIdle=browserRollback.whenIdle`)
    next=once(next,'    dispatchEvent,\n    settleMvuUpdate,','    dispatchEvent,\n    whenIdle: whenRollbackAdapterIdle,\n    guardBrowserMutation: browserRollback.guardMutation,\n    settleMvuUpdate,')
    for(const name of ['dispatchEvent','settleMvuUpdate','updatePrompts','updateVariables','updateMessages','createMessages','replaceWorldbook','saveFullPromptTemplateState','saveFullPromptTemplateSettings','saveFullPromptTemplateGlobals','saveExtensionSettings','saveChatData','saveWorldInfo'])next=once(next,'    '+name+',','    '+name+': trackRollbackAdapterRun('+name+'),')
    return addClear(next)
  }
  function addClear(value){
    if(value.includes('// [dsh-tavern-adapter-clear:v1]'))return value
    let next=value
    for(const name of ['syncTemplateState','templateCharacters'])next=once(next,'  const '+name+' =','  let '+name+' =')
    return once(next,'    whenIdle: whenRollbackAdapterIdle,',`    whenIdle: whenRollbackAdapterIdle,
    // [dsh-tavern-adapter-clear:v1] 静止后解除本档旧正文/模板缓存的强引用，不全局抹其它档reader。
    clearRollbackState: async sessionId => {
      await whenRollbackAdapterIdle(sessionId)
      if(settlementBase?.sessionId===sessionId)settlementBase=null
      syncTemplateState=createFullPromptTemplateSync()
      templateCharacters=createJsonValueProjectionCache({ capacity: 8, maxBytes: 64 * 1024 * 1024 })
    },`)
  }
  if(source.includes(MARKER)){if(!source.includes('rollbackGlobalOwner(chat)')||!source.includes('rollbackGlobalOwner(globalChat)'))throw Error('共享变量写归属标记不完整');return addJoin(source)}
  let next="import { rollbackGlobalOwner } from './storage-rollback-business.js'\n"+MARKER+'\n'+source
  next=once(next,'const saved = await options.globalVariables.save(variables && typeof variables === \'object\' && !Array.isArray(variables) ? variables : {})',"const saved = await options.globalVariables.save(variables && typeof variables === 'object' && !Array.isArray(variables) ? variables : {}, undefined, rollbackGlobalOwner(chat))")
  next=once(next,'    assertTemplateChat(await resourcePermissionChat(sessionId))\n    if (!expectedVariables', '    const globalChat = await resourcePermissionChat(sessionId)\n    assertTemplateChat(globalChat)\n    if (!expectedVariables')
  next=once(next,'    const saved = await options.globalVariables.save(variables, expectedVariables)', '    const saved = await options.globalVariables.save(variables, expectedVariables, rollbackGlobalOwner(globalChat))')
  return addJoin(next)
}
export function applyRollbackGlobalHostTransform(source){
  // 旧标准树去除共享库撤销；仅本档缓存和召回数据随回退清理。
  source=source.replace('// [dsh-tavern-rollback-extension:v1]\n','')
  for(const store of ['promptTemplateGlobalVariables','tavernExtensionSettings','characterVariableStore','rollbackWorldbookResources','rollbackWorldbookBindings'])for(const method of ['reserveRollback','releaseRollback','preflightRollback','pruneRollback'])source=source.replace(new RegExp('^      await '+store+'\\.'+method+'\\(chat, turn(?:, archive)?\\)\\r?\\n','gm'),'')
  source=source.replace(/    (?:reserveRollbackSides|releaseRollbackSides|preflightRollbackSides): async \([^\n]*\) => \{\n    \},\n/g,'')
  const addClear=value=>value.includes('await tavernScriptHostAdapter.clearRollbackState(chat.sessionId)')?value:once(value,'      await worldbookRecallLog.pruneRollback(chat, turn, chat.timeline.branchId)','      await tavernScriptHostAdapter.clearRollbackState(chat.sessionId)\n      await worldbookRecallLog.pruneRollback(chat, turn, chat.timeline.branchId)')
  const marker='// [dsh-tavern-rollback-global-host:v1]'
  if(source.includes(marker)){if(!source.includes('createRollbackGlobalVariables({ profileData, dataRoot })')||!source.includes('createRollbackExtensionSettings({ profileData, dataRoot })'))throw Error('共享变量Host回退标记不完整');return addClear(source)}
  let next="import { createRollbackGlobalVariables, createRollbackExtensionSettings } from './domain/storage-rollback-business.js'\n"+marker+'\n'+source
  next=once(next,'  const tavernExtensionSettings = createTavernExtensionSettings(profileData)',"  const tavernExtensionSettings = createRollbackExtensionSettings({ profileData, dataRoot })\n  ctx.effect(() => () => tavernExtensionSettings.dispose(), 'dsh-tavern: 设置SQL释放')")
  next=once(next,'    fullExtensionSettings: createTavernExtensionSettings(profileData),','    fullExtensionSettings: tavernExtensionSettings,')
  next=next.replaceAll("profileData.version('tavern-extension-settings.json')",'tavernExtensionSettings.version()')
  next=once(next,'  const promptTemplateGlobalVariables = createPromptTemplateGlobalVariables(profileData)',"  const promptTemplateGlobalVariables = createRollbackGlobalVariables({ profileData, dataRoot })\n  ctx.effect(() => () => promptTemplateGlobalVariables.dispose(), 'dsh-tavern: 全局变量SQL释放')")
  next=once(next,'    cleanupRollbackSides: (chat, turn) => worldbookRecallLog.pruneRollback(chat, turn, chat.timeline.branchId),',`    cleanupRollbackSides: async (chat, turn) => {
      await worldbookRecallLog.pruneRollback(chat, turn, chat.timeline.branchId)
    },`)
  next=once(next,'    projectUserTemplate: async ({chat,text}) => {','    projectUserTemplate: async ({chat,text,turn}) => {')
  next=once(next,'      await tavernScriptHostAdapter.saveFullPromptTemplateGlobals(chat.sessionId, result.scopes.global, global)','      await promptTemplateGlobalVariables.save(result.scopes.global, global, { chatId: chat.id, turn })')
  next=next.replaceAll("profileData.version('prompt-template-variables.json')",'promptTemplateGlobalVariables.version()')
  next=once(next,'          await writePromptTemplateGlobalVariables(compiled.promptTemplateState.scopes.global)',"          await promptTemplateGlobalVariables.save(compiled.promptTemplateState.scopes.global, undefined, { chatId: input.chat.id, turn: Number(input.turn) })")
  return addClear(next)
}
