# 上游项目清单与整合决策

本项目以 Koodo Reader 为桌面端主程序基线，发布方式为开源。所有用户内容仅从本地导入；不包含网页抓取或资源下载功能。

## 本地源码镜像

以下仓库位于根目录的 `.upstream/`。该目录被 Git 忽略，仅用于许可证审计、接口验证和原型开发，不能直接作为主项目提交内容。

| 仓库 | 固定快照 | 许可证 | 计划用途 | 是否直接并入主程序 |
| --- | --- | --- | --- | --- |
| `readest` | `7786400` | AGPL-3.0-or-later | 多端 Tauri 架构、EPUB/PDF 体验的对照实现 | 否，保留为备选主程序路线 |
| `calibre` | `e94b07d` | GPL-3.0 | 格式转换、元数据与导入策略的参考；后续可评估调用其独立转换工具 | 否，不复制其桌面应用 |
| `yacreader` | `da08f0f` | GPL-3.0-only | 漫画书库、右至左、双页、缩放与归档格式交互参考 | 否，不复制其 Qt 应用 |
| `ballonstranslator` | `7fb91b6` | GPL-3.0-or-later | 漫画文字检测、OCR、擦字、嵌字和人工校正的候选本地工作器 | 是，候选实现 A（进程级集成） |
| `manga-image-translator` | `95227a2` | GPL-3.0 | 一键漫画/图片翻译、修复、排版的候选本地工作器 | 是，候选实现 B（进程级集成） |
| `mokuro` | `9f79b12` | GPL-3.0 | 原图上的可选择 OCR 文本层、日语学习与词典交互参考 | 是，评估其 sidecar/坐标模型 |
| `manga-ocr` | `c333b5d` | Apache-2.0 | 日语漫画 OCR 的轻量可替换引擎 | 是，作为 OCR 适配器候选 |
| `paddleocr` | `2661c7c` | Apache-2.0 | 中文、英文、日文和通用文档/图片 OCR 的主候选 | 是，作为 OCR 适配器候选 |

源代码镜像是浅克隆，不代表已在 GitHub 账户中创建远程 fork。待 GitHub 账号完成授权后，应将每一个需要修改的上游项目分别 fork 到组织/个人名下；主项目仅记录其 URL、提交号和许可证通知。

## 整合原则

不把多个完整应用拼接在一起。主程序只维护一套书库、阅读状态、设置与桌面 UI；外部项目通过清晰的本地任务协议接入。

```
Koodo Reader (Electron + React)
  -> 本地翻译任务队列
  -> OCR / 漫画处理 Worker (Python)
       -> PaddleOCR 或 manga-ocr
       -> BallonsTranslator 或 manga-image-translator
       -> 用户配置的翻译模型 API
  -> 结果包：页面、文本框坐标、原文、译文、样式、置信度
  -> 阅读器：原图 / 译文图 / 双语覆盖层 / 人工校正
```

`BallonsTranslator` 与 `manga-image-translator` 的能力重叠，第一版不能同时作为生产引擎。应基于同一套样本完成基准测试后选定一个主引擎，另一个仅保留为回退或参考。

## 近期验证任务

1. 准备合法拥有的测试资料：英文 EPUB、日文竖排 EPUB、文本型 PDF、扫描 PDF、日漫、彩色美漫、竖向条漫及无 DRM MOBI。
2. 为两套漫画引擎比较：日/英/中 OCR 准确率、文本框定位、擦字质量、竖排排版、CPU/GPU 速度、可取消性和错误可编辑性。
3. 定义统一 JSON 结果格式，确保更换 OCR、翻译模型或嵌字引擎时不影响书库和阅读器。
4. 先在 Windows 做完整闭环，再评估 macOS、Android、iOS 的 Worker 打包方案；移动端不能直接假设可运行桌面 Python 依赖。

## 许可证与发布要求

Koodo 和 Readest 使用 AGPL；Calibre、YACReader、BallonsTranslator、manga-image-translator 与 Mokuro 使用 GPL。发布基于这些代码的程序时，必须保留版权与许可证通知，并按相应许可证提供对应源代码。Apache-2.0 的 `manga-ocr` 与 `PaddleOCR` 仍需要保留许可证和 NOTICE（如有）。

模型权重、字体、词典数据、OCR 语言包、TTS 声音和第三方 API 条款不自动继承仓库许可证；将其打包或默认启用前必须单独审计。
