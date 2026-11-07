# Codex 用量探针

页面：<https://162383.xyz/si/>

轻量的个人 Codex 额度面板，展示剩余额度、官方返回的重置时间、本地时区倒计时、最近 24 小时趋势和同一窗口近一小时的消耗速度。

## 工作方式

已登录 Codex 的电脑 / VPS → Codex app-server 只读 RPC → 本地脱敏快照 → GitHub 独立 `si-data` 分支 → `/si/`。

探针调用 `initialize`、`account/read` 和 `account/rateLimits/read`，不创建对话或运行模型任务。账号信息只用于本地哈希，切换账号或套餐会清空历史；不会上传邮箱、账号 ID、哈希、凭据或会话。

`main` 保存代码；`si-data` 是仅有快照的独立分支，其更新不会触发主站 Pages 工作流。无需另租服务器。采集设备需要持续运行；停更后网站保留旧快照并标记过期。

## 开始使用

在实际使用 Codex 的设备上安装 [Node.js 22+](https://nodejs.org/)、[Codex CLI](https://github.com/openai/codex)、[GitHub CLI](https://cli.github.com/) 和 Git。Codex CLI 需支持 app-server 和订阅额度读取。

确认登录；已经登录的不必重复：

~~~sh
codex login
gh auth status
# 未登录 GitHub 时才运行：
gh auth login
~~~

GitHub 账号需要有 `DHLSPACE/dhlspace.github.io` 的 contents 写入权限。使用 PAT 时只通过本机 GitHub CLI 登录机制配置，不要发到聊天、网页、源码或命令行参数。API Key 模式可能没有 ChatGPT 订阅额度窗口。

~~~sh
git clone --depth 1 https://github.com/DHLSPACE/dhlspace.github.io.git
cd dhlspace.github.io
node public/si/probe.mjs --publish
~~~

Windows 也可以双击 `public/si/start-windows.cmd`。支持 Windows、macOS 和 Linux，不依赖 Bash、Python 或 Docker。

默认每 300 秒采样上传。看到“采集成功”和“已同步”后，访问页面等待刷新。Ctrl+C 停止。

**加上 --publish 会公开上传套餐、额度比例、时间和脱敏历史。** GitHub 提交历史保留以前的快照；当前 JSON 仅保留最近 7 天，最多 2016 点。请只运行一台上传探针；多台设备会覆盖同一个数据源。当前面板代表单一账号。

## 本地模式与选项

不加 --publish 就不会上传：

~~~sh
node public/si/probe.mjs --once
~~~

网页 → 接入探针 → 本地查看 / 自定义数据源 → 导入 `.si/status.json`。文件只在当前页面解析，刷新浏览器后需要重新导入。

~~~text
--once                 仅采集一次
--publish              上传脱敏快照
--interval 300         采样间隔，60–3600 秒
--repo owner/repo      上传到自己的 fork 或其他有写入权限的仓库
--state-dir PATH       本地状态目录，默认仓库下 .si/
--codex-bin PATH       Codex 可执行文件路径；支持 Windows npm codex.cmd
--help                 显示帮助
~~~

探针沿用环境中的 CODEX_HOME。只应指向你希望监控的账号目录，无需将认证文件复制进仓库。GitHub CLI 使用其现有登录。

上传到其他仓库时，在网页设置支持 CORS 的公开 HTTPS JSON 地址：

~~~text
https://raw.githubusercontent.com/OWNER/REPO/si-data/status.json
~~~

网页仅保存地址，不保存认证信息。探针只更新 si-data/status.json，不修改 main。

## 长期运行

Linux 可配置 systemd 用户服务。替换下面 Node.js 和仓库的绝对路径：

~~~ini
[Unit]
Description=Personal Codex quota probe
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/absolute/path/dhlspace.github.io
ExecStart=/absolute/path/node /absolute/path/dhlspace.github.io/public/si/probe.mjs --publish
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
~~~

保存到 ~/.config/systemd/user/codex-probe.service，运行 `systemctl --user daemon-reload` 和 `systemctl --user enable --now codex-probe`。该用户必须已经登录 Codex 和 gh，非默认 CODEX_HOME 或 PATH 需在服务里配置。退出登录后的运行行为取决于系统设置。

Windows 可用任务计划程序创建登录触发的任务：程序填 node.exe 的完整路径，参数填探针脚本的完整路径与 --publish，起始目录填仓库目录。使用已登录 Codex 和 gh 的同一用户。macOS 可保持终端运行，或配置 launchd 执行同一命令。

## 数据与显示规则

- usedPercent 是服务端返回的额度百分比，不是 token 数或货币金额，不用 token 数反推额度。
- 根据 windowDurationMins 显示窗口名称，不假设所有套餐都是 5 小时、7 天；额外模型窗口也会显示。
- resetsAt 是服务端给出的 Unix 秒数，转换为 ISO 保存，浏览器按本地时区显示，不推测固定的重置日。
- 时间到达后显示“待确认重置”，等探针返回新值，不自行把额度恢复为 100%。ordinaryUsageAllowed 为 false 时明确提示；缺少字段时不根据百分比推断账号可用性。
- 速度预估需近一小时内至少 15 分钟的同一重置边界采样，期间比例不可回退。耗尽时间为线性估算；数据过期或采集异常时不作新预估。
- 采样缺口、重置或比例回退时趋势线断开。
- 页面每 60 秒读取快照，倒计时每秒更新。超过 3 个采样周期（至少 15 分钟）标记过期。GitHub raw 可能额外缓存，网页刷新不等于新采样。
- 浏览器不请求本机端口，无需开放 VPS 入站端口。GitHub 上传为 HTTPS 出站连接。

本地 .si/state.json 保存账号哈希及历史，.si/status.json 为可导入快照；.si/ 已加入 .gitignore。错误只输出固定类别，原始 RPC 日志和错误正文不会上传。

## 排障

- **找不到 Codex**：确认 codex --version；桌面客户端登录不一定等于 CLI 登录。必要时运行 codex login 或指定 --codex-bin。
- **没有额度窗口**：确认以 ChatGPT 登录，并更新 Codex CLI；API Key 模式可能不提供此数据。
- **GitHub 403**：检查 gh auth status 和目标仓库 contents 权限。
- **锁文件已存在**：确认没有探针运行。意外退出可能留下 .si/probe.lock，确认停止后删除锁再启动。
- **本地状态损坏**：备份并移走 .si/state.json，再启动会从空历史开始。
- **数据过期**：检查采集设备、终端和网络。“刷新”只读取已上传快照，不会远程唤醒设备。
- **代理或登录错误**：确认同一终端中的 Codex 和 gh 可正常使用。探针沿用现有配置，不替换登录信息。

## 开源参考

以下为调研来源；页面与探针为本站独立实现，没有复制这些项目源码。

| 项目 | 适合用途 |
| --- | --- |
| [CodexBar](https://github.com/steipete/CodexBar) | 桌面菜单栏额度、重置时间、多来源读取 |
| [Codex Monitor](https://github.com/manuelsh/codex-monitor) | 本机额度、任务与会话用量，使用 app-server |
| [Codex Usage Monitor](https://github.com/en4ble1337/codex-usage-monitor) | 本机采集、历史与静态网页的架构参考 |
| [Self-Hosted Web Monitor](https://github.com/CableZa/codex-self-hosted-web-monitor) | 本地会话、credits 统计与 Docker 仪表盘 |
| [OpenAI Codex app-server 协议](https://github.com/openai/codex/tree/main/codex-rs/app-server-protocol) | 额度响应字段与 RPC 协议来源 |

验证：在仓库根目录运行 `node --test tests/si.test.mjs`。测试覆盖数据合同、状态、账号隔离、重置边界、隐私字段过滤与模拟 app-server 交互。真实设备的登录、网络和额度读取仍需在实际采集设备确认。
