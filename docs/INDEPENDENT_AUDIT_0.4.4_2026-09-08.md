# BabelLeaf 0.4.4 独立审查与整改指南

## 1. 结论、范围与证据等级

审查日期：2026-09-08，Asia/Hong_Kong。

审查对象：本地 `main`，提交 `56048657b2cb9dc27492f19f002b352beb68d91f`，应用版本 `0.4.4`。开始审查时工作树干净。本文限定 Windows PC 及已经交付的共享阅读、翻译、词典、漫画、持久化和发布门禁；不将尚未进入开发阶段的 macOS、Android、iOS 功能列为缺陷。

**审查结论：当前不能认定 PC 功能已经可靠完成验收。既有回归测试通过，但独立检查发现安全隔离、数据持久化、翻译完整性和资源限制缺口，且最新 npm 安全门禁已不再通过。** 这些是当前范围内的整改，不需要开始 0.5 功能开发。

本文没有修改应用实现、依赖版本、路线图、历史标签或发布包。新增的复现脚本仅使用合成数据、内存文件系统和模拟 API 响应；没有读取 API 密钥、发送付费翻译请求、修改用户书库或实际攻击原生 IPC。

证据等级：

- **R：独立复现**。调用真实模块或浏览器机制，得到确定结果；注明模拟的边界。
- **S：源码确认**。检查入口、执行路径和防护，尚未在标准安装包中完成端到端复现。
- **A：最新公告匹配**。当前锁文件版本命中公告；不等于安装包中的可利用性已经证实。
- **E：缺少外部证据**。不能据此推定实现失败，也不能标记验收通过。

优先级：P1 为下一次当前版本修订必须优先解决的问题；P2 为应在收尾中完成的安全门禁或性能整改。本次不作“已发生密钥泄露”“任意文件读写”或“远程代码执行已实证”的结论。

## 2. 本次实际验证

| 检查 | 本次结果 | 解释 |
| --- | --- | --- |
| `corepack pnpm --version` | 11.1.1 | 与根 packageManager 一致 |
| `corepack pnpm --filter @readest/readest-app test -- --run` | 384 文件；4,779 通过，1 跳过 | 26.93 秒；不是从历史报告复制 |
| `corepack pnpm --filter @readest/readest-app test:browser` | 24 文件；313 通过，1 跳过 | 46.17 秒，Chromium |
| `corepack pnpm lint` | 通过 | 类型检查及 1,081 个文件的 Biome lint |
| `corepack pnpm format:check` | 通过 | 检查 1,119 个文件；不代表报告附带脚本被默认格式器覆盖 |
| `corepack pnpm --filter @readest/readest-app test:rust` | 51 通过 | 本次重新编译；MSVC 导入库提示为 warning，测试退出码 0 |
| `node docs/audits/2026-09-08/reproduce.cjs` | 所有缺陷特征断言成立 | 参见各条目；这里的退出码 0 表示缺陷仍能复现 |
| `corepack pnpm audit --prod --json` | 失败，2 high / 1 moderate | 最初沙箱网络失败，获准联网重试后取得公告结果 |
| Windows RustSec 最新审计 | 0 vulnerabilities；21 unmaintained / 3 unsound / 1 yanked 警告 | 独立数据库 1,242 条公告，提交 `8a1eb4f933fb5821add5b4e98601ebd90b8b3538`；2026-09-07 更新；命令退出 0 不等于无警告 |

本次未重跑生产前端打包、覆盖率、Web E2E、Tauri 集成、WDIO、NSIS 安装/卸载、300 秒性能门禁；未进行付费供应商调用、人工 OCR/TTS 质量审查或签名。本文是一轮缺陷审查，不是新的完整发布验收记录。历史 PASS 不能替代这些项目在整改后的重跑。

## 3. 整改清单

| ID | 优先级 | 证据 | 问题 |
| --- | --- | --- | --- |
| AUD-01 | P1 | R + S | SVG 章节绕过清洗；书籍脚本与应用父页面同源 |
| AUD-02 | P1 | S | 原生目录扫描以 `Readest` 子串绕过路径授权 |
| AUD-03 | P1 | R + S | 并发 sidecar 保存可让旧版本覆盖新版本 |
| AUD-04 | P1 | R + S | 模型输出截断被当作完整翻译成功 |
| AUD-05 | P1 | R | 一次临时写盘失败永久污染批量任务保存链 |
| AUD-06 | P1 | R + S | 词典 gzip 回退整包解压缺少输出预算和可取消隔离 |
| AUD-07 | P2 | A + S | 锁文件命中 3 项最新公告，现有 npm 门禁应失败 |
| AUD-08 | P2 | S | 漫画导出在收集全部页面之后才检查总字节限制 |

### AUD-01：SVG 与书籍脚本越过阅读内容隔离边界

位置：

- `apps/readest-app/src/app/reader/components/FoliateViewer.tsx:262`：只有 `application/xhtml+xml` / `text/html` 进入内容转换；SVG 返回原数据。
- `packages/foliate-js/epub.js:866` 附近 `Loader.createURL()` 与 `loadReplaced()`：SVG 转换后生成同源 blob URL；内联事件未在这里删除。
- `packages/foliate-js/fixed-layout.js:409,861` 与 `paginator.js:670`：iframe 同时启用 `allow-same-origin allow-scripts`。
- `apps/readest-app/src/services/transformers/sanitizer.ts:14`：开启 allowScript 时完全跳过清洗。
- `FoliateViewer.tsx:374,436`：允许脚本时还执行内联 `eval`；`src-tauri/tauri.conf.json` 的 script-src 允许 unsafe-inline / unsafe-eval / blob。

触发与实证：构造 EPUB 固定布局 SVG spine，SVG 的 `onload` 只修改父页面的无害审查标记。附带脚本使用真实 EPUB 类和 tauri.conf.json 中的 CSP，保持外部脚本加载禁止，并重现应用的 MIME 清洗分支。Chromium 结果：`htmlSanitizerReached=false`，父页面标记变为 `svg-inline-executed`。这一路径不需要开启 Allow JavaScript。另一个探针证明当前 iframe 组合下普通书籍脚本可修改父页面。

影响：书籍内容代码能够越过预期文档边界接触应用父页面。原生 IPC、应用数据、凭据能力因此需要视为潜在后续影响面，但本次没有执行敏感 IPC，不能把潜在影响写成已发生的读取或泄露。现有默认 HTML 清洗确实存在，不能误报为“所有 EPUB 默认不清洗”。

整改步骤：

1. 在创建可加载 blob 前，为 HTML、XHTML、SVG 及可能成为独立文档的资源建立统一信任边界。SVG 使用 SVG 安全策略；不能直接套 XHTML 包装器导致图像损坏。
2. 删除内联脚本、事件属性、可执行链接、嵌套文档及非必要外部资源；禁止原文 meta refresh。对 XML processing instruction、SVG foreignObject、data/blob 嵌套文档分别建立测试。
3. 当前 PC 版关闭书籍脚本执行入口并迁移遗留 allowScript=true 设置。若必须保留交互式书籍，应另行采用无应用同源和无 IPC 权限的隔离方案，不能以“信任文件”提示替代隔离。
4. 去掉 `evalInlineScripts`；在 Windows 验证移除书籍 iframe 的 allow-scripts 后选择、翻页、注释事件仍正常。其他平台兼容例外不能使 Windows 默认失去隔离。
5. 收紧 CSP；WASM/引擎所需指令应逐项验证，不得为了“测试能过”统一恢复 unsafe-eval/inline。

验收：默认和遗留允许脚本配置下，恶意 HTML/XHTML/SVG 均无法修改父页、调用父页桥接或自发发起请求；真实 Tauri WebView2 加入只返回固定值的 IPC 哨兵测试。保留正常 SVG 插图、固定布局、字体、选择、脚注和双语对照回归。未完成原生验证前只能关闭浏览器子门禁。

### AUD-02：目录扫描的路径子串例外

位置：`apps/readest-app/src-tauri/src/dir_scanner.rs:22`。

代码仅当 `!scope.is_allowed(path) && !path.contains("Readest")` 时拒绝，因此未授权目录只要含有 Readest 子串就会进入扫描。返回文件路径和大小。这里只验证起始目录，未为每个结果实施同样的授权检查；扫描也没有条目数、深度、耗时和取消预算。

影响与限制：具有应用命令调用能力的渲染器可以绕过这一命令自身的目录范围检查；这不是证明任何网页都能调用 IPC，也不是证明文件内容读取成功。`fs:read-all` / `write-all` 是命令授权集合，不能仅凭其名称推断文件系统路径完全开放。

整改步骤：移除字符串例外，统一使用明确的用户选择授权及受控迁移目录；规范化路径并拒绝 traversal、NUL 和非预期相对路径。对扫描子项复核作用域，确定 junction/reparse point 策略；分批返回并支持取消、条目数和扫描深度上限。不要把授权失败转化为更宽松的 JS 回退扫描。

验收：使用临时目录测试授权目录、未授权 `Readest-secret`、`Readest/../private`、大小写、junction、嵌套被拒目录、取消及超大树；不使用用户真实目录作为攻击样本。旧书库迁移仍必须通过已授权入口。

### AUD-03：并发持久化会回退到旧翻译

位置：`apps/readest-app/src/services/persistence.ts:65` 起 `safeSaveJSON()`；`src/app/reader/hooks/useTextTranslation.ts:135,474-480`；`src/services/nativeAppService.ts:390-403`；同类风险还影响 `src/services/translators/memory.ts` 的 persist。

原因：视口翻译允许 5 个并发请求；每次完成独立保存完整 artifact。safeSaveJSON 依次写 `.bak` 与主文件，但没有每路径的写序列、revision 校验或原子替换；原生 writeTextFile 也没有序列锁。

复现：阻塞 revision 1 的主文件写入，完成 revision 2 的两次写入，再释放旧写入。最终主文件为 revision 1，备份为 revision 2；safeLoadJSON 优先返回语法有效的主文件，恢复结果仍为 revision 1。两个 save 调用都成功。

整改步骤：

1. 把写入协调放到共享持久化层；至少按规范化的存储路径串行。多个 reader 窗口之间仅靠模块 Map 不够，应由原生存储服务执行协调或 revision/CAS。
2. 用单调 revision、schema 验证和临时文件原子替换建立提交协议；明确 Windows 替换和失败恢复语义。备份保存上一份已提交状态，不能称“两次普通覆盖”为原子写。
3. 合并 segment 增量或执行读改写事务，避免不同窗口各持有全量旧快照导致更新丢失。
4. 保存失败必须显示“结果尚未保存”，保留可重试脏状态；目前仅 console.warn，且“下次会话可以重试保存”的注释不成立，因为未保存结果可能随进程丢失。

验收：受控乱序写、同书两窗口、翻译记忆并发更新、磁盘满、只读、进程中断后，已确认保存的 revision 不回退。验证备份语法正确但 schema 错误时不能静默当成成功。重开书籍后与最终已提交的 segment 集合逐项一致。

### AUD-04：截断结果被保存为成功

位置：`src/services/ai/providers/AnthropicProvider.ts:54-74`；`src/services/translators/providers/llm.ts:152-165`；`src/services/translators/jobQueue.ts` 的非空结果 completed 分支。

复现：模拟 HTTP 200，响应包含文本及 `stop_reason: "max_tokens"`。真实 AnthropicProvider.generateText 返回该部分文本，没有异常。通用 SDK 路径也只读取 `.text`，丢弃 finishReason。批量切段 2,400 字符降低概率，但不消除供应商输出限制、推理预算、内容过滤或视口大段文本的问题。

整改步骤：把 provider 返回值改成带 text、finishReason、complete、usage 的结构；只接受明确完整的终止原因。截断、过滤、拒绝、空结果分别映射稳定错误，不写入成功缓存、翻译记忆或 reviewed 状态。超长输入先切段；重试不能自动扩大付费调用范围。Anthropic 非 2xx 错误保留 status / retry-after，不能仅抛弃状态码后用 message 猜测分类。

验收：模拟正常结束、max_tokens/length、refusal/content_filter、200 错误体、401、429、取消与超时；截断不得标记 completed。真实供应商验证仍是外部门禁，不以 mock 替代。

### AUD-05：临时保存失败令任务检查点永久失效

位置：`src/services/translators/batch.ts:413,429-495`。

原因：checkpoint/jobCheckpoint 通过 `.then(...).finally(...)` 链接到之前的 Promise。任何一次保存失败后，链保持 rejected；下一次 then 不运行。pendingSegments 在成功落盘之前清空，persisted 标记也提前更新。

复现：让 jobStore.save 仅第一次抛出合成磁盘错误，随后均可成功。任务最终内存状态 completed，但成功的后续持久化次数为 0，flush 继续拒绝，并出现未处理拒绝通知。

整改步骤：分别维护“可继续调度的内部执行尾链”和“对调用方可见的持久化错误”；失败数据保留到重试队列，只有成功提交后更新 persisted 标记。错误时暂停派发新付费请求并显示存储故障；恢复后先完成本地保存，再由明确操作继续。flush 必须涵盖当前脏状态并准确返回失败，禁止通过 catch 后当成功来消除问题。

验收：主/备份文件分别注入第一次、连续和间歇失败；恢复后不重复已完成 API 调用，所有已取得结果均可落盘；无 unhandledRejection，无内存 completed/磁盘旧状态却向用户显示已保存的情况。与 AUD-03 一起实现，但保留独立回归。

### AUD-06：词典解压缺少有效资源上限

位置：`src/services/dictionaries/dictZip.ts:231-246`；`src/services/dictionaries/dictionaryService.ts:488-497`。

原因：缺少 RA 或分块探测失败时，读取全部 blob 再同步 gunzip；导入时仅为取得友好名称也解压完整词典。没有输出字节上限或独立 worker 的取消边界。catch 无法避免主线程卡死或进程内存耗尽。

受控复现：真实 loadDictBody 接受 4,122 字节 gzip，返回 4,194,304 字节内容。这个小样本用于确认回退路径，不是实际 OOM 实验，也不证明所有压缩词典都有问题。

整改步骤：输入大小、实际解压输出字节、条目/索引长度分别设预算；gzip trailer 的 ISIZE 不能作为唯一可信限制。流式解压置于可终止 worker，累计输出超过预算立即失败；对合法大词典优先临时文件/范围读取，保留现有 DictZip 按块读。名称只读取对应区间，无法低成本读取则使用文件名。导入以暂存目录提交，失败清理半成品但保留旧词典。

验收：普通 gzip、有效 RA、损坏 RA、伪造尺寸、高压缩比、截断、取消、超预算均有稳定提示；UI 可响应，失败导入不污染索引。预算具体数值应由最低配置 Windows 实测确定，不用 350 MiB 空闲预算代替工作负载预算。

### AUD-07：最新依赖审计不通过

2026-09-08 npm 返回：

| 依赖 | 锁定版本 | 公告 | 公告级别 | 公告修复版本 |
| --- | --- | --- | --- | --- |
| browserslist | 4.28.2 | GHSA-c83g-rgw3-j3cx | high | >=4.28.7 |
| browserslist | 4.28.2 | GHSA-73wf-gq98-2v4g | high | >=4.28.7 |
| fflate | 0.8.2 | GHSA-px8p-9vwx-vf98 | moderate | >=0.8.3 |

来源：[Browserslist 缓存增长](https://github.com/advisories/GHSA-c83g-rgw3-j3cx)、[Browserslist 自定义统计输入](https://github.com/advisories/GHSA-73wf-gq98-2v4g)、[fflate ZIP64 无限循环](https://github.com/advisories/GHSA-px8p-9vwx-vf98)。npm 审计结果与 GitHub 公告在本次联网核对。

可达性判断：browserslist 经 Next/styled-jsx/Babel 依赖链进入审计，优先视为构建链风险，未证明书籍输入触发其查询。检索应用生产源码未发现 unzipSync 调用；fflate 生产路径主要使用 gunzipSync、Inflate、zipSync，unzipSync 出现在漫画导出测试。因此不能把该 ZIP64 公告直接写成“导入 CBZ 必定可攻击”。AUD-06 是另一个独立的资源边界缺陷，不是把该 CVE 套用到 gunzipSync。

整改：选择覆盖公告的兼容补丁版本，更新 manifest/override 与锁文件并检查所有传递副本；最小变更升级，不盲目升级整个框架。执行 frozen-lockfile 安装、生产 audit、词典/归档回归、构建和 SBOM 重生成。禁止降低 `.github/workflows/pull-request.yml:320` 的 moderate 门槛或仅改文档为 PASS。0.4.4 历史审计记录保留日期，不改写历史结论；新修订发布记录写入新扫描结果。

Rust 补充：执行 `cargo audit --target-os windows --db target/independent-audit-2026-09-08/rustsec-db --json`，更新库后 vulnerabilities=0；警告仍包含 glib 0.18.5 / RUSTSEC-2024-0429、lru 0.16.4 / RUSTSEC-2026-0253、rand 0.7.3 / RUSTSEC-2026-0097，以及 yanked chacha20 0.10.1。另有 21 条 unmaintained。应记录 `cargo tree --target x86_64-pc-windows-msvc -i <crate>` 的实际可达路径与处置，而不能将 GTK/macOS 的锁文件警告直接当作 Windows 运行时漏洞。整改时复核撤回原因和维护者替代版本；本次仅确认证据，不自动修改 Rust 依赖。

### AUD-08：漫画导出预算检查过晚且压缩占用主线程

位置：`src/app/reader/components/ComicWorkspaceDialog.tsx:1650-1715`；`src/services/translators/comicExport.ts:308-310,340`。

原因：UI 逐页 renderAsset 后将所有编码页面留在 pages，再调用 exportComicPages；256 MiB 总限制与 2,000 页限制在该函数中才执行。此时过大内容已累积；zipSync 还同步创建归档，保存前再复制 ArrayBuffer。

证据：调用链静态确认；本次未进行超大漫画峰值测量，不给出未经测量的 OOM 阈值。已有逐页 PDF 转换可避免第二整套 JPEG，不能据此认定整个导出有总内存约束。

整改：渲染前检查页数，生成每页后立即累计编码字节并执行总预算；将归档写入改为 worker + 流式临时文件/流，支持进度和取消；成功后才提交输出文件。避免先保存所有页面再检查，也避免归档结果最后一份无必要复制。JPEG/PNG 已压缩内容是否改为低压缩等级应以耗时/体积实测决定。

验收：边界页数、超过总字节限制、取消和磁盘满立即停止；记录 UI 长任务与完整进程树峰值，保证输出失败不修改源文件。合法小文件导出后解包/重新导入内容不变。

## 4. 需要同步处理的质量与文档问题

1. `apps/readest-app/AGENTS.md` 仍将云端供应商限定为 DeepSeek，而路线图和实现已有 OpenAI/Anthropic。应对齐已批准范围，防止后续模型误删合法适配器。`.claude/rules/verification.md` 还保留 koplugin Lua 检查说明；核实相应工程是否保留，再移除不适用指令。
2. artifact/job JSON 校验有类型检查，但没有统一的加载字节数、segment 数、字段长度和计数一致性预算。列为输入边界补强任务；本次未构造造成进程崩溃的 sidecar，不把它计为已利用漏洞。
3. 检查视口请求期间切换书籍、供应商、语言、模型时的结果归属：`useTextTranslation` 异步完成后读取可变 ref，应添加 generation/context token 测试；本次不将未复现的跨上下文写入列为确定缺陷。
4. 精简应以调用图和包产物证据为准。优先移除 AUD-01 的危险遗留脚本入口；不要把 parser、平台适配器、许可证文件或测试 fixture 仅因文件体积大而删除。目录大小不等于运行时内存消耗。

## 5. 执行顺序与交付要求

建议作为同一 `0.4.x` 整改周期，按可独立审查的变更提交：

1. **安全隔离**：AUD-01、AUD-02；先补默认 SVG 和目录范围回归，再修改实现。
2. **存储可靠性**：AUD-03、AUD-05；共享提交协议、跨窗口写入、脏状态恢复一并审查。
3. **翻译正确性**：AUD-04；输出完整性契约贯通 provider、queue、cache、memory、UI。
4. **资源边界**：AUD-06、AUD-08；限制应在分配前或流式处理过程中生效。
5. **依赖与治理**：AUD-07、文档对齐、输入补强；升级可先行独立提交，但不得掩盖其他缺陷。
6. **整改后验收**：全量单元/浏览器/原生测试、类型/lint/format、覆盖率、生产构建、Web E2E、Tauri/WDIO、最新 npm/RustSec 扫描、格式矩阵、精确候选包安装/启动/卸载/数据保留、性能、SBOM 和校验和。

每项提交需包含：失败回归、修复、受影响路径复核、验证命令和输出摘要。复现脚本是缺陷特征检查，不应直接作为“全部绿色即可验收”的长期测试；修复后把断言转换为期望安全行为，纳入正常 Vitest/浏览器/Rust 门禁。

当前审查仅输出报告与证据，不自动合并、推送或重发版本。未来正式修订使用新版本身份，不覆盖 v0.4.4 的源码标签与安装包。测试通过且证据可追踪后，再按既定流程审查合入 main、远端 CI、备份和有界缓存清理。

## 6. 仍然有效的外部验收门槛

`PC_0.4.4_RELEASE_ACCEPTANCE_2026-08-23.md` 中以下项目仍不因本文或回归测试通过而关闭：真实供应商凭据与付费调用授权；合法代表性 OCR/漫画语料及人工标准答案；精确标准包在独立最低配置 Windows 上的完整生命周期；EN/JA/zh-CN 人工语音听审；Authenticode 签名及签名后验证；第三方/模型/字体/AGPL 材料责任人审查。

关闭上述门槛与修复本文确定缺陷是两个必要条件。不能再沿用“没有待补 PC 问题，只剩外部证据”的结论。

## 7. 复现材料

脚本：`docs/audits/2026-09-08/reproduce.cjs`。

执行：`node docs/audits/2026-09-08/reproduce.cjs`。需要现有项目 Node/TypeScript/Playwright/Chromium 依赖；不安装新依赖、不触发真实供应商 API，浏览器请求均由本地 route 拦截并提供内存内容。

原始基线的预期特征：

```json
{
  "AUD-01-SVG": { "htmlSanitizerReached": false, "parentMutation": "svg-inline-executed" },
  "AUD-03": { "mainRevision": 1, "backupRevision": 2 },
  "AUD-04": { "stopReason": "max_tokens", "acceptedAsSuccess": "partial translation" },
  "AUD-05": { "successfulWritesAfterOneTransientFailure": 0, "queueStatus": "completed", "unhandledRejections": 1 },
  "AUD-06": { "compressedBytes": 4122, "expandedBytes": 4194304 }
}
```

AUD-05 的 PromiseRejectionHandledWarning 是被复现的问题信号，脚本通过监听器记录，不能通过删除监听器或隐藏日志当成修复。浏览器探针没有实际 Tauri 身份，故不替代原生安全回归。
