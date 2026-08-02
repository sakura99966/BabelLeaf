# BabelLeaf security policy

## Current support status

BabelLeaf is pre-release software and has not published a supported release.
Development snapshots are for evaluation and have not completed the clean
runtime traffic capture, hostile-document, credential-storage, and
target-platform checks required for a supported release.

| Version | Security support |
| --- | --- |
| Unreleased migration branch | Best-effort fixes; not production supported |
| BabelLeaf releases | None published yet |
| Upstream Readest releases | Report to [Readest](https://github.com/readest/readest/security) unless the issue is caused by BabelLeaf changes |

This section will be replaced with concrete supported versions when BabelLeaf
publishes its first release.

## Intended security and privacy boundary

BabelLeaf is designed for local file import and local application data. The
only intended external network capability is translation through an
OpenAI-compatible endpoint that the user explicitly configures and enables.

The current source tree is derived from Readest. Inherited account,
synchronization, updater, telemetry, online catalog, payment, hosted API,
online dictionary, and online speech implementations have been removed from
the active BabelLeaf tree. Source deletion is not a substitute for dynamic
verification, so the current development tree must not yet be described as
privacy-hardened or release-ready.

The normative target and containment checklist are in
[`docs/NETWORK_POLICY.md`](docs/NETWORK_POLICY.md).

## Threat model

### Assets

| Asset | Why it matters |
| --- | --- |
| Imported books and comics | Files may be private, copyrighted, or sensitive |
| Reading state | Progress, highlights, bookmarks, notes, and history reveal user interests |
| Local settings and caches | Can contain paths, document identifiers, endpoint configuration, and translated text |
| LLM credentials | API keys or tokens may authorize paid requests and access to a private service |
| Translation payloads/results | Selected text or larger requested units may leave the device when a remote endpoint is used |
| Local dictionaries, fonts, voices, and future OCR models | May be confidential, licensed, or a supply-chain vector |
| Native application permissions | Tauri commands can access files, secure storage, processes, or the network if exposed too broadly |

### Threat actors

| Actor | Example goal |
| --- | --- |
| Malicious document author | Exploit EPUB/PDF/image/archive parsing, escape rendering isolation, read local files, or exfiltrate data |
| Malicious or compromised LLM endpoint | Capture book text/keys, return hostile content, redirect credentials, or exhaust local resources |
| Network attacker | Observe or modify remote translation traffic, especially when plain HTTP is used |
| Compromised dependency or build service | Inject code through npm, Cargo, Git submodules, native libraries, models, fonts, or release artifacts |
| Another local user or local malware | Read application data, credentials, caches, or temporary files |
| Accidental developer/operator action | Commit a key, enable inherited telemetry, publish private fixtures, or ship the wrong product identity/update channel |

### Trust boundaries

#### Imported documents

Every imported EPUB, MOBI-family file, FB2, PDF, archive, image, TXT, or
Markdown file is untrusted. Relevant risks include script injection, parser
memory-safety defects, path traversal, decompression bombs, oversized images,
malicious links, and remote subresource loading.

The release target is sandboxed rendering, strict sanitization, bounded parsing
and extraction, no automatic remote document resources, and narrowly scoped
native file access. The inherited baseline provides some sandboxing and parser
controls, but these controls require BabelLeaf-specific audit and regression
tests before release.

#### Tauri and native IPC

Compromised renderer content must not be able to invoke arbitrary file, shell,
OAuth, WebSocket, upload/download, secure-storage, or network operations. Tauri
capabilities, command inputs, filesystem scopes, custom protocols, and the CSP
must be reduced to the minimum BabelLeaf needs.

The Tauri HTTP permission and CSP accept dynamic HTTP(S) destinations because
the translation endpoint is user-defined. Native commands and feature code
must enforce the narrower product policy; platform permission alone is not
authorization for arbitrary traffic. This boundary requires source contracts
and runtime traffic tests.

#### LLM translation

A remote translation endpoint necessarily receives the text requested by the
user. BabelLeaf cannot control what that provider stores or how it uses the
content.

The intended client controls include:

- explicit endpoint/model configuration and opt-in;
- platform secure storage for API keys;
- no keys or book text in logs, analytics, ordinary settings, or exports;
- validation of schemes and hosts, plus redirect protection;
- clear distinction between loopback and remote endpoints;
- bounded requests, timeouts, cancellation, and rate/concurrency limits;
- no silent fallback to a different translation provider;
- no upload merely from importing or opening a book.

These are release requirements, not a claim that the migration branch already
implements every item.

#### Local data and credentials

Data directories and secure-storage service names must be BabelLeaf-specific
so an installation cannot collide with or impersonate Readest. Sensitive
temporary files should be minimized, permissions scoped, and secrets removed
on explicit user request.

Operating-system compromise, physical access to an unlocked device, and other
local malware are not fully preventable by the application, but avoidable
plaintext secrets remain a BabelLeaf responsibility.

#### Supply chain and releases

`pnpm-lock.yaml`, `Cargo.lock`, and Git submodule revisions pin major inputs,
but pinning alone does not prove they are safe. Changes to dependencies,
submodules, build actions, native binaries, models, fonts, dictionaries,
voices, or packaged data require provenance and license review.

BabelLeaf must not publish through inherited Readest signing identities,
updater keys, endpoints, application identifiers, or deployment workflows.

## Security issues in scope

Examples include:

- code execution, sandbox escape, or unauthorized native command invocation;
- reading or writing files outside intended local scopes;
- path traversal or unsafe archive extraction;
- automatic or undisclosed external requests;
- document, annotation, prompt, endpoint, or key disclosure;
- credential storage, redirect, header, or logging flaws;
- a bypass of the configured network capability policy;
- denial of service caused by realistic malformed document input;
- update, package, signing, or dependency-integrity issues;
- a collision with Readest data, secure storage, protocol, or updater identity.

General feature requests, compatibility problems without a security impact, and
questions about a third-party LLM provider's own service should use the normal
issue tracker. A vulnerability in unmodified upstream Readest may need
coordinated reporting to both projects.

## Reporting a vulnerability

Do not open a public issue, discussion, or pull request containing
security-sensitive details.

Use GitHub's private vulnerability reporting for BabelLeaf:

<https://github.com/sakura99966/BabelLeaf/security/advisories/new>

Include, where possible:

- a concise impact statement and affected component;
- the commit, platform, and build mode tested;
- minimal reproduction steps or a proof of concept;
- whether the behavior exists in upstream Readest;
- a redacted network trace or log if relevant;
- suggested mitigations or disclosure constraints.

Do **not** submit real API keys, access tokens, private book text, copyrighted
test files, personal annotations, unredacted local paths, or another person's
data. Construct the smallest redistributable fixture needed to reproduce the
problem.

The maintainers will respond on a best-effort basis while the project is
unreleased. They may request more information, coordinate with an upstream
project, prepare a fix, and agree on a disclosure date. Please keep the report
private until disclosure is coordinated.

Do not test against third-party production systems without authorization or
access data belonging to other users.

## Response process

For a confirmed vulnerability, maintainers should:

1. Triage exploitability, affected commits/platforms, data exposure, and
   whether upstream coordination is needed.
2. Contain the issue by disabling the path or documenting a safe workaround
   when practical.
3. Add a regression test before or with the fix where safe to do so.
4. Review related capabilities and variants rather than patching only the
   demonstrated input.
5. Prepare source and artifacts under BabelLeaf identities, then coordinate
   disclosure and a GitHub Security Advisory when appropriate.
6. Update the threat model, network policy, dependency inventory, or release
   process to address the root cause.

Severity is judged from impact and realistic exploitability. Remote code
execution, arbitrary local-file access, cross-origin API-key disclosure, and a
silent bulk upload of book content are examples of potentially critical
impact.

## Safe-harbor intent

Good-faith research that stays within the reporter's own data and systems,
avoids privacy violations and service disruption, and follows coordinated
disclosure will be treated constructively. This statement does not authorize
testing against third parties or override applicable law.

This policy is based on the inherited Readest security documentation but has
been rewritten for BabelLeaf's local-first product boundary and current
migration status.
