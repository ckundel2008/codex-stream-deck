import { execFile } from "node:child_process";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUNDLE_ID = "com.openai.codex";
const DIRECT_ACTION = Object.freeze({
  ACT06: "fast", ACT07: "approve", ACT08: "reject", ACT09: "split",
  ACT10: "voice", ACT11: "voice", ACT12: "submit",
});

export function directActionForKeycode(keycode) {
  return DIRECT_ACTION[keycode] ?? null;
}

/** Open the task in Codex, including installations still named ChatGPT.app. */
export function openCodexThread(threadId, run = execFile) {
  if (!UUID.test(String(threadId ?? ""))) return false;
  run("/usr/bin/open", ["-b", BUNDLE_ID, `codex://threads/${threadId}`], error => {
    if (error) console.error("Stream Deck: could not open the Codex task.");
  });
  return true;
}

/** User key presses may open Codex; the background service never launches it. */
export function activateCodexApp(run = execFile, callback = () => {}) {
  run("/usr/bin/open", ["-b", BUNDLE_ID], callback);
}

/** Queue an action only after activation succeeds; AppleScript checks focus too. */
export function runDirectCodexAction(action, opts = {}) {
  const run = opts.execFile ?? execFile;
  const script = action === "open-codex" ? null : directActionScript(action, opts);
  if (action !== "open-codex" && !script) return false;
  activateCodexApp(run, error => {
    if (error) {
      console.error("Stream Deck: Codex activation failed; no shortcut sent.");
      return;
    }
    if (!script) return;
    run("/usr/bin/osascript", ["-e", script], { timeout: 8000 }, error => {
      if (error) console.error(`Stream Deck action ${action}: ${classifyActionError(error)}.`);
      else console.error(`Stream Deck action ${action}: shortcut delivered (UI outcome not verified).`);
    });
  });
  return true;
}

/** Report actionable categories without logging app content or full subprocess output. */
export function classifyActionError(error) {
  const text = String(error?.stderr ?? "") + String(error?.message ?? "");
  if (/-1743|not authorized to send Apple events/i.test(text)) return "Automation permission denied; allow this Node runtime to control Codex and System Events";
  if (/-1719|-25211|not allowed|not permitted|assistive|keystrokes|Tastatur|Tastenanschläge/i.test(text)) return "Accessibility permission missing; allow this Node runtime in macOS Privacy & Security > Accessibility";
  if (/Codex is not frontmost/.test(text)) {
    const bundle = text.match(/Codex is not frontmost: ([A-Za-z0-9._-]+)/)?.[1];
    return `cancelled because Codex lost focus${bundle ? ` (foreground app: ${bundle})` : ""}`;
  }
  if (/-10814|-1728|application.*not found/i.test(text)) return "Codex application could not be found";
  return `failed (exit ${error?.code ?? "unknown"}; check macOS Automation and Accessibility permissions)`;
}

export function directActionScript(action, opts = {}) {
  const env = opts.env ?? process.env;
  const locale = opts.locale ?? env.CODEX_DECK_LOCALE ?? "de";
  const keystroke = {
    "quick-chat": 'keystroke "n" using {command down, option down}',
    archive: 'keystroke "a" using {command down, shift down}',
    voice: 'keystroke "v" using {control down, shift down}',
    approve: "key code 36", submit: "key code 36", reject: "key code 53",
    "reasoning-up": 'key code 126 using {command down, control down}',
    "reasoning-down": 'key code 125 using {command down, control down}',
  }[action];
  const commands = {
    de: { fast: "Schnellmodus umschalten", split: "Chat verzweigen" },
    en: { fast: "Toggle Fast mode", split: "Fork chat" },
  };
  const command = action === "fast" ? env.CODEX_DECK_FAST_COMMAND ?? commands[locale]?.fast
    : action === "split" ? env.CODEX_DECK_SPLIT_COMMAND ?? commands[locale]?.split : null;
  if (!keystroke && (!command || /[\r\n\x00-\x1f]/.test(command) || command.length > 120)) return null;
  const guard = `set foregroundApp to first application process whose frontmost is true
  set foregroundBundle to bundle identifier of foregroundApp
  if foregroundBundle is not "${BUNDLE_ID}" then error "Codex is not frontmost: " & foregroundBundle`;
  const body = keystroke ? [keystroke] : [
    'keystroke "k" using {command down}', 'delay 0.25', guard,
    `keystroke ${JSON.stringify(command)}`, 'delay 0.25', guard, 'key code 36',
  ];
  return [
    `tell application id "${BUNDLE_ID}" to activate`,
    'tell application "System Events"',
    '  repeat 20 times',
    '    set foregroundApp to first application process whose frontmost is true',
    `    if (bundle identifier of foregroundApp) is "${BUNDLE_ID}" then exit repeat`,
    '    delay 0.1',
    '  end repeat', `  ${guard}`,
    ...body.map(line => `  ${line}`), 'end tell',
  ].join("\n");
}
