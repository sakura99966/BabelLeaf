# BabelLeaf 当前开发状态

状态快照：2026-10-25。本文整理现有证据，不开启新版本、不新增验收豁免。

## 结论与边界

- 主线应用版本：`0.4.6`，沿用既定 0.4 Windows PC 功能范围。
- 当前结论：`INTERNAL_IMPLEMENTATION_PASS / EXTERNAL_VALIDATION_DEFERRED`。
- 0.4 的本地阅读、文本/双语/批量翻译、词典/朗读、漫画 OCR/修订/翻译/擦字/修复/嵌字/导出已有实现及内部验证；格式变体、真实供应商、人工质量和硬件覆盖不能由合成样本或 mock 测试代替。
- macOS、Android、iOS/iPadOS 尚未完成原生产品验收；共享代码、移动端脚手架或 Linux 测试不是这些平台的支持证明。
- 此次仓库整理仅调整说明、历史文档布局和无用资源/缓存，不关闭外部验收项，不授权 0.5 开发。

后续实施和验收以[权威路线图](DEVELOPMENT_ROADMAP.md)及 [PC 基准](PC_ACCEPTANCE_0.4.md)为准。

## 源码、标签与包不是同一状态

| 身份 | 已核实状态 | 使用限制 |
| --- | --- | --- |
| 整理前最近已验证主线 | `6499478a44c1efa56c4d08f25199dde51d924a55`，tree `86fb5279e3f082e0ba5c4fafd529104c2fb6c309` | 这是本次文档整理的应用基线，不是后续提交永久不变的 HEAD |
| 冻结 `v0.4.6` 源码标签 | 指向 `343c3765a`；本地归档在 `target/releases/0.4.6/main-343c3765a` | 历史标签/收据/字节不可改写；不包含其后全部维护提交 |
| 公开 GitHub Releases | 最新为 `v0.4.5` 预发布，另有 `v0.4.4`；尚无公开 `v0.4.6` Release | 不能把公开旧包宣称为当前主线安装包 |
| 最新已验证维护候选 | `6499478a...` 的标准 Windows CI 候选，来自下列主线运行 | 未签名内部候选，有 CI 保留期；不是新的稳定或签名发布 |

[公开发行页](https://github.com/sakura99966/BabelLeaf/releases)与[源码历史](https://github.com/sakura99966/BabelLeaf/commits/main/)是不同证据入口。版本号相同不能替代精确源码、产物哈希和测试收据。

## 最新主线维护证据

2026-10-25 对 `6499478a...` 的复核：

- 15 个历史 PR 均已关闭，其中 8 个合并、7 个关闭未合并；无待合并 PR。#12、#14、#15 通过保护流程合入，未绕过 main 保护。
- [应用 CI 40168287043](https://github.com/sakura99966/BabelLeaf/actions/runs/40168287043)：12 个作业通过，包括测试、原生/构建、安全及 Windows 精确包验证。
- [CodeQL 40168287060](https://github.com/sakura99966/BabelLeaf/actions/runs/40168287060)：3 项分析通过；[Scorecard 40168287054](https://github.com/sakura99966/BabelLeaf/actions/runs/40168287054)通过。合计 16 条最终检查记录成功。
- 最近维护回归：423 个单测文件，5,116 passed / 1 inherited skip；Rust 单测 52 passed。完整历史矩阵、浏览器/原生/性能测量的各自源码与日期见[资格记录](PC_0.4.6_INTERNAL_ACCEPTANCE.md)，不要把旧计数当成最新提交的测试计数。
- 标准安装候选通过安装、响应式启动、实际 UI hydration、卸载与用户数据哨兵保留；实际嵌入资源为 7 个组件 / 226 个资产 / 28,858,205 字节，strict SBOM 为 801 个组件 / 0 gaps。
- 保留工件名为 `windows-qualified-candidate-6499478a44c1efa56c4d08f25199dde51d924a55`，到期时间为 2026-11-24。临时 CI 工件不应当作永久下载地址或替换旧发布资产。
- 原始快照、日志、归档元数据与完成收据保存在本地 `target/pr-close-20261025/`；历史 PR 全量审计在 `target/pr-review-20261024-194238/`。这些目录受忽略，不会因提交本文自动上传。

这次文档整理提交本身仍须通过链接、diff、Git hooks 和受保护远端检查。整理不会复用上述候选哈希来宣称生成了新的二进制。

## 安全与已知限制

- 已补齐 Zod、serialize-javascript、fast-uri、Tokio 与 clipboard-win 后续安全修正，并删除无法保存的 root-owned APT 目录缓存；系统依赖安装和必需检查保留。细节见 [PR 维护记录](PR_REMEDIATION_2026-10-25.md)。
- JavaScript 门禁结论为 `PASS_WITH_PINNED_DEVELOPMENT_BACKPORTS`，production/full unresolved 均为 0；原始扫描仍有 2 条 extract-zip 开发依赖告警，以精确源码回补、回归及哈希门禁约束，而非全局忽略。Windows Rust 扫描为 0 漏洞 / 18 条已审查警告，不是所有平台零风险声明。
- 本机 cargo-audit 遇到 advisory DB 中 gettext alias 解析限制，不能记为本机扫描通过；最终新鲜 hosted Rust 扫描是对应证据。不得删除公告或降级门禁来消除该错误。
- CodeQL 当前 open 为 0；Scorecard 仍有 3 条开放观察：VulnerabilitiesID、CIIBestPracticesID、CodeReviewID。工作流通过不等于所有安全观察关闭；未手动隐藏告警。
- 继承的 Turso FTS UPDATE 测试保留 1 个 skip；生产索引使用 DELETE+INSERT。上游 GTK 弃用提示仍可见，不是本次维护引入的失败。
- Foliate 子模块的可复现安全准备会使 `git status` 显示 ` m packages/foliate-js`；不应为“清洁”而误提交私有 gitlink、重置安全修正或删除子模块。

当前安全约束与原始结果见[依赖安全记录](DEPENDENCY_SECURITY_0.4.6.md)。

## 必须保留的外部暂缓项

以下均为 `DEFERRED`，不是已通过、自动豁免或可由模型代签：

1. 真实 DeepSeek/OpenAI/Anthropic 凭据、付费调用授权及实际响应验证。
2. 合法代表性书籍/漫画与标准答案、人工 OCR/修复/排版质量评价。
3. 独立最低配置 Windows 主机上的精确包生命周期与资源验证。
4. EN/JA/zh-CN 本地语音的人工试听。
5. Authenticode 签名及签名后精确包验证。
6. 责任方对 AGPL、第三方组件、字体、词典和模型再分发的许可审查。

用户暂缓这些条件期间，仅可完成已授权的内部维护，不能擅自调用付费 API、上传内容、下载模型或宣称正式 PC 全项验收。

## 下一阶段

先完成当前维护的审查、远端备份与有限缓存清理。外部条件具备后按现有清单验证，并为新公开候选绑定新源码/包/收据，不覆盖历史 `v0.4.6` 标签与归档。后续平台路线仍是 0.5 macOS → 0.6 Android → 0.7 iOS/iPadOS → 0.8 平台一致性 → 0.9 RC → 1.0；进入下一阶段须满足路线图门禁和用户授权。
