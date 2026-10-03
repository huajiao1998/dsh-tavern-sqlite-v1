# V1 本地优先一键安装 / 卸载

## 支持范围

macOS、Linux、WSL2的CLI酒馆；已有作者2.4.0应用树和DSH/boot 0.1.5-rc.2私有运行时，实际源码接缝须通过预检。需要既有Node22.19+及pnpm；使用Node内置SQLite，不安装Python、SQLite库或编译工具。Desktop、未知管理器和未知作者源码不冒称兼容。

本地完整包优先，缺包才下载固定GitHub Release附件并核对SHA256。下载期间不停服。包准备后安装/卸载共用60秒成功预算；超时按失败恢复，不冒报成功。具体平台的真实安装耗时仍须实测；异常恢复可能超过60秒。

## 一键安装（用户无需填写版本或目录）

```sh
curl -fsSL https://github.com/huajiao1998/dsh-tavern-sqlite-v1/releases/latest/download/install.sh | sh
```

安装器从`DSH_TAVERN_CLI_HOME`、`DSH_HOME`、当前目录、`~/.dsh-tavern`识别既有CLI酒馆；只有找不到或存在多个时才需`--home`明确选择，不扫描全盘。当前不支持Desktop，不能照搬上游`DSH_TAVERN_HOST=desktop`。

入口地址固定，最新正式Release发布后命令不变；每份SH内部仍锁定同代tgz和SHA256，不把最新SH配任意包。只推main不发布Release不会更新安装版本；已有本地包优先，已装再执行不会静默升级。修改代码不应覆盖旧tag/附件，即使忘改SemVer也必须使用新发行tag，构建器通过`--tag`可显式指定；正常发行应递增package.version，SH版本由构建器读取它，不再另手改脚本常量。

## 本地安装（可选指定目录）

解压插件包，运行：

```sh
sh deploy/install.sh install --home /绝对路径/酒馆安装根目录
```

也可只保留SH与tgz：

```sh
sh install.sh install --home /绝对路径/酒馆安装根目录 --package ./dsh-tavern-storage-sqlite-v1-0.1.0.tgz
```

脚本旁、当前目录及缓存中的固定版本tgz均优先于下载。损坏本地包直接拒绝，不偷偷联网替换。未显式指定目录时仅检查环境变量、当前目录和默认CLI目录；多个安装必须明确选择，不扫描磁盘或存档。

## 运行状态

- 原来运行：核验真实PID/代次、home、cwd及启动命令；停止后原地离线装包和接缝，再按原方式恢复。
- 原来停止：直接安装；安装及失败恢复后均保持停止，不拉起。
- 任意端口从已核验的进程读取；`--port`只作显式核对，不改端口。
- Linux/WSL2识别既有systemd owner；也可显式传`--systemd-unit xxx.service`。不修改unit，不另起旁路服务。
- macOS直接CLI支持；launchd实例请先通过原任务停止，不猜任务配置。
- 不调用作者普通start/restart入口，避免旧会话前缀迁移。

## 卸载

```sh
curl -fsSL https://github.com/huajiao1998/dsh-tavern-sqlite-v1/releases/latest/download/install.sh | sh -s -- uninstall
```

使用本地已安装的所属代代码与恢复记录，不下载新版本。早期已安装代仍是认证版执行器时，新SH的安装/卸载均不会静默调用它；需显式`--package`指定新的本地离线包作为卸载执行器，保留确切旧包用于失败恢复。未安装时无变更返回。安装不同代不会自动升级，须先卸载旧代。

所有装卸通过目标profile的官方离线包管理入口，禁止生命周期脚本，不自动补装宿主peer，不关闭供应链策略；不复制整个profile/node_modules，不预演整套依赖树，不读取/复制/转换/删除存档及数据库。必要备份仅限有限程序源码和本插件包。官方包管理仍会读取目标profile已有依赖；已有宿主或其离线元数据不完整时明确失败，不联网补齐、不承诺损坏环境也能成功。

## 验收边界

无需用户名、密码或Cookie；运行态只验源码、装配、精确进程及HTTP基础可达。401/403或登录跳转说明门禁可达，不代表认证后的插件库存或页面功能通过。用户自己登录后刷新确认面板/原档只读及手动独立分叉；安装器不代玩、不自动迁移。

`--check`只作本地有限预检，不停止、不装卸；`--background`脱离终端并返回结果位置。默认等待独立作业进度，终端中断后作业及恢复继续。安装器使用宿主现有维护文件锁防并发，不添加数据库锁。

## GitHub 单命令发布

发布者在独立公开仓库上传`install.sh`、固定版本tgz与`SHA256SUMS`，三者由构建工具同一代生成。必须先配置真实owner/repo，未配置时本地安装可用、缺包下载明确拒绝，不猜地址。用户入口形态：

```sh
curl -fsSL https://github.com/huajiao1998/dsh-tavern-sqlite-v1/releases/latest/download/install.sh | sh
```

获取SH本身需要网络；已有本地包时SH后续不访问网络。缺包下载时间不计入安装预算，下载完成后解包、预检、装包、必要停启及基础验收必须共享60秒预算。发行包与源码见本仓库的GitHub Release。
