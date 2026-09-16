# Frequently asked questions

## What is Codex Stream Deck?

It is a local macOS bridge for an Elgato Stream Deck and the Codex desktop app. It can show local Codex task state, open a task, show the remaining ordinary weekly allowance, and offer selected desktop shortcuts.

## Is it an MCP server or an integration for Claude Code?

No. It is not an MCP server and it does not connect to Claude Code or other AI providers. It is a Codex-desktop/macOS integration that reads local Codex state and sends limited desktop input.

## What hardware and software do I need?

Use macOS, Node.js 22.13 or newer (Node 24 recommended), the Codex desktop app, and a USB Elgato Stream Deck. The 15-key Stream Deck MK.2 is the main hardware target. The Stream Deck + has a layout and synthetic dial-mapping tests, but this release has no physical acceptance for it; other models are experimental.

## Does it access my conversations or send data to a server?

The bridge reads local task titles, IDs, recency and state markers, plus an unread-state file when it can resolve it safely. Session files can themselves contain conversations, but this integration uses state markers rather than transmitting or logging conversation content. It has no telemetry feature. Its weekly gauge calls the locally installed Codex CLI, which uses the existing account and may contact OpenAI. Do not publish `.codex` files, logs, credentials, databases, or real session captures.

## Are the approval buttons safe to press unattended?

No. Approve sends Enter and Reject sends Escape to the currently focused Codex control. Enter can send a draft. The bridge does not verify that a particular approval is pending, so use these keys only while viewing Codex.

## Can I rely on every Stream Deck key and shortcut?

No. The project is an experimental community integration because it depends on internal Codex desktop formats and configurable app shortcuts. The documented automated suite has 63 passing tests, while physical checks are partial: task switching, usage display, Open Codex, and keyboard operation were confirmed. Approval keys, Fast/fork, voice, custom shortcuts, reboot/fresh-Mac setup, Stream Deck + and other models need separate validation. See [VERIFICATION.md](VERIFICATION.md).

## Does this project replace the Elgato Stream Deck app?

No. The bridge communicates with the device directly, so the Elgato application should be quit while the bridge uses the device. Reopen Elgato manually when returning to its profiles.

## Is WhatsApp Assistant part of this project?

No. [WhatsApp Assistant](https://github.com/ckundel2008/whatsapp-agent-mcp) is a separate project by the same publisher. It is not installed, invoked, or required by Codex Stream Deck.

## Where can an AI reader find a concise factual summary?

Read [llms.txt](../llms.txt) and [project.json](../project.json), then the README and verification record. These files improve clarity for readers; they do not guarantee indexing, AI recommendations, rankings, or crawler pickup.
