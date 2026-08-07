# BabelLeaf 0.4.0 performance baseline

The 0.3.2 baseline is a gate for later OCR and mobile work. Values are
measured on the release machine and are targets rather than a claim that every
future device has the same performance.

| Measurement | Budget | Measurement method |
| --- | ---: | --- |
| Cold startup | 2500 ms | package launch to first interactive library frame |
| Idle memory | 350 MiB | five minutes with no book open or queue active |
| Import | 8000 ms | local EPUB/PDF fixture to first readable page |
| Page turn | 250 ms | p95 across 50 turns on a warmed fixture |
| Search | 500 ms | p95 local full-book search |
| Chapter translation queue | 60 s | 20 bounded text segments using a mock provider |
| Full-book queue | 15 min | 5000 segments using a mock provider and recovery checkpoints |
| Peak memory | 1024 MiB | maximum during import, queue recovery, and interchange |
| Disk cache | 1024 MiB | bounded generated cache during the scenario |
| Base package | 250 MiB | unsigned Windows package before optional model packs |
| OCR page | 15000 ms | one bounded local page at the selected model resolution |
| OCR peak memory | 1024 MiB | maximum while decoding a page and producing regions |

The machine-readable budgets are exported as
`TRANSLATION_PERFORMANCE_BUDGETS` from
`apps/readest-app/src/services/translators/formatMatrix.ts`. Heavy OCR,
inpainting, dictionaries, speech engines, and model packs are excluded from
the startup path. OCR measurements must additionally record model manifest
checksum, runtime (`cpu`, `gpu`, or `unknown`), language set, page dimensions,
worker count, and whether the CPU fallback was used. A benchmark must record
OS, CPU, RAM, package revision, fixture hash, provider mode, worker count,
peak memory, and cache size.
