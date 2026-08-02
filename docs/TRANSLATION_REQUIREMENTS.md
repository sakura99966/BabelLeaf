# Translation requirements

## Current release target

The current translation feature is a user-initiated, local-first reader
workflow. Its purpose is to translate selected text and reader-level content
without adding an account system, synchronization service, or generic remote
gateway.

### DeepSeek V4 setup and execution

1. The user selects **DeepSeek V4** in the AI Translation settings panel.
2. The user enters only a DeepSeek API key. BabelLeaf stores the key in the
   platform secure store on native builds and does not write it to ordinary
   settings files, backups, logs, or translation caches.
3. BabelLeaf uses the fixed official API endpoint
   `https://api.deepseek.com` and the built-in `deepseek-v4-flash` translation
   model. Neither value is user-editable in the current release.
4. Selecting text and opening the translation popup immediately submits the
   translation request. The popup displays the returned translation or a
   direct failure message; the user does not enter a prompt, URL, or model.
5. Every request includes the product-owned literary translation instruction:
   preserve meaning, tone, paragraph structure, names, formatting, and
   punctuation; return only the translation without explanations or Markdown.

The current implementation uses DeepSeek's OpenAI-compatible API format. A
legacy custom OpenAI-compatible API key is never migrated to DeepSeek, because
doing so could send a credential intended for another service to the DeepSeek
endpoint.

### Local alternative

Ollama remains an optional local provider. Its URL is constrained to loopback
origins by the native capability policy. It requires a local server and model;
it does not require a BabelLeaf-managed cloud account.

## Future provider architecture

OpenAI, Anthropic Claude, and any later providers will be added through named
provider adapters. Each adapter must define all of the following in the
application:

- the official API base address and protocol adapter;
- a vetted default translation model and the fixed system instruction;
- an API-key-only user interface, with no manually entered endpoint URL;
- a provider-specific secure-storage identifier;
- request, cancellation, error, and health-check behavior;
- exact CSP and Tauri HTTP permission entries; and
- unit, integration, and release-network verification.

This is intentionally not a generic "OpenAI-compatible endpoint" feature.
OpenAI-compatible and Anthropic-style APIs have different request and
credential semantics, and a provider-specific adapter prevents endpoint
mistakes, reduces exposed network scope, and keeps mobile porting behavior
consistent.

## Out of scope for the current release

- manual prompt editing and arbitrary endpoint/model fields;
- automatic background translation;
- chapter or full-book batch translation;
- bilingual aligned layouts, translation memory, glossary editing, and human
  review;
- scanned-PDF OCR translation and comic text detection, cleanup, and
  typesetting.

Those features require separate data models, bounded queues, progress and
cancellation UX, local result storage, and platform validation before release.
