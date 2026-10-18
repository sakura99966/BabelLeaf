# 0.4.5 PC 全文件范围审计与整改指引

审计日期：2026-10-18，Asia/Hong_Kong。审计源：main / a4436f875d21c9b08cf71c1bf19ccef2564e0c66。

## 1. 裁决与执行边界

**REOPEN_INTERNAL_GATES / EXTERNAL_VALIDATION_DEFERRED**。

当前 0.4 PC 功能主干和原有自动回归矩阵仍通过，但本次新增探针复现了未被原测试覆盖的安全、隐私和书籍配置可靠性问题；最新漏洞数据库也使既有 Rust 安全门禁失败。因此不能继续把历史 INTERNAL IMPLEMENTATION PASS 当作截至本审计日期的完整验收结论，不能据此进入 0.5。

本次仅审计、生成隔离探针和报告、清理可再生输出及有完整保留副本的重复构建文件。不修复产品、不调整路线图、不更改版本、不重打安装包、不提交/推送、不更改仓库权限或告警状态。历史 v0.4.4/v0.4.5 标签及发布资产保持不可变。

用户此前暂缓的真实供应商付费调用、合法代表样本人工质量、独立最低配置 Windows、人工听音、签名及所有者许可审查仍是 DEFERRED，不是本次自动通过或自动扩展授权。

## 2. 文件范围、方法与限制

- 主仓库受控条目 1,690；递归子模块受控文件 4,450，均建立实际工作区 SHA-256/大小清单。
- 审计开始时工作区包含 63,271 个普通文件，逻辑大小 5,514,693,253 字节。记录 2,809 个重解析链接，不跟随它们递归到工作区外；pnpm 硬链接可能使逻辑大小重复计数。
- 自动语法/导入调查解析 1,303 个 JS/TS 文件、12,206,165 字节。两个语法诊断均来自 Tauri 的未展开 Handlebars 模板，不是可编译产品源文件错误；压缩资源/声明文件使用哈希、依赖和调用链证据，而非把它们误当普通手写代码。
- 对受控脚本、Rust、配置、环境模板和文档执行脱敏密钥形状扫描，未命中所扫描模式；未读取被忽略的私有环境文件。这不是对所有密钥格式、Git 全历史或外部文件的零泄露证明。
- 手工重点检查本地导入、HTML/字典渲染、原生权限、翻译启动、供应商传输、缓存、配置/sidecar 写入、恢复、关闭、模型/worker、导出、SBOM、构建及路线图声明。
- “全文件范围”指完整盘点和自动调查加风险路径复核，不表示人工逐行证明所有第三方源文件、二进制、模型、字体或合法性均无缺陷。不能将通过的既有测试或静态不可达候选替代运行时证明。
- 原生 Clippy、52 项 Rust 单测、120 项 Tauri 集成、27 项 Windows UI、安装/卸载/数据保留及进程恢复使用同 SHA 的已归档远端证据。本次没有重新构建原生包、安装发布包或重复原生性能采样；与本次新跑的前端和安全检查分开标识。

原始证据：target/audit-20261018/。隔离探针：apps/readest-app/artifacts/audit-20261018/，均由现有忽略规则隔离；采用 .audit-probe.tsx 后缀，仅显式审计配置运行，不污染默认单测发现范围。

## 3. 新鲜验证结果

| 检查 | 本次结果 |
| --- | --- |
| pnpm 固定版本校验 | PASS，11.1.1 |
| 格式、类型、lint | PASS |
| 完整单元 + 覆盖率 | PASS；397 文件，4,923 通过，1 项既有 Turso FTS UPDATE 跳过 |
| 覆盖率 | statements 53.33%、branches 46.20%、functions 51.46%、lines 54.68%；未降低门槛 |
| 真实 Chromium 集成 | PASS；26 文件，320 通过，1 项既有跳过 |
| Web 生产构建、产物契约 | PASS；无未翻译占位符、无不兼容 lookbehind |
| 零重试生产 Web E2E | PASS；23 项 |
| Tauri 模式前端生产构建 | PASS；不是新原生二进制或安装包资格 |
| Rust 格式 | PASS |
| 格式矩阵 | PASS；48 条、39 个自制生成样本，external-required=0 |
| npm 生产声明图审计 | PASS；264 个依赖条目，无已知漏洞 |
| npm 完整声明图审计 | FAIL；57 个漏洞计数：critical 1 / high 29 / moderate 22 / low 5；52 个 advisory 条目、14 个包 |
| Rust Windows 锁文件审计 | FAIL，exit 1；12 条漏洞记录、18 条警告 |
| Rust 全平台锁文件审计 | FAIL，exit 1；13 条漏洞记录，额外包含非 Windows nix 问题 |
| 新增核心边界探针 | FAIL；5 个断言场景中 3 失败 / 2 对照通过 |
| 新增真实浏览器字典探针 | FAIL；1 失败 / 1 对照通过 |
| 保留探针后标准单测重新发现 | PASS；仍为 4,923 通过 / 1 跳过 |
| 发布资产身份 | PASS；现有 0.4.5 的 5 个本地文件与远端 SHA-256 一致；未替换发布资产 |

不要把 57、52、61 或 12 相互加减后称为独立可利用漏洞数量。这些是不同数据源/范围的扫描计数，实际启用特性、受影响函数和平台需逐条分析。

## 4. 必须先整改的 P1

### AUD18-01：本地字典 HTML 进入应用文档，可执行事件脚本

位置：

- apps/readest-app/src/services/dictionaries/providers/starDictProvider.ts:58。
- apps/readest-app/src/services/dictionaries/providers/slobProvider.ts:38。
- apps/readest-app/src/services/dictionaries/providers/mdictProvider.ts:547、588。
- apps/readest-app/src/app/reader/components/annotator/DictionaryResultsView.tsx:228、242。

StarDict HTML 直接进入 div.innerHTML 并追加到调用方实际容器。结果视图把真实页面容器交给 provider，没有统一消毒步骤。MDict/SLOB 存在相同的先解析/构造活跃 DOM 风险模式。

本次用内存生成的合法单词 StarDict 三文件样本、真实 provider 和真实 Chromium 复现：一个损坏 data-URI 图片的 onerror 将无害全局标记设为 1。安全断言失败，正常词条对照通过。没有外网图片、凭据、用户文件或原生 IPC 操作。

证据：final-dictionary-dom-probe.log、final-probe-results.json。这证明浏览器应用文档执行，不等于本次已在完整 Windows 安装包中验证任意原生权限调用。Tauri 构建可能注入额外 CSP hash/nonce，不能仅从配置中的 unsafe-inline 推断完整原生利用链；也不能依赖 CSP 掩盖未消毒的 DOM 边界。

整改要求：

1. 对所有字典 provider 建立统一的安全渲染入口，在任何活跃文档 innerHTML/附加操作前消毒。不要先创建带事件/远程资源的活跃树，再事后清理。
2. 过滤事件、脚本、危险 URL、嵌套浏览上下文及远程 CSS/资源；保留经过审查的本地图片、样式、词条导航和显式音频行为。
3. MDict 重定向文字提取和音频 onclick 解析也使用惰性/惰性文档策略，不执行词典提供的 JS。
4. 将探针迁入正式回归，并分别覆盖 StarDict、MDict、SLOB；加真正安装包/WebView2 的无脚本、无外联、无越权哨兵测试。

验收：所有字典样本的脚本标记/远程请求计数为零，正常查询、本地资源和取消/释放测试不退化。

### AUD18-02：保存的翻译显示开关隐式恢复联网能力

位置：

- apps/readest-app/src/app/reader/components/TranslationToggler.tsx:32。
- apps/readest-app/src/helpers/settings.ts:32。
- apps/readest-app/src/store/readerStore.ts:302。
- apps/readest-app/src/app/reader/hooks/useTextTranslation.ts:119、247、589、635。

translationEnabled 会保存进书籍配置并在重开时恢复。Hook 以它初始化 enabled，页面加载/可见性/进度监听随后可直接排队翻译。已有有效供应商配置且缺少对应结果时，重新打开/翻页可调用翻译入口，不需要本会话新的翻译操作。

本次 mock 探针没有点击、切换或手动调用翻译，仅恢复 enabled=true 并模拟可见区域，translate 被调用一次；enabled=false 对照不调用。真实配置恢复/保存链路已从源代码复核。没有调用真实供应商。

整改要求：把“显示既有译文/双语偏好”与“允许本会话发起请求”拆分。后者应由明确操作授予，并约束到书籍、供应商和上下文；重新打开、重启、新窗口和配置恢复默认只读取本地结果。保留用户主动开启后当前会话的视口翻译和显式任务恢复，不要以禁掉功能代替授权边界。

验收：有 Key/无 Key、有缓存/缺缓存、旧 enabled=true 配置、重开/重启/新窗口均不产生自动请求；明确按钮操作后才按所选服务翻译，取消/切换上下文后不继续派发。

### AUD18-03：书籍阅读配置/批注绕过原子恢复协议

位置：

- apps/readest-app/src/services/bookService.ts:667、682、687、703，及导入分支中的配置直接写入。
- apps/readest-app/src/services/nativeAppService.ts:391、406、419。
- apps/readest-app/src/store/bookDataStore.ts:154、158。

loadBookConfig 把“已有文件访问失败/解析失败”和“首次不存在”统统回落为默认配置。saveBookConfig 直接调用 fs.writeFile；原生普通写入最终是 writeTextFile，未使用已提供的 writeFileAtomic。正常批注/阅读配置不享受本次已加固的翻译 artifact/journal 保障。

本次两个独立产品断言失败：存在但读取 access denied 的配置不抛错；提供 writeFileAtomic 时保存仍只走普通写入。真正不存在的配置对照通过。未破坏实际文件，也未宣称本次已用强杀制造真实用户数据丢失。

整改要求：

1. 严格区分 ENOENT 与读取错误/截断/损坏/模式不匹配，保留错误与原始恢复副本，显示可恢复状态，不静默把批注当空。
2. 将普通书籍配置、导入更新及批注保存纳入串行/跨窗锁、原子替换、上一次有效备份、模式验证和恢复策略；保留旧版本兼容与未知字段策略。
3. 写入失败后保留脏配置和可见本地重试；正常退出必须等待/否决未保存批注，不能只保护翻译结果。
4. 检查 library/settings 对 safeLoadJSON 不传 validator 时的回落策略，防止同类静默初始化；不要未经验证批量替换所有 JSON 调用。

验收：缺失、拒读、半写、schema 错误、磁盘满、跨窗并发、写入中强杀均不静默丢失已有批注；恢复主/备份保留原始异常字节，后续保存不把错误默认态覆盖成“成功”。

### AUD18-04：最新 Rust 安全门禁已失败，历史 CI 不能代表当前数据库

门禁：.github/workflows/pull-request.yml:342，cargo audit --target-os windows。

独立 RustSec 数据库：999ec89d5d3f10f20be14750ec8c2d8b44e0ac9b；last-updated 2026-10-17T23:23:59+08:00。两种审计 exit 均为 1。

| 包/锁定版本 | Windows 审计记录 | 实际 Windows normal 图初步归属 |
| --- | --- | --- |
| quinn-proto 0.11.16 | RUSTSEC-2026-0338～0342，共 5 条 | cargo tree -p Readest --target x86_64-pc-windows-msvc -e normal -i quinn-proto 无启用路径；不能报为 5 个已证实 PC 漏洞 |
| rustls 0.23.45 | RUSTSEC-2026-0346～0349，共 4 条 | 经 reqwest / tauri-plugin-http 启用；各项仍有特定功能/调用条件 |
| zip 2.4.2 | RUSTSEC-2026-0367～0369，共 3 条 | native EPUB 依赖；已查调用点未使用公告的 ZipArchive::extract/ZipStreamReader::extract，不能仅凭包版本声称已复现越权解压 |

Windows 审计还记录 18 条警告（14 unmaintained / 3 unsound / 1 yanked），不再是旧记录的 15 条。全平台额外记录 nix 0.19.1 的 RUSTSEC-2021-0119，不应混作 Windows 运行时已证实问题。

整改要求：逐条记录功能/平台/调用可达性；优先兼容升级 rustls 到公告修复范围 >=0.23.46，并对 QUIC/ZIP 做锁图升级或有证据的正式处置。ZIP 公告修复范围涉及大版本，不能盲升或手工删锁文件行。不得静默加入全局忽略、降低门禁、修改旧数据库以恢复绿色。修复后在最新数据库、严格 Clippy、Rust 单测、原生导入/网络/安装矩阵上重新资格化。

原始 rust-windows-audit.json、rust-all-targets-audit.json、cargo-tree-*.log 为判断依据，不把条件漏洞夸大成已实现攻击。

### AUD18-05：复制到运行时的开发依赖未进入发布 SBOM/生产扫描闭包

位置：

- packages/foliate-js/package.json 的 pdfjs-dist 开发依赖。
- apps/readest-app/package.json 的 copy-pdfjs/setup-vendors。
- scripts/generate-sbom.mjs:84、271、288、290。
- apps/readest-app/public/vendor/pdfjs/pdf.min.mjs。

实际 vendor 和当前生产 out 中含 PDF.js 5.7.284；已发布 SBOM 有 796 个组件，但没有 pdfjs-dist 组件。生成器依赖 --prod 声明图，所以“gaps=0 / SOURCE_COMPLETE”并不证明复制资源闭包完整。npm --prod 的零漏洞也不能覆盖这条复制路径。

完整 npm 审计命中 GHSA-hq66-cqwq-w95j，修复范围 >=6.2.108。官方公告触发条件包括启用 scripting 和缺少有效 CSP。当前 Foliate 只使用底层 AnnotationLayer，未传 enableScripting，检查到的库路径以 falsy 值关闭相应 JS action；没有接入 PDFScriptingManager。本次未复现该公告在本产品中的利用，不应写成“PDF 已确认可执行任意 JS”。已有 isEvalSupported=false 不能单独冒充该公告所要求的 scripting 处置。

整改要求：对 PDF.js、WASM、worker、字体、样式等复制资源建立显式版本/来源/许可/校验和与最终产物路径清单，将真实运行时闭包纳入 SBOM 和安全检查。明确禁用 PDF scripting 并加行为回归；兼容升级或建立经审核的条件处置。不能只移动 package.json 分组、清掉扫描提示或更换旧 SBOM 来伪造历史发布已修复。

验收：每个最终 artifact 中的第三方运行时组件均能映射到精确版本、来源、许可和 hash；新增复制依赖时严格门禁能失败；PDF 正常渲染/注释/文本层/OCR 路由不退化。

## 5. P2/P3 与未验证项

1. 完整 npm 图的 57 个漏洞计数以 npm-all-audit.json 为准，均需按真实路径处置。critical 为 cpx2 -> shell-quote 1.10.0 的 GHSA-pqg4-j6r4-53mv；这是开发工具链发现，不是已证实发布阅读器可被远程命令执行。处理复制资源例外后再分别评价开发、测试和发布风险。
2. 当前仍有 7 条开放 code-scanning 告警：CodeQL 6～8（测试辅助代码），Scorecard 2～5（治理及未定向依赖扫描）。Scorecard 5 保留 61 条 OSV 发现；它与新 npm/Rust 计数范围不同。历史 PR 审批覆盖不足、Dependabot 漏洞告警未启用等状态不能被“工作流成功”代替；本次未更改设置或做虚假审批/告警关闭。
3. 性能记录需区分当前新测、同源历史证据、只有预算未有完整测量。此次没有重新测原生启动/300 秒 idle，也没有用同机合成负载替代最低配置、代表性 OCR/LaMa 质量。原有 import/page-turn/search/大队列/overlay 等预算应在下一次发布候选中补齐可定位的场景记录，不能用 heartbeat 通过代替所有延迟指标。
4. 静态导入图给出 23 个复核候选，而不是确定可删除名单。包含平台/测试适配、类型、构建 stub 及 UI primitives；必须结合所有调用入口和实际产物核对。Quota、CachedImage、useAutoHideScrollbar 等可先做引用复核；不要凭本调查直接删兼容层。未入包文件删除不一定降低运行时内存，应以 bundle/启动/进程树测量证明收益。
5. ComicWorkspaceDialog 等大组件可按副作用/状态所有权拆分，以降低回归风险；重型模型保持显式导入和惰性加载，批处理/导出继续限制并发和字节。不得为“精简”移除现有安全限额、恢复副本、诊断、许可或必要资源。
6. 使用官方 OpenAI 文档核对 gpt-5-mini 的现有接口，而非擅自换新模型；Claude 官方页仍列 claude-sonnet-4-6 为可用旧代模型。DeepSeek 官方页本次抓取超时，不能据检索摘要推导账号可用性。三家真实授权/计费/目的地验证仍 DEFERRED。

## 6. 路线图对照与推进决定

| 路线要求 | 结论 |
| --- | --- |
| 本地多格式阅读、诊断、合法自制样本矩阵 | 既有实现和本次回归 PASS；代表真实书籍/漫画质量仍外部 |
| 划词/段落/章节/全书、术语、记忆、审校、双语和 interchange | 功能回归 PASS；隐式重开请求边界因 AUD18-02 重开 |
| sidecar、任务恢复、关闭保护和原书不改写 | 翻译专用协议回归保留；普通书籍配置/批注因 AUD18-03 重开 |
| 本地词典与本地/系统语音 | 普通功能回归保留；字典安全因 AUD18-01 重开，人工听音仍外部 |
| 漫画 OCR/区域/掩膜/修复/嵌字/独立导出 | 服务与浏览器回归保留；不把自制样本和历史模型证据冒称本次真实安装包/代表质量全验收 |
| 安全供应链、SBOM、复制资源可追溯 | 因 AUD18-04/05 重开 |
| Windows 原生、安装、性能、发布追溯 | 同 SHA 历史自动证据与不可变资产验证存在；本次非全新安装包资格，外部门槛未关闭 |
| macOS/Android/iOS | 不属于当前 0.4 资格，本次未开发或宣称完成 |

推进决定：先修复 AUD18-01～05，保留本次失败证据并迁入正式回归。经用户确认进入新的 0.4.x 整改轮，不进入 0.5、不移动历史标签、不替换旧发布资产。整改后重新执行完整前端/浏览器/原生/安装包/最新依赖安全矩阵，生成准确新源与新 artifact 证据，再复审内部裁决。

## 7. 复现命令和证据索引

从仓库根目录运行；以下审计命令当前预期失败，失败正是需要修复的证据：

    corepack pnpm --filter @readest/readest-app exec vitest run --config artifacts/audit-20261018/audit.config.mts
    corepack pnpm --filter @readest/readest-app exec vitest run --config artifacts/audit-20261018/audit.browser.config.mts
    cargo audit --target-os windows
    corepack pnpm audit --audit-level moderate

探针不读取真实 API key，不发起真实付费请求，不触碰用户书籍、词典和配置；临时 DOM 标记在测试结束清理。首次夹具解析错误、对照预期错误保留为 setup-failure 记录，不计作产品缺陷；以 final-*.log 和修正后 3 失败/2 通过、1 失败/1 通过为最终结论。

关键机器记录（target/audit-20261018）：

- workspace-inventory.json；tracked-file-hashes.json；source-survey.mjs/json；tracked-secret-shape-scan.json。
- local-checks.json；unit-coverage.log；coverage/coverage-summary.json；browser-result.json/browser.log。
- production-validation-result.json；production-tauri-frontend-result.json；production-*-*.log；format-fixtures-result.json。
- final-probe-results.json；final-core-boundary-probes.log；final-dictionary-dom-probe.log；probe-isolation-result.json。
- npm-production-audit.json；npm-all-audit.json；npm-advisory-disposition-input.json；rust-audit-exits.json；rust-*-audit.json；cargo-tree-*.log。
- copied-vendor-sbom-gap.json；current-open-alerts.json；remote-main-runs.json；remote-run-*.json。
- release-hash-verification.json；duplicate-build-copy-inventory.json；cleanup-result.json；final-reconciliation.json。

清理结果与最终工作区身份以生成的 cleanup-result.json、final-reconciliation.json 为准。本轮删除 2,429 个文件，逻辑大小合计 3,088,745,019 字节（约 2.88 GiB，非保证相同物理磁盘释放量）：仅包含可再生输出和 3 个经 hash 证明存在规范归档的重复构建副本。重复副本可从回执所列 canonicalPath 恢复；全部唯一历史发布/候选资产、探针、报告、日志、依赖、用户数据和凭据保留。可再生输出不作为新的发布证据。

官方参考：

- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[gpt-5-mini](https://developers.openai.com/api/docs/models/gpt-5-mini)。
- [Claude Sonnet 4.6](https://platform.claude.com/docs/en/models/sonnet-4-6/overview)。
- [Mozilla PDF.js GHSA-hq66-cqwq-w95j](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j)。
- [RustSec RUSTSEC-2026-0346](https://rustsec.org/advisories/RUSTSEC-2026-0346.html)、[RUSTSEC-2026-0368](https://rustsec.org/advisories/RUSTSEC-2026-0368.html)。其余逐条 ID、修复范围和数据库来源见保存的审计 JSON；引用不构成本次已证明所有攻击可达。
