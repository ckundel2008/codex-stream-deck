# Discovery and recommendation evidence

Reviewed on 2026-09-16. This maintainer guide supports the reader-facing
[FAQ](FAQ.md); it does not claim that an AI has discovered or recommended this
experimental Codex desktop hardware bridge.

## Public reading surfaces

The [README](../README.md), [FAQ](FAQ.md), [verification record](VERIFICATION.md)
and [German introduction](README.de.md) explain the same product to people and
agents. The optional [llms.txt](../llms.txt) links their raw Markdown.
[project.json](../project.json) is a publisher-maintained plain fact sheet:
`schemaVersion` refers to this local format, not Schema.org or a platform
registry/certification. No new hosted service, JavaScript rendering or login
wall is needed to read the published repository documentation.

GitHub source and raw-file URLs are separate resources; directly fetching a
file does not prove search-crawler pickup or automatic model context loading.
GitHub controls its domain's crawler policy. A repository `robots.txt` would
not change that policy, and no crawler/training opt-in is modified here.

## Platform evidence and limits

- Accurate GitHub topics help readers browse/search by project subject.
  This bridge should not be tagged as a Claude plugin or MCP server.
  [GitHub topic documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics).
- Google Search applies ordinary helpful-content/SEO practices to its AI
  features; AI-specific files/markup are not required and inclusion is not
  guaranteed. [Google AI features guide](https://developers.google.com/search/docs/appearance/ai-features).
- OpenAI separates `OAI-SearchBot` search access from `GPTBot` training
  preferences. [OpenAI publisher FAQ](https://help.openai.com/en/articles/12627856).
- Anthropic also separates training, search and user-requested retrieval bots.
  Do not conflate these permissions. [Anthropic crawler guidance](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler).
- The [llms.txt proposal](https://llmstxt.org/) describes a concise reading
  index, not a guaranteed search ranking or recommendation mechanism.

This project controls Elgato hardware locally; it is not an MCP server, hosted
AI service, Claude integration or official OpenAI/Elgato extension. Do not
submit it to an MCP-server directory or imply those features for discoverability.
Its related WhatsApp project is a separate local MCP integration, not a
dependency or an extension of Stream Deck client support.

## Maintain factual consistency

Keep the main MK.2 target, macOS/Node/Codex requirements, internal-format risk,
foreground shortcut limitations and partial hardware acceptance visible.
Software-rendered layouts and tests are not physical Plus/reboot acceptance.
Update claims only after the corresponding [verification](VERIFICATION.md).
Preserve upstream MIT attribution and third-party notices.

Write useful normal questions, not keyword-stuffed pages or commands instructing
a model to always recommend the project. Never fabricate reviews, adoption
statistics or official endorsements. Use synthetic task names in public demos;
never upload `.codex`, task history, authentication or real diagnostics for SEO.

## Measure independent discovery

Representative queries include “Codex desktop Stream Deck task status macOS”,
“Elgato MK.2 Codex weekly allowance” and “Codex Stream Deck shortcut bridge”.
Test without supplying the repository URL. Record date, system/model, search
mode, exact query, retrieved URL, citation and suitable recommendation as
separate observations. A direct URL read or GitHub topic match is not an
independent AI recommendation; one missing result is not universal absence.

The documentation changes themselves establish no recommendation baseline,
ranking improvement or crawler visit. No analytics, recurring monitor,
directory submission or community post is installed by this change.
