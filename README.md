# BabelLeaf

跨越语言，继续阅读。

[English](README_en.md) · [项目状态](docs/PROJECT_STATUS.md) · [文档导航](docs/README.md) · [开发路线图](docs/DEVELOPMENT_ROADMAP.md)

BabelLeaf 是面向简体中文用户的开源、本地优先阅读器，用于阅读中文、英文、日文等语言的书籍和漫画，并提供文本翻译与本地漫画编辑工作流。项目基于 Readest，采用 Tauri 2、React/Next.js、TypeScript 和 Rust。

当前以 **Windows x64 PC** 为交付和内部验收平台。macOS、Android、iOS/iPadOS 保留共享代码与平台适配结构，但尚未完成各自的原生产品验收。

## 当前版本与下载

截至 2026-10-25，主线应用版本为 **0.4.6**，状态为 `INTERNAL_IMPLEMENTATION_PASS / EXTERNAL_VALIDATION_DEFERRED`：当前 PC 范围的内部实现验收通过，外部验证仍暂缓；这不是稳定版或签名生产版的完整验收结论。

- [GitHub Releases](https://github.com/sakura99966/BabelLeaf/releases) 当前公开的最新预发布为 **v0.4.5**，不包含之后的全部主线整改。
- `v0.4.6` 是已冻结的历史源码标签，尚未发布对应的 GitHub Release。后续维护提交、CI 候选包与该标签不能混为同一份产物。
- 安装包为未签名验证包。下载前核对对应发布记录、SHA-256 和已知限制；不要用历史安装包代替当前源码的测试证据。

精确源码、CI、安装验证和发布边界见[项目状态](docs/PROJECT_STATUS.md)。

## PC 端现有功能

| 能力 | 当前范围 |
| --- | --- |
| 本地阅读 | EPUB、PDF、MOBI/AZW/AZW3、FB2/FBZ、CBZ/ZIP、TXT、Markdown；书库、搜索、目录、进度、高亮、笔记与阅读外观设置 |
| 文本翻译 | 划词、阅读单元、章节、全书翻译；内置指令与命名供应商预设；取消、失败提示、暂停、恢复、重试及本地缓存 |
| 双语与校订 | 原文、译文、上下及并排对照；稳定定位锚点；术语表、翻译记忆、人工校订及机器结果保留 |
| 可迁移数据 | 不改写原书的本地 sidecar；翻译、术语与校审数据的 JSON/TSV、TBX/TMX/XLIFF 互操作，具体类型见需求文档 |
| 词典与朗读 | 导入本地词典、支持平台的系统词典，以及本地/系统语音；无在线词典或云端语音回退 |
| 漫画与扫描页 | PDF/CBZ/FBZ 阅读器内漫画工作区；本地图片或 PDF 页面导入；本地 OCR、可选文本层、区域修订、区域翻译、擦字与水平/RTL/竖排 CJK 嵌字 |
| 漫画流程与导出 | 多阶段任务、检查点与重启恢复；可选本地 LaMa 修复；独立图片集、CBZ/ZIP 或纯图片 PDF 导出，禁止覆盖原文件 |
| 资源与安全 | 按需加载解析器和本地推理运行时；有界队列、缓存与输入预算；不可信书籍/词典内容隔离及凭据保护 |

能够识别格式，不代表所有文件变体均已兼容。请使用合法取得的无 DRM 文件；损坏、加密、不支持或超限内容应得到明确提示，而不是绕过保护。

OCR 使用本地 Tesseract WASM 运行时；LaMa/ONNX 修复为可选功能。**模型权重不随安装包附带，也不会自动下载**，需用户显式导入符合校验、许可证和能力要求的本地模型包。具体接入见[OCR](docs/OCR_TESSERACT_RUNTIME.md)与[修复运行时](docs/INPAINT_LAMA_RUNTIME.md)文档。自动化测试不等于代表性漫画的人工质量验收。

## 翻译与隐私

1. 书籍与漫画只从本地导入；书库、批注、sidecar、任务和缓存保存在设备上，原始内容不被译文覆盖。
2. 云端预设为 DeepSeek V4、OpenAI 和 Anthropic Claude。选择供应商、填入自己的 API Key 后，由内置地址、模型及翻译指令处理请求；不开放任意服务器地址或任意模型配置。
3. Ollama 仅允许本机回环地址。使用云端翻译时，用户明确选择的待翻译内容会发送给对应供应商，并可能产生费用；API Key 不写入导出的 sidecar。
4. 导入、打开、普通阅读、查本地词典或本地朗读不会自动发起翻译；批量或连续翻译也须由用户明确启动，并受会话授权与任务控制约束。
5. 不提供账号、云同步、资源搜索或抓取、OPDS/RSS、遥测、在线元数据、在线词典、云 TTS 或自动更新服务；不提供 DRM 破解。

真实付费供应商调用、合法代表性语料与 OCR/修复人工质量、独立最低配置 Windows、人工语音试听、签名及责任方许可审查仍由用户暂缓，**不能记为通过**。详见[联网策略](docs/NETWORK_POLICY.md)和[PC 验收基准](docs/PC_ACCEPTANCE_0.4.md)。

## 从源码运行

需要 Git（含子模块）、Node.js 24、仓库锁定的 pnpm 11.1.1、Rust 1.90 或更新版本；Windows 还需 MSVC C++ 桌面开发工具链及 WebView2 Runtime。

```bash
git clone --recurse-submodules https://github.com/sakura99966/BabelLeaf.git
cd BabelLeaf
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @readest/readest-app setup-vendors
corepack pnpm tauri dev
```

命令假定已安装 Corepack；缺少时先配置该包管理器入口。不要以全局不同版本的 pnpm 改写锁文件。内部 `@readest/readest-app` 包名和部分 Rust 标识因兼容性保留，不代表用户可见产品仍是 Readest。

完整环境、测试、构建及安全清理说明见[开发指南](docs/DEVELOPMENT.md)；提交要求见[贡献指南](CONTRIBUTING.md)。

Windows NSIS 包嵌入网页资源及 WebView2 离线安装程序，安装目录只有主程序和卸载程序可以是正常布局。发布仍须以**同一个精确安装包**完成安装、响应式启动、卸载与用户数据保留验证，不能只看文件数量或构建成功。

## 仓库导航

- [当前状态与证据入口](docs/PROJECT_STATUS.md)：哪些已实现、哪些仍未验证，以及源码与发布包的区别。
- [权威路线图](docs/DEVELOPMENT_ROADMAP.md)：后续依次为 macOS、Android、iOS/iPadOS、平台对齐、RC 和 1.0；未验收的平台不因共享代码而自动获得支持声明。
- [文档导航](docs/README.md)：架构、需求、OCR、性能、安全和验收资料。
- [历史记录](docs/history/README.md)：旧版发行说明及被后续记录取代的审计，不作为当前通过证据。

## 开源与许可证

BabelLeaf 遵循 [AGPL-3.0-or-later](LICENSE)，保留 Readest 及各组件的署名与许可证义务。当前阅读基础还使用 foliate-js、PDF.js 等组件，来源和选型见[上游清单](docs/UPSTREAM_INVENTORY.md)及[基线决策](docs/ADR-001-READEST-BASELINE.md)。早期 Koodo 基线保留在 Git 历史中，不是另一个随软件运行的阅读器。

字体、词典、模型、语音及测试资料须单独核对再分发条件。候选项目清单不代表已经集成。安全问题请按[安全策略](SECURITY.md)报告，不要公开凭据或私人书籍。
