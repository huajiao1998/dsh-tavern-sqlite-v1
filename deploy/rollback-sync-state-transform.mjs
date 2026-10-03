// 作者client include模块与built内联使用同一纯转换，标准卸载恢复各自原像。
function once(s,a,b){if(s.split(a).length!==2)throw Error('回退状态锚点漂移：'+a.slice(0,80));return s.replace(a,b)}
export function applyRollbackViewReaderTransform(source){
 const marker='// [dsh-tavern-rollback-view-reader:v1]'
 const reset='begin.rebase = function (sessionId) { generations.set(sessionId, (generations.get(sessionId) ?? 0) + 1); sessions.delete(sessionId); };'
 const guard='if (generation !== (generations.get(sessionId) ?? 0)) throw new Error("回退前状态读已过期");'
 if(source.includes(marker)){if(source.split(marker).length!==2 || !source.includes(reset) || !source.includes(guard))throw Error('回退reader标记不完整');return source}
 let out=marker+'\n'+source
 out=once(out,'return function begin(sessionId) {','const generations = new Map();\n  function begin(sessionId) {\n    const generation = generations.get(sessionId) ?? 0;')
 out=once(out,'accept(result) {\n        let view =','accept(result) {\n        '+guard+'\n        let view =')
 out=once(out,'  };\n}\n\n// Weak array-version keys','  };\n  '+reset+'\n  return begin;\n}\n\n// Weak array-version keys')
 return out
}
export function applyRollbackLiveViewTransform(source){
 const marker='// [dsh-tavern-rollback-live-view:v1]'
 if(source.includes(marker)){if(source.split(marker).length!==2 || !source.includes('rebase: function (sessionId)') || !source.includes('rollbackGeneration !== (record.rollbackGeneration ?? 0)'))throw Error('回退live view标记不完整');return source}
 let out=marker+'\n'+source
 out=once(out,'record.loading = true;','record.loading = true;\n\t\tconst rollbackGeneration = record.rollbackGeneration ?? 0;')
 const guard='if (records.get(record.id) !== record) return;'
 if(out.split(guard).length!==5)throw Error('作者live view发布守卫布局漂移')
 const refresh=out.indexOf('async function refresh(record)')
 if(refresh<0)throw Error('作者live view读取边界漂移')
 out=out.slice(0,refresh)+out.slice(refresh).replaceAll(guard,'if (records.get(record.id) !== record || rollbackGeneration !== (record.rollbackGeneration ?? 0)) return;')
 out=once(out,'} catch (error) {\n\t\t\tconst terminal =','} catch (error) {\n\t\t\tif (rollbackGeneration !== (record.rollbackGeneration ?? 0)) return;\n\t\t\tconst terminal =')
 out=once(out,'evict: evict,',`rebase: function (sessionId) {
            const record = recordFor(sessionId);
            record.rollbackGeneration = (record.rollbackGeneration ?? 0) + 1;
            record.controller?.abort();
            record.optimisticBusy = false;
            if (record.loading) record.reloadRequested = true; else schedule(record, 0);
        },
        evict: evict,`)
 out=once(out,'setView: function (sessionId, view) {\n\t\t\tconst record = recordFor(sessionId);','setView: function (sessionId, view) {\n\t\t\tconst record = recordFor(sessionId);\n            record.rollbackGeneration = (record.rollbackGeneration ?? 0) + 1;')
 return out
}
