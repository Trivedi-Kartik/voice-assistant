import Store from "electron-store";

interface ConsentRecord {
  acceptedAt: string;
}

const store = new Store<{ consent: ConsentRecord }>({ name: "consent" });

// A recorded consent event, separate from the OS mic-permission dialog — needed
// for liability purposes since this app sends voice to Groq and takes real OS
// actions. See docs/ARCHITECTURE.md "Security / privacy".
export function hasConsented(): boolean {
  return store.get("consent") !== undefined;
}

export function recordConsent(): void {
  store.set("consent", { acceptedAt: new Date().toISOString() });
}
