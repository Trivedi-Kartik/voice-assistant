// The v1 tool set this client actually implements (agent/src/main/tools/index.ts).
// Sent to the server on every signup/login so it only ever offers the LLM tool
// schemas this device can execute — see docs/ARCHITECTURE.md "Session management &
// isolation" (Device.capabilities).
const CROSS_PLATFORM_CAPABILITIES = [
  "open_app",
  "close_app",
  "web_search",
  "open_url",
  "set_reminder",
  "read_clipboard",
  "take_screenshot_and_describe",
];

// control_media (a Windows PowerShell/user32.dll script) and add_custom_app
// (Get-StartApps, Microsoft Store AppIDs) are Windows-only so far — see
// docs/ARCHITECTURE.md "Linux compatibility" for what's covered and what's
// deferred. Excluding them here means the server simply never offers those
// tool schemas to a non-Windows client's LLM context at all, rather than
// the model trying to call something that doesn't exist on this device.
const WINDOWS_ONLY_CAPABILITIES = ["control_media", "add_custom_app"];

export const DEVICE_CAPABILITIES =
  process.platform === "win32" ? [...CROSS_PLATFORM_CAPABILITIES, ...WINDOWS_ONLY_CAPABILITIES] : CROSS_PLATFORM_CAPABILITIES;
