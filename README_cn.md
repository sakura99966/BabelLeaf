# BabelLeaf

**跨越语言，继续阅读。**

[English](README.md)

BabelLeaf 是一款开源、本地优先的跨语言阅读器。它首先面向阅读英文、日文书籍与漫画的简体中文用户，希望让原始内容、译文、批注和阅读进度尽量保留在用户自己的设备上。

> **当前状态：** 项目正处于基础迁移阶段。当前代码树已经切换到
> Readest，继承了其阅读引擎和应用结构；BabelLeaf 自己的联网隔离、产品标识、
> 大模型翻译、双语阅读和漫画 OCR/嵌字仍在开发中。目前尚无可发布的
> BabelLeaf 正式版本。

## 产品边界

首个可发布版本遵循以下约束：

- 书籍与漫画只通过**本地文件导入**进入书库。
- 书库、阅读进度、批注、词典、缓存和翻译结果默认保存在本地。
- 唯一计划允许的外部联网行为，是用户明确启用后向其自行配置的
  **OpenAI-compatible API 地址**发送翻译请求；也可以使用 Ollama、LM
  Studio 等本机回环地址。
- 第一版不提供账号、云同步、OPDS/RSS 在线书库、网页抓取、资源下载、公开分享、
  付费、遥测、在线元数据、在线词典、在线 TTS 和继承自上游的更新服务。
- 项目不提供 DRM 破解，也不帮助获取用户无权使用的版权内容。

当前继承的 Readest 代码仍包含若干不在上述范围内的联网实现和配置。这并不表示
BabelLeaf 会发布这些能力；联网路径的封闭仍是正在进行的迁移任务。详情见
[联网策略](docs/NETWORK_POLICY.md)。

## 当前基础与开发方向

| 领域 | 当前基础 | BabelLeaf 方向 |
| --- | --- | --- |
| 应用框架 | Tauri v2 中的 Next.js/React 应用 | 先完成 Windows，再保留向 macOS、Android、iOS 移植的可行路径 |
| 本地阅读 | Readest 的书库和阅读引擎 | 保留并回归验证本地导入、排版、搜索、高亮、笔记和进度 |
| 格式 | 上游基线可识别 EPUB、PDF、MOBI、AZW/AZW3、FB2、CBZ/ZIP、TXT 和 Markdown | 先用合法、无 DRM 样本稳定 EPUB/PDF/MOBI 与漫画兼容性，再扩展格式 |
| 文本翻译 | Readest 含有旧的翻译服务实现 | 替换为一个受控、由用户自行配置的 OpenAI-compatible 适配器 |
| 双语阅读 | 尚未形成 BabelLeaf 工作流 | 先做划词/段落翻译，再做章节/全书翻译、原译文对齐、缓存、术语表和翻译记忆 |
| 词典与朗读 | 上游含在线查询及系统/Edge 相关路径 | 优先本地词典与操作系统 TTS，删除非预期的在线回退 |
| 漫画 | 上游提供基础 CBZ/ZIP 图片阅读 | 后续增加本地 OCR、文字区域检测、擦字/修复、译文嵌字、覆盖层编辑与原译图切换 |

“能够识别格式”不等于所有文件变体都已保证兼容。测试资料必须是合法取得且无
DRM 的文件。

## 路线图

### 阶段 0：隔离并稳定基础（进行中）

- 在保留项目历史的前提下，将主程序迁移到 Readest/Tauri 架构。
- 替换继承的 Readest 产品标识、数据路径、凭据命名空间、链接和发布/更新配置。
- 封闭或移除不符合 BabelLeaf 策略的后台与交互式联网路径。
- 建立 Windows 构建、测试、打包和本地导入回归基线。

### 阶段 1：文本翻译 MVP

- 配置 OpenAI-compatible Base URL、模型与 API Key。
- 使用平台安全存储保存密钥，禁止写入日志或导出的普通设置。
- 支持英/日到简体中文的划词及阅读单元翻译，并提供取消、重试、限流和本地缓存。
- 提供原文、译文以及双语对照阅读模式。
- 在条件允许时接入离线词典和本地/系统朗读。

### 阶段 2：结构化书籍翻译

- 在不破坏标题、段落、Ruby 注音、链接、脚注、图片和阅读顺序的前提下提取并翻译
  EPUB 内容。
- 增加章节任务、术语约束、翻译记忆、人工校改和可迁移的 sidecar 结果；不覆盖
  原书。
- 将文本型 PDF 与扫描 PDF 分开评估和实现。

### 阶段 3：漫画与更多平台

- 定义可替换的本地 OCR/翻译/嵌字 Worker 协议。
- 在 Windows 对日/英/中 OCR、竖排文本、气泡、彩页和长条漫画进行基准测试。
- 再研究 macOS、Android 和 iOS 的原生打包或平台专用实现；不能假设桌面 Python
  Worker 可以直接搬到移动端。

## 架构方向

```text
React / Next.js 界面
        |
        +-- Readest / foliate-js / PDF.js 阅读基础
        |
        +-- Tauri v2 平台桥接
                |
                +-- 本地书库、设置、批注与缓存
                +-- 平台安全凭据存储
                +-- 受控的 OpenAI-compatible 翻译通道
                +-- 可选本地漫画 Worker（远期，桌面优先）
```

基线选择和取舍见
[ADR-001：采用 Readest 基线](docs/ADR-001-READEST-BASELINE.md)，已评估的
上游项目和候选组件见[上游清单](docs/UPSTREAM_INVENTORY.md)。

## 本地开发

### 环境要求

- 支持子模块的 Git
- Node.js 24
- pnpm 11（仓库固定为 `pnpm@11.1.1`）
- Rust 1.90 或更高版本（建议 stable）以及 Tauri v2 对当前平台要求的依赖
- Windows 需要 WebView2 Runtime，以及安装了 **Desktop development with
  C++** 工作负载的 Visual Studio Build Tools

### 初始化

```bash
git clone --recurse-submodules https://github.com/sakura99966/BabelLeaf.git
cd BabelLeaf
git submodule update --init --recursive
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @readest/readest-app setup-vendors
```

迁移期内部 workspace 包名仍为 `@readest/readest-app`。立即改名会显著增加后续
同步上游的冲突；这个内部名称不代表产品仍叫 Readest。

启动桌面应用：

```bash
pnpm tauri info
pnpm tauri dev
```

只启动 Web 开发前端：

```bash
pnpm dev-web
```

### 验证

前端或文档变更至少运行：

```bash
pnpm --filter @readest/readest-app test:pr:web:unit
pnpm lint
pnpm format:check
pnpm --filter @readest/readest-app build
```

修改 Tauri/Rust 后端时还需运行：

```bash
pnpm fmt:check
pnpm clippy:check
pnpm --filter @readest/readest-app test:rust
```

在 Windows 生成未签名的 x64 验证安装包：

```bash
pnpm --filter @readest/readest-app build-win-x64:unsigned
```

安装包输出到
`target/x86_64-pc-windows-msvc/release/bundle/nsis/`。这是开发验证产物；
公开分发前仍需替换为 BabelLeaf 自有图标并配置 Authenticode 签名。

平台安装包需要完整的对应 Tauri 工具链，并在目标操作系统上验证。

## 源码历史与上游

当前代码树来自 [Readest](https://github.com/readest/readest) 上游提交
`8c212e5b8b019e40e162a7e20cb90f336a308f13`。迁移合并提交
`2bc0b11d` 保留了 BabelLeaf 早期基于 Koodo 的 Git 历史；最后一个 Koodo
基线仍保存在分支 `codex/koodo-baseline`，对应提交
`93bd8ebbc613906ca730717dfa3261e2ea93327d`。

选择 Readest 并不是因为 Koodo “只支持 Windows”。Koodo 是面向多个桌面
操作系统的 Electron 应用；本项目改用 Readest，是因为 Tauri v2 结构为桌面和
移动端演进提供了更直接的路径。

## 许可证与署名

BabelLeaf 按 [GNU Affero General Public License v3.0 或更高版本](LICENSE)
发布，与当前 Readest 基线保持一致。Readest、Koodo、foliate-js、PDF.js、
Tauri 及其他依赖的版权和许可证声明必须保留。随程序分发的依赖、字体、词典、
OCR 模型、模型权重、语音和数据文件仍分别受各自许可证与分发条款约束。

把某个上游项目列为参考，不代表它的代码已经并入本项目。未来任何整合都必须在
发布前记录来源、保留署名，并审查源码提供及 NOTICE 等义务。本文档不是法律意见。
