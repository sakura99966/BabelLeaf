# BabelLeaf 开发与维护指南

本文集中维护可执行的环境、测试和清理流程。功能与验收范围见[项目状态](PROJECT_STATUS.md)和[路线图](DEVELOPMENT_ROADMAP.md)，代码规则见 [AGENTS.md](../apps/readest-app/AGENTS.md)。

## 工具链与初始化

- Git 与子模块支持。
- Node.js 24、仓库固定的 `pnpm@11.1.1`。以下使用 `corepack pnpm`，避免全局 pnpm 版本漂移；Corepack 不存在时先安装/配置该入口。不要为绕过门禁改锁文件或禁用 hooks。
- Rust 1.90+ 与目标平台的 Tauri 2 工具链。
- Windows x64：MSVC 的 Desktop development with C++、Windows SDK、WebView2 Runtime。

从仓库根目录执行：

```bash
git submodule update --init --recursive
corepack pnpm install --frozen-lockfile
corepack pnpm verify:package-manager
corepack pnpm --filter @readest/readest-app setup-vendors
corepack pnpm tauri info
corepack pnpm tauri dev
```

`setup-vendors` 准备受追踪来源清单约束的 PDF/OCR/WASM/字体运行资源，不下载模型权重；`prepare-reader-security.mjs` 会对固定 Foliate 源码作可复现安全准备。保留该子模块状态，不提交新的子模块指针来掩盖它。

仅调试浏览器前端可用：

```bash
corepack pnpm --filter @readest/readest-app dev-web
```

Web 成功不等于 Tauri 或移动端通过。内部 `@readest/readest-app`、`Readest` Rust 包/库名为兼容性标识，避免无必要批量更名。

## 测试与审查

行为修复先写失败回归，再实现最小变更。所有命令均从根目录运行。

### 单测、类型与格式

```bash
corepack pnpm --filter @readest/readest-app exec dotenv -e .env -e .env.test.local -- vitest run --maxWorkers=4
corepack pnpm lint
corepack pnpm format:check
git diff --check
```

定向单测把测试路径直接放在 `vitest run` 后，例如：

```bash
corepack pnpm --filter @readest/readest-app exec dotenv -e .env -e .env.test.local -- vitest run src/__tests__/utils/misc.test.ts --maxWorkers=4
```

不要写成 `pnpm test -- --run ...`：额外的 `--` 在此脚本链路可能让筛选参数失效、跑错范围或进入观察模式。`--maxWorkers=4` 为本地资源限制，可按实际机器降低；不能借此跳过测试。

### 浏览器、格式与生产输出

```bash
corepack pnpm --filter @readest/readest-app test:browser
corepack pnpm verify:format-fixtures
corepack pnpm --filter @readest/readest-app build-web
corepack pnpm --filter @readest/readest-app test:e2e:web
corepack pnpm --filter @readest/readest-app build
corepack pnpm security:dependencies
corepack pnpm compliance:sbom
```

浏览器/E2E 需要对应浏览器依赖及生产静态输出；其分层、服务启动与 WebDriver 条件见[测试说明](../apps/readest-app/docs/testing.md)。安全检查可能产生网络请求以查询公告，但不得访问私人内容、调用翻译或隐瞒原始告警。SBOM 的发布资格还须绑定精确安装包/输出，不是仅执行通用命令。

### Rust 与原生

Rust 或平台行为修改还须执行：

```bash
corepack pnpm fmt:check
corepack pnpm clippy:check
corepack pnpm --filter @readest/readest-app test:rust
```

原生集成需要带 webdriver 功能的独立开发/验证实例，按[测试说明](../apps/readest-app/docs/testing.md)运行 `tauri:dev:test`、`test:tauri` 和 `test:e2e`。不得连接或破坏用户正在使用的生产书库。

### 文档整理的验证范围

纯 Markdown/目录整理至少验证本地相对链接、目录层级、格式/diff 和事实口径，检查历史文档与当前状态不混用。Git hooks 及远端保护检查照常执行；不为文档改动单独签发新二进制、版本或旧哈希。应用行为/包内容变化以及版本收尾仍需路线图要求的全量矩阵。

## Windows 验证包

```bash
corepack pnpm --filter @readest/readest-app build-win-x64:unsigned
corepack pnpm --filter @readest/readest-app test:windows-installer -PreflightOnly
```

这是未签名内部验证包，预检并非完整安装验收。优先在隔离测试用户/虚拟机中验证精确标准候选的安装、响应式启动、主工作流、关闭、卸载与数据保留。专用 smoke 产品须使用对应配置和独立产品标识，不能声称 smoke 包等价于标准发布包。

NSIS 包嵌入静态资源和 WebView2 离线安装程序；安装目录只有主程序及卸载程序不等于资源缺失。最终收据须绑定实际 source SHA/tree、包和 EXE 哈希、运行时清单、SBOM、精确包测试及远端状态。不要移动历史标签或覆盖归档。

## 仓库布局

| 路径 | 职责 |
| --- | --- |
| `apps/readest-app/` | 应用前端、测试及 Rust/Tauri 平台边界；内部名称保留 |
| `packages/` | 固定子模块/共享组件；保留上游许可与安全准备 |
| `scripts/`、`patches/` | 工具链、资源来源、安全回补和验证脚本 |
| `docs/` | 当前规范与验收入口；`docs/history/` 为历史快照 |
| `licenses/` | 第三方署名与许可证材料 |
| `target/`、`release/` | 忽略的本地构建输出与独立证据/发布资产混合目录，须逐项识别 |

## 工作区大小与清理

清理前列出绝对路径、大小、用途和保留依据；所有删除目标必须位于已确认的工作区内。先验证远端备份，再删除可再生内容。不要运行整仓 `git clean -xfd` 或递归删除整个 `target/`。

可以在进程停止且逐项确认后清理：

- `.next/`、`out/`、Vitest/Vite 缓存和覆盖率输出；确认不再被候选收据引用后再删。
- `target/debug/` 等已过时编译缓存；混合目录中的日志、安装包、模型、数据和证据不属于这一类。
- 依赖或 `public/vendor/` 只在确需回收空间且可按固定版本恢复时删除；不为几 KB 空索引反复重装依赖。
- 已结束评估且无唯一材料的忽略研究镜像。

必须保留：源码、`.env` 与凭据、书籍/漫画/词典/字体/模型包、sidecar、用户数据、许可证、原始失败和成功日志、SBOM、清单/校验和、发布收据与唯一包，以及 `src-tauri/gen/` 中受追踪的移动端脚手架。

清理记录应包含删除文件清单/大小及必要哈希；历史文档移动时修正相对链接、保留原始结论，并在[历史索引](history/README.md)注明旧路径仅是历史证据引用。每次版本收尾按[路线图](DEVELOPMENT_ROADMAP.md)重新执行完整门禁，不能由本清理指南豁免。
