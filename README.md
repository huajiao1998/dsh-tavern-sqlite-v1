# DSH Tavern SQLite V1

为DSH Tavern提供SQLite聊天/会话存储、独立数据库分叉与干净尾部回退。**V1保留作者浏览器MVU与卡脚本执行器，不接管为服务端VM。**

## 支持与限制

- 适配作者2.4.0及DSH/boot 0.1.5-rc.2；Node22.19+、既有pnpm和CLI tavern profile。
- 安装器支持Linux/macOS/WSL2的既有CLI布局；Linux/systemd卸载实测一次16.138秒。其它平台和真实安装耗时不据此保证。
- 原档只读，不自动迁移。必须由用户点击「分叉迁移到数据库存档」，生成新的chatId与原生sessionId后继续。
- 回退对数据库日志纯尾物理截断，保留资源原件与独立手工编辑。
- 包就绪后60秒成功预算，失败恢复可能更久；成功仅验源码、装配、进程与HTTP基础健康。真实页面、原档历史和手动分叉需用户验收。
- 包含普通原档目录漏列修复；消费者离线回归不等于真实页面已通过。

仓库采用短名称dsh-tavern-sqlite-v1；内部插件包仍为dsh-tavern-storage-sqlite-v1，保持现有装配/卸载兼容。只发布V1。

## 安装

已有兼容酒馆时：

```sh
curl -fsSL https://github.com/huajiao1998/dsh-tavern-sqlite-v1/releases/download/v0.1.0/install.sh | sh -s -- install --home /绝对路径/酒馆安装根目录
```

本地包优先、缺包才下载固定发行附件并验证SHA256；不自动安装宿主、无需网页凭证、不运行安装脚本、不扫描或复制存档。完整参数和卸载方式见[安装说明](<deploy/INSTALL.md>)。安装前请自行做好备份并停止交互。

## 卸载

```sh
sh install.sh uninstall --home /绝对路径/酒馆安装根目录
```

原来运行则按原方式恢复，原来停止则保持停止。早期认证版须显式指定新的本地包作执行器，详安装说明；不将SQLite存档退回JSON。

## 源码与构建

```sh
node scripts/build-release.mjs
node --test test/*.test.mjs
```

构建产出dist/install.sh、固定tgz及SHA256SUMS；仅打包，无上传/服务操作。公开测试只用原创临时数据，无真实Host/模型/会话；内部取证消费者测试未公开，不伪称公开测试覆盖真实宿主全链。

## 来源

基于[DSH Tavern](https://github.com/flizzywine/dsh-tavern)的适配与派生模块，采用[AGPL v3](<LICENSE>)，详[来源声明](<NOTICE.md>)。非官方发行，无担保。
