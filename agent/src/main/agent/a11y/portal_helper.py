#!/usr/bin/env python3
"""Karvix Wayland input helper: keyboard input through the xdg-desktop-portal RemoteDesktop portal.

Wayland forbids apps from injecting keystrokes directly; the portal is the sanctioned route. The user approves once
(system dialog), and the returned restore token lets later sessions start without asking again.

Long-running: one JSON request per line on stdin, one JSON reply per line on stdout. The portal session lives as long
as this process (and its D-Bus connection) does.
  {"cmd":"start","restore_token":"..."}       -> {"ok":true,"restore_token":"...","devices":N}
  {"cmd":"keys","keys":["ctrl","s"]}          -> press a shortcut
  {"cmd":"text","text":"hello\\n"}            -> type text
  {"cmd":"click_at","fx":0..1,"fy":0..1,"width":W,"height":H} -> mouse click at that fraction of the shared screen
  {"cmd":"shot"}                              -> {"ok":true,"jpeg_b64":"..."}  one screen frame via the ScreenCast portal + GStreamer (kept in memory, never written to disk)
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
SC_IFACE = "org.freedesktop.portal.ScreenCast"
BTN_LEFT = 0x110  # evdev code for the left mouse button

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
stream_node = None  # PipeWire node id of the shared monitor (None if screen sharing wasn't granted)
stream_size = None  # (w, h) of that stream


def request(method, build_args, timeout_s=120, iface=IFACE):
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
        BUS.call_sync(PORTAL[0], PORTAL[1], iface, method, build_args(token), None, Gio.DBusCallFlags.NONE, -1, None)
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
    opts = {"handle_token": None, "types": GLib.Variant("u", 3), "persist_mode": GLib.Variant("u", 2)}  # keyboard; persist until revoked
    if restore_token:
        opts["restore_token"] = GLib.Variant("s", restore_token)

    def sel(t):
        o = dict(opts)
        o["handle_token"] = GLib.Variant("s", t)
        return GLib.Variant("(oa{sv})", (session, o))

    request("SelectDevices", sel)
    # Same session also shares the screen (one permission, one restore token for keyboard + mouse + frames).
    request(
        "SelectSources",
        lambda t: GLib.Variant("(oa{sv})", (session, {"handle_token": GLib.Variant("s", t), "types": GLib.Variant("u", 1), "multiple": GLib.Variant("b", False), "cursor_mode": GLib.Variant("u", 1)})),
        iface=SC_IFACE,
    )
    started = request("Start", lambda t: GLib.Variant("(osa{sv})", (session, "", {"handle_token": GLib.Variant("s", t)})))
    global stream_node, stream_size
    streams = started.get("streams") or []
    if streams:
        stream_node = int(streams[0][0])
        size = (streams[0][1] or {}).get("size")
        stream_size = (int(size[0]), int(size[1])) if size else None
    return {"ok": True, "restore_token": started.get("restore_token", ""), "devices": started.get("devices", 0), "screen": stream_node is not None, "size": stream_size}


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


def pointer_motion(dx, dy):
    BUS.call_sync(PORTAL[0], PORTAL[1], IFACE, "NotifyPointerMotion", GLib.Variant("(oa{sv}dd)", (session, {}, float(dx), float(dy))), None, Gio.DBusCallFlags.NONE, -1, None)


def pointer_button(pressed):
    BUS.call_sync(PORTAL[0], PORTAL[1], IFACE, "NotifyPointerButton", GLib.Variant("(oa{sv}iu)", (session, {}, BTN_LEFT, 1 if pressed else 0)), None, Gio.DBusCallFlags.NONE, -1, None)


def click_at(fx, fy, width, height):
    """Click at a fraction of the shared screen. Absolute positioning through the ScreenCast stream when we have one;
    otherwise slam into the top-left corner with relative motion and move by (fx*width, fy*height) logical pixels."""
    if stream_node is not None and stream_size:
        BUS.call_sync(PORTAL[0], PORTAL[1], IFACE, "NotifyPointerMotionAbsolute", GLib.Variant("(oa{sv}udd)", (session, {}, stream_node, fx * stream_size[0], fy * stream_size[1])), None, Gio.DBusCallFlags.NONE, -1, None)
    else:
        pointer_motion(-2 * width, -2 * height)
        time.sleep(0.08)
        pointer_motion(fx * width, fy * height)
    time.sleep(0.08)
    pointer_button(True)
    time.sleep(0.05)
    pointer_button(False)


def screenshot():
    """One frame of the shared monitor as JPEG, via PipeWire + GStreamer. Nothing is written to disk."""
    if stream_node is None:
        return {"ok": False, "error": "no_screen", "detail": "Screen sharing wasn't granted."}
    import base64

    gi.require_version("Gst", "1.0")
    from gi.repository import Gst

    Gst.init(None)
    res, fds = BUS.call_with_unix_fd_list_sync(PORTAL[0], PORTAL[1], SC_IFACE, "OpenPipeWireRemote", GLib.Variant("(oa{sv})", (session, {})), GLib.VariantType("(h)"), Gio.DBusCallFlags.NONE, -1, None, None)
    fd = fds.get(res.unpack()[0])
    pipe = Gst.parse_launch(f"pipewiresrc fd={fd} path={stream_node} do-timestamp=true ! videoconvert ! jpegenc quality=80 ! appsink name=sink max-buffers=1 drop=true sync=false")
    sink = pipe.get_by_name("sink")
    try:
        pipe.set_state(Gst.State.PLAYING)
        sample = sink.emit("try-pull-sample", 6 * Gst.SECOND)
        if sample is None:
            return {"ok": False, "error": "no_frame", "detail": "No frame arrived from the screen share."}
        buf = sample.get_buffer()
        return {"ok": True, "jpeg_b64": base64.b64encode(buf.extract_dup(0, buf.get_size())).decode("ascii")}
    finally:
        pipe.set_state(Gst.State.NULL)


def handle(req):
    cmd = req.get("cmd")
    if cmd == "start":
        return start(req.get("restore_token") or "")
    if session is None:
        return {"ok": False, "error": "not_started"}
    if cmd == "shot":
        return screenshot()
    if cmd == "click_at":
        click_at(float(req["fx"]), float(req["fy"]), float(req["width"]), float(req["height"]))
        return {"ok": True}
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
