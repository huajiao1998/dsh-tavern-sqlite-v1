#!/usr/bin/env node
// V1标准装卸入口：只有数据库/回退接缝，不增加服务端卡执行器。
import {applyStandardSeams,checkStandardSeams,uninstallStandardSeams,maintenanceTargets} from './standard-seams.mjs'
import {uninstallAllSeams} from './apply-seams.mjs'
import {runCli} from './maintenance/runner.mjs'
export const maintenanceAdapter=Object.freeze({
 packageName:'dsh-tavern-storage-sqlite-v1',line:'v1',execution:'author-browser',requiresVmModules:false,
 ownedId:'dsh-tavern-storage-author-host-v1',hostMarker:'[dsh-tavern-v1-storage-host:v1]',otherHostMarker:'[dsh-tavern-core-host:v1]',
 targets:maintenanceTargets,applyStandardSeams,checkStandardSeams,uninstallStandardSeams,uninstallAllSeams,
})
runCli(import.meta.url,maintenanceAdapter)
