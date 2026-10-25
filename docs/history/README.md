# 历史记录

这些文件是固定日期和源码上的发布、审计或整改快照。它们保留失败先例、原始结论和出处，**不是当前待执行计划，也不是当前源码的通过证据**。当前状态见 [PROJECT_STATUS](../PROJECT_STATUS.md)，实施顺序见[路线图](../DEVELOPMENT_ROADMAP.md)。

2026-10-25 目录整理将以下文件从 `docs/<原文件名>` 移至相应子目录；仅为迁移修正相对 Markdown 链接，未重写历史验收结论。历史文中的旧路径、源码、包和收据引用应结合其原始提交读取，不能改写旧标签、原始日志或发布资产来适配新目录。

## 发行说明

- [0.2.0](releases/RELEASE_0.2.0.md)、[0.2.1](releases/RELEASE_0.2.1.md)、[0.2.2](releases/RELEASE_0.2.2.md)
- [0.3.0](releases/RELEASE_0.3.0.md)、[0.3.1](releases/RELEASE_0.3.1.md)、[0.3.2](releases/RELEASE_0.3.2.md)
- [0.4.0](releases/RELEASE_0.4.0.md)、[0.4.1](releases/RELEASE_0.4.1.md)、[0.4.1.2](releases/RELEASE_0.4.1.2.md)、[0.4.1.3](releases/RELEASE_0.4.1.3.md)
- [0.4.2](releases/RELEASE_0.4.2.md)、[0.4.3](releases/RELEASE_0.4.3.md)、[0.4.4](releases/RELEASE_0.4.4.md)、[0.4.5](releases/RELEASE_0.4.5.md)

当前 [0.4.6 范围说明](../RELEASE_0.4.6.md)仍在当前文档目录。发行说明的存在不意味着相应 GitHub Release 已发布。

## 旧验收与审计

| 记录 | 历史作用 |
| --- | --- |
| [2026-08-09 全量验证](audits/PC_0.4_FULL_VERIFICATION_REMEDIATION_2026-08-09.md) | 初次 0.4 PC 验证问题清单 |
| [2026-08-09 实施方案](audits/PC_0.4_ACCEPTANCE_REMEDIATION_PLAN_2026-08-09.md) | 当时整改安排，不是重新执行授权 |
| [2026-08-09 整改台账](audits/PC_0.4_REMEDIATION_STATUS_2026-08-09.md) | 逐项整改及失败先例 |
| [2026-08-13 自动验收](audits/PC_0.4_FINAL_AUTOMATED_ACCEPTANCE_2026-08-13.md) | 当时内部/外部拆分结论 |
| [2026-08-23 0.4.4 发布验收](audits/PC_0.4.4_RELEASE_ACCEPTANCE_2026-08-23.md) | 历史发布来源及外部限制 |
| [2026-09-08 独立审计](audits/INDEPENDENT_AUDIT_0.4.4_2026-09-08.md) | AUD-01–08 来源 |
| [2026-09-19 整改台账](audits/AUDIT_REMEDIATION_0.4.4_2026-09-19.md) | 被后续资格记录取代的执行证据 |
| [2026-10-11 0.4.5 内部资格](audits/PC_0.4.5_INTERNAL_ACCEPTANCE_2026-10-11.md) | 0.4.5 精确源码/包与通过范围 |
| [2026-10-12 PR #8 审查](audits/PR_8_CI_ACTIONS_REVIEW_2026-10-12.md) | CI 依赖维护审查 |
| [2026-10-13 PR #8 后续](audits/PR_8_MAIN_CI_FOLLOWUP_2026-10-13.md) | 当时 canonical-main 验证 |

`docs/audits/2026-09-08/reproduce.cjs` 与 `docs/evidence/` 的原路径保留，避免破坏复现脚本和固定证据引用。可再生缓存与唯一历史材料应分别管理，不能因文件名过时而删除证据。
