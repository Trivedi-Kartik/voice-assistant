// The v1 tool set this client actually implements (agent/src/main/tools/index.ts).
// Sent to the server on every signup/login so it only ever offers the LLM tool
// schemas this device can execute — see docs/ARCHITECTURE.md "Session management &
// isolation" (Device.capabilities).
export const DEVICE_CAPABILITIES = [
  "open_app",
  "close_app",
  "web_search",
  "open_url",
  "control_media",
  "set_reminder",
  "read_clipboard",
];
