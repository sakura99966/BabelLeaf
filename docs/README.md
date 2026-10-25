# BabelLeaf 文档导航

先读[项目状态](PROJECT_STATUS.md)，再以[开发路线图](DEVELOPMENT_ROADMAP.md)确定开发和验收范围。此目录维护当前指南；旧版发布与已被后续记录取代的审计集中在 [history/](history/README.md)。

## 当前状态与协作

| 文档 | 用途 |
| --- | --- |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | 当前 PC 实现、外部暂缓项、源码/标签/安装包边界、最近主线证据 |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | 权威里程碑、版本顺序、范围及收尾验收要求 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 环境、启动、测试、构建和安全清理 |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 贡献范围、审查与受保护 PR 流程 |
| [SECURITY.md](../SECURITY.md) | 安全报告方式和支持边界 |

## 产品、架构与依赖

- [运行架构](../apps/readest-app/docs/architecture.md)
- [本地导入与联网策略](NETWORK_POLICY.md)
- [翻译需求](TRANSLATION_REQUIREMENTS.md)
- [Readest 基线决策](ADR-001-READEST-BASELINE.md)
- [上游来源、许可证及候选项目](UPSTREAM_INVENTORY.md)
- [格式样本矩阵](FORMAT_FIXTURE_MATRIX.md)
- [性能基线与预算](PERFORMANCE_BASELINE.md)
- [开发测试分层](../apps/readest-app/docs/testing.md)

## 漫画、本地模型与运行时

- [漫画 worker 协议](COMIC_WORKER_PROTOCOL.md)与[编辑工作区](COMIC_WORKSPACE.md)
- [OCR 基础](OCR_FOUNDATION.md)与[模型/验收门禁](OCR_GATE_HARDENING.md)
- [Tesseract WASM OCR](OCR_TESSERACT_RUNTIME.md)
- [通用 ONNX 适配边界](OCR_ONNX_ADAPTER.md)
- [本地 LaMa 修复运行时](INPAINT_LAMA_RUNTIME.md)

`docs/evidence/` 中的运行时证据有其固定日期、源码与验证范围，不因目录整理变成新版本验收。模型权重必须单独导入及审查，不能根据候选清单自动下载。

## 当前 0.4.6 验收与维护记录

- [0.4 PC 验收基准](PC_ACCEPTANCE_0.4.md)：要求本身，不等于当前全项通过。
- [0.4.6 发行范围](RELEASE_0.4.6.md)：内部维护版本说明，不表示已有公开 Release。
- [内部资格记录](PC_0.4.6_INTERNAL_ACCEPTANCE.md)：固定源码上的完整矩阵与限制。
- [整改执行台账](PC_0.4.6_REMEDIATION_STATUS.md)：失败先例及逐项整改证据。
- [2026-10-18 独立审计](INDEPENDENT_AUDIT_0.4.5_2026-10-18.md)：本轮整改来源。
- [依赖安全记录](DEPENDENCY_SECURITY_0.4.6.md)：原始告警、精确回补和平台边界。
- [2026-10-25 PR 维护记录](PR_REMEDIATION_2026-10-25.md)：后续安全与 CI 修正；最新完成状态见 PROJECT_STATUS。

## 历史与本地证据

[历史索引](history/README.md)保留 0.2–0.4.5 发行说明、旧验收及 PR #8 记录。内容属于当时快照，不应据此执行旧计划、恢复已移除服务或声称当前通过。

本地忽略目录 `target/` 与 `release/` 还包含原始日志、测试报告、安装包、SBOM、校验和和发布收据；它们不是一个可以整体删除的编译缓存。GitHub CI 工件有保留期，不等于长期发布资产。清理遵循[开发指南](DEVELOPMENT.md#工作区大小与清理)。
