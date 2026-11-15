#!/usr/bin/env python3
"""Karvix Wayland input helper: keyboard input through the xdg-desktop-portal RemoteDesktop portal.

Wayland forbids apps from injecting keystrokes directly; the portal is the sanctioned route. The user approves once
(system dialog), and the returned restore token lets later sessions start without asking again.

Long-running: one JSON request per line on stdin, one JSON reply per line on stdout. The portal session lives as long
as this process (and its D-Bus connection) does.
  {"cmd":"start","restore_token":"..."}       -> {"ok":true,"restore_token":"...","devices":N}
  {"cmd":"keys","keys":["ctrl","s"]}          -> press a shortcut
  {"cmd":"text","text":"hello\\n"}            -> type text
  {"cmd":"stop"}
"""
import json
import random
import sys
import time

import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib  # noqa: E402

BUS = Gio.bus_get_sync(Gio.BusType.SESSION, None)
SENDER = BUS.get_unique_name()[1:].replace(".", "_")
PORTAL = ("org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop")
IFACE = "org.freedesktop.portal.RemoteDesktop"

KEYSYMS = {
    "ctrl": 0xFFE3, "control": 0xFFE3, "shift": 0xFFE1, "alt": 0xFFE9, "super": 0xFFEB, "win": 0xFFEB, "meta": 0xFFEB,
    "enter": 0xFF0D, "return": 0xFF0D, "tab": 0xFF09, "esc": 0xFF1B, "escape": 0xFF1B, "backspace": 0xFF08,
    "delete": 0xFFFF, "del": 0xFFFF, "insert": 0xFF63, "up": 0xFF52, "down": 0xFF54, "left": 0xFF51, "right": 0xFF53,
    "home": 0xFF50, "end": 0xFF57, "pageup": 0xFF55, "pagedown": 0xFF56, "space": 0x20,
}
for i in range(1, 13):
    KEYSYMS[f"f{i}"] = 0xFFBD + i
MODIFIERS = {"ctrl", "control", "shift", "alt", "super", "win", "meta"}

session = None


def request(method, build_args, timeout_s=120):
    """Call a portal method that answers through a Request object's Response signal."""
    token = f"kvx{random.randint(0, 1 << 30)}"
    path = f"/org/freedesktop/portal/desktop/request/{SENDER}/{token}"
    loop = GLib.MainLoop()
    result = {}

    def on_response(_conn, _sender, _obj, _iface, _signal, params):
        code, res = params.unpack()
        result["code"], result["res"] = code, res
        loop.quit()

    sub = BUS.signal_subscribe(PORTAL[0], "org.freedesktop.portal.Request", "Response", path, None, Gio.DBusSignalFlags.NO_MATCH_RULE, on_response)
    try:
        BUS.call_sync(PORTAL[0], PORTAL[1], IFACE, method, build_args(token), None, Gio.DBusCallFlags.NONE, -1, None)
        GLib.timeout_add_seconds(timeout_s, loop.quit)
        loop.run()
    finally:
        BUS.signal_unsubscribe(sub)
    if "code" not in result:
        raise RuntimeError("timeout waiting for the desktop (was the permission dialog answered?)")
    if result["code"] == 1:
        raise RuntimeError("denied")  # the user clicked Cancel/Deny
    if result["code"] != 0:
        raise RuntimeError(f"portal error {result['code']}")
    return result["res"]


def start(restore_token):
    global session
    res = request("CreateSession", lambda t: GLib.Variant("(a{sv})", ({"handle_token": GLib.Variant("s", t), "session_handle_token": GLib.Variant("s", t + "s")},)))
    session = res["session_handle"]
    opts = {"handle_token": None, "types": GLib.Variant("u", 1), "persist_mode": GLib.Variant("u", 2)}  # keyboard; persist until revoked
    if restore_token:
        opts["restore_token"] = GLib.Variant("s", restore_token)

    def sel(t):
        o = dict(opts)
        o["handle_token"] = GLib.Variant("s", t)
        return GLib.Variant("(oa{sv})", (session, o))

    request("SelectDevices", sel)
    started = request("Start", lambda t: GLib.Variant("(osa{sv})", (session, "", {"handle_token": GLib.Variant("s", t)})))
    return {"ok": True, "restore_token": started.get("restore_token", ""), "devices": started.get("devices", 0)}


def keysym_event(sym, pressed):
    BUS.call_sync(PORTAL[0], PORTAL[1], IFACE, "NotifyKeyboardKeysym", GLib.Variant("(oa{sv}iu)", (session, {}, sym, 1 if pressed else 0)), None, Gio.DBusCallFlags.NONE, -1, None)


def char_keysym(ch):
    if ch == "\n":
        return KEYSYMS["enter"]
    if ch == "\t":
        return KEYSYMS["tab"]
    cp = ord(ch)
    if 0x20 <= cp <= 0x7E or 0xA0 <= cp <= 0xFF:
        return cp  # Latin-1 keysyms equal their code points
    return 0x01000000 + cp  # Unicode keysym


def press_keys(keys):
    syms = []
    for k in keys:
        k = str(k).lower().strip()
        if k in KEYSYMS:
            syms.append(KEYSYMS[k])
        elif len(k) == 1:
            syms.append(char_keysym(k))
        else:
            raise ValueError(f"unknown key {k}")
    for s in syms:
        keysym_event(s, True)
        time.sleep(0.02)
    for s in reversed(syms):
        keysym_event(s, False)
        time.sleep(0.02)


def type_text(text):
    for ch in text:
        s = char_keysym(ch)
        keysym_event(s, True)
        keysym_event(s, False)
        time.sleep(0.012)


def handle(req):
    cmd = req.get("cmd")
    if cmd == "start":
        return start(req.get("restore_token") or "")
    if session is None:
        return {"ok": False, "error": "not_started"}
    if cmd == "keys":
        press_keys(req.get("keys") or [])
        return {"ok": True}
    if cmd == "text":
        type_text(req.get("text") or "")
        return {"ok": True}
    if cmd == "stop":
        return {"ok": True, "stop": True}
    return {"ok": False, "error": "bad_cmd"}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            out = handle(json.loads(line))
        except Exception as exc:  # report, keep serving
            msg = str(exc)
            out = {"ok": False, "error": "denied" if msg == "denied" else "failed", "detail": msg[:200]}
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()
        if out.get("stop"):
            break


if __name__ == "__main__":
    main()
