# BabelLeaf

**跨越语言，继续阅读。**

[English](README.md)

BabelLeaf 是一款面向简体中文用户的开源、本地优先跨语言阅读器，重点服务于英文、日文及其他语言的书籍和漫画阅读。项目近期以 Windows 为主要运行平台，同时保持 Tauri v2 共享代码对 macOS、Android 和 iOS 的可移植性。

当前应用基线源自 Readest。BabelLeaf 保留其本地阅读基础，并移除不属于本项目范围的产品服务。

## 当前产品边界

- 书籍和漫画仅通过本地文件导入。
- 书库、阅读进度、批注、词典、设置和翻译缓存保存在本机。
- 联网仅限用户明确发起的翻译请求，目标为内置 DeepSeek V4、OpenAI、Anthropic Claude 预设或本地回环地址上的 Ollama。
- 当前应用不包含账号、云同步、OPDS/RSS 在线书库、网页剪藏、资源抓取、公开分享、付费、遥测、在线元数据、在线词典、云端语音和继承自上游的更新服务。
- BabelLeaf 不提供 DRM 破解，也不帮助获取用户无权使用的版权内容。

具体联网边界及发布前检查见[联网策略](docs/NETWORK_POLICY.md)。

## 开发状态

BabelLeaf 目前仍处于预发布阶段。仓库现有基础包括：

- Tauri v2 桌面端和移动端应用结构；
- 本地书库导入与阅读基础；
- EPUB、PDF、MOBI/AZW/AZW3、FB2、CBZ/ZIP、TXT 和 Markdown 的解析或渲染路径；
- 本地高亮、笔记、搜索、阅读进度和外观设置；
- 导入式本地词典及受支持平台的系统词典；
- 不依赖在线服务的原生或浏览器语音引擎；
- 通过内置 DeepSeek V4、OpenAI、Anthropic Claude 预设或本地 Ollama 进行划词和阅读单元翻译。

能够识别格式不等于已经保证所有文件变体均可兼容。测试资料必须合法取得且不含 DRM。

0.2 至 0.3.2 版本在上述基础上已提供以下翻译工作流：

- 阅读器内章节与全书翻译工作台，支持限并发、暂停、继续、取消和本地断点保存；
- 原文与译文的双语对照显示，以及不含凭据的 JSON sidecar 导入和导出；
- 持久化可重试批量队列、术语保护、有界翻译记忆、格式诊断和人工校订状态；
- 术语表与翻译记忆管理，支持本地校验、导入导出、冲突报告、容量限制和术语版本可见性；
- 完整校审工作区，支持供应商来源、定位锚点、状态筛选、机器译文保留、批准/撤回、键盘翻页和草稿恢复；
- 可恢复的批量任务仪表板，显示失败详情、重试、恢复状态和有界历史清理。
- 术语表、翻译记忆和校审数据的版本化 JSON/TSV 互操作，以及 TBX、TMX、XLIFF 往返；
- 不依赖分页、字体、行高、书写方向和窗口大小的稳定原文锚点；
- 文本层、混合型、纯图像、损坏、加密和超限文件的明确诊断、合法样本矩阵与性能预算；
- 可替换的本地漫画 worker 协议，包含能力发现、限额、进度、取消、错误和 mock OCR 适配器。

0.4.0 版本在上述 worker 边界上增加本地 OCR 基础能力：

- 版本化 OCR sidecar，保存页面身份、区域多边形、阅读顺序、语言、置信度、ruby 元数据、引擎来源和失败信息；
- 支持暂停、恢复、取消、重试、检查点和重启恢复的有界 OCR 页面任务；
- 本地 OCR 模型清单，记录校验和、许可证、语言、运行时及 CPU 回退能力，不自动下载模型；
- 可选择的 OCR 文本层，在不修改 PDF、CBZ、FBZ 或图片源文件的情况下覆盖页面内容；
- 对已有文本层、混合页面、纯图片、缺少模型、设备不兼容、损坏和超限输入提供明确诊断。

下列主要功能尚待开发：

- OCR 文本校正、漫画区域编辑、翻译覆盖层、擦字修复、译文嵌字和独立译文导出；
- macOS、Android、iOS 的签名发布包及目标平台验证。

从 0.4.0 到稳定版 1.0.0 的权威开发顺序见[开发路线图](docs/DEVELOPMENT_ROADMAP.md)。
后续版本规划、实现、代码审查和发布验收均以该文档为准。

运行边界见[架构说明](apps/readest-app/docs/architecture.md)，OCR 边界见[OCR 基础说明](docs/OCR_FOUNDATION.md)，当前和远期翻译契约见[翻译需求](docs/TRANSLATION_REQUIREMENTS.md)，代码来源和许可证记录见[上游清单](docs/UPSTREAM_INVENTORY.md)。

## 架构

```text
Next.js / React 界面
        |
        +-- foliate-js 与 PDF.js 阅读基础
        +-- 本地书库、设置、批注与缓存
        +-- 本地词典与原生/系统语音
        +-- 显式触发的翻译适配器
                |
                +-- DeepSeek V4、OpenAI、Anthropic Claude（固定官方地址和翻译模型）
                +-- Ollama
        |
        +-- Tauri v2 平台边界
                +-- Windows
                +-- macOS
                +-- Android
                +-- iOS
```

与平台无关的阅读和翻译逻辑保留在 TypeScript 中；文件系统、安全存储、原生语音和操作系统集成通过带类型的 Tauri 或应用服务适配器实现。

## 本地开发

### 环境要求

- 支持子模块的 Git
- Node.js 24
- pnpm 11；仓库固定了具体包管理器版本
- Rust 1.90 或更高版本
- Tauri v2 对目标平台要求的工具链
- Windows 需要 WebView2 Runtime，以及安装了 **Desktop development with C++** 工作负载的 Visual Studio Build Tools

### 初始化

```bash
git clone --recurse-submodules https://github.com/sakura99966/BabelLeaf.git
cd BabelLeaf
git submodule update --init --recursive
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @readest/readest-app setup-vendors
```

### 清理本地工作目录

开发和构建会产生 `target/`、`node_modules/`、`.next/`、`out/`、
`public/vendor/` 以及 `src-tauri/gen/` 下的忽略生成子目录。这些内容均可重新生成，
磁盘空间不足时可以删除。`src-tauri/gen/` 中受版本控制的移动端脚手架文件不得删除。
可选的 `.upstream/` 仅用于本地源码评估，也可在评估结束后删除。

删除依赖或供应商资源后，使用以下命令恢复：

```bash
pnpm install --frozen-lockfile
pnpm --filter @readest/readest-app setup-vendors
```

为减少上游兼容性风险，内部 workspace 包名和 Rust 库仍保留部分 Readest 标识。用户可见产品名称、Bundle ID、凭据命名空间和发布配置均使用 BabelLeaf。

启动桌面应用：

```bash
pnpm tauri info
pnpm tauri dev
```

运行主要验证：

```bash
pnpm --filter @readest/readest-app test -- --run
pnpm lint
pnpm format:check
pnpm --filter @readest/readest-app build
pnpm fmt:check
pnpm clippy:check
pnpm --filter @readest/readest-app test:rust
```

生成 Windows x64 未签名验证安装包：

```bash
pnpm --filter @readest/readest-app build-win-x64:unsigned
pnpm --filter @readest/readest-app test:windows-installer -- -PreflightOnly
```

NSIS 安装包内含 WebView2 离线安装程序。Tauri 也会将网页资源和必需资源嵌入主程序，因此安装目录内只有 `babelleaf.exe` 与 `uninstall.exe` 属于正常布局，不能据此判定文件缺失。发布验证仍必须在干净的 Windows 用户或虚拟机中完成安装、启动和卸载测试。

## 源码历史

当前代码树源自 [Readest](https://github.com/readest/readest) 提交 `8c212e5b8b019e40e162a7e20cb90f336a308f13`。迁移合并提交 `2bc0b11d` 保留了 BabelLeaf 早期基于 Koodo 的历史。迁移前的 BabelLeaf/Koodo 基线仍可在 main 历史中通过提交 `93bd8ebbc613906ca730717dfa3261e2ea93327d` 找到。

Koodo 是跨平台 Electron 桌面阅读器，并非仅支持 Windows。项目选择 Readest，是因为其 Tauri v2 结构为桌面端和移动端共享应用提供了更直接的演进路径。

## 许可证与署名

BabelLeaf 按 [GNU Affero General Public License v3.0 或更高版本](LICENSE) 发布，与当前 Readest 基线一致。必须保留上游版权、许可证、修改记录及源码分发义务。

字体、词典、OCR 模型、模型权重、语音、测试文档和其他随附数据需要分别审查许可证及再分发条件。将某个上游项目列为候选，不代表其代码或资源已经并入本项目。
