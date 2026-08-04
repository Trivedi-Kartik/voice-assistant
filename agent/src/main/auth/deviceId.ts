import Store from "electron-store";
import { randomUUID } from "node:crypto";
import os from "node:os";

const store = new Store<{ deviceId: string }>({ name: "device" });

export function getDeviceId(): string {
  let id = store.get("deviceId");
  if (!id) {
    id = randomUUID();
    store.set("deviceId", id);
  }
  return id;
}

export function getDeviceName(): string {
  return os.hostname();
}
