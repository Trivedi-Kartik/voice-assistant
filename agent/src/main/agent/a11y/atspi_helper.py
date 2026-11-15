#!/usr/bin/env python3
"""Karvix Linux accessibility helper (AT-SPI2). One request per process, JSON in argv[1], JSON out on stdout.

Why accessibility instead of pixels: it gives the agent the real names/roles/values of buttons and fields
and lets it operate them (press, set text) even on Wayland, where synthetic mouse/keyboard input isn't
possible. Stateless on purpose: an element is addressed by its path of child indices from the desktop root
PLUS its expected role+name, so a stale id is detected ("the window changed — look again") instead of
clicking the wrong thing.

Requests:
  {"cmd":"windows"}
  {"cmd":"snapshot","window":"<title/app substring or empty for the active window>","max_nodes":300}
  {"cmd":"act","path":"13.0.4","role":"push button","name":"Save","op":"click|set_text|insert_text|focus","text":"..."}
"""
import json
import sys
import time

try:
    import gi

    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi
except Exception as exc:  # python3-gi / gir1.2-atspi-2.0 missing
    print(json.dumps({"ok": False, "error": "missing_atspi", "detail": str(exc)[:200]}))
    sys.exit(0)

Atspi.init()

INTERACTIVE = {
    "push button", "toggle button", "check box", "radio button", "menu item", "check menu item",
    "radio menu item", "combo box", "entry", "text", "password text", "spin button", "slider", "link",
    "page tab", "list item", "tree item", "table cell", "terminal", "document text", "document web",
    "editbar", "menu", "tab", "switch",
}
SHOWN_CONTAINERS_KEEP_NAME = {"label", "heading", "static", "paragraph", "title bar", "status bar"}
MAX_DEPTH = 16
DEADLINE_S = 6.0


def children(node):
    try:
        count = node.get_child_count()
    except Exception:
        return
    for i in range(count):
        try:
            child = node.get_child_at_index(i)
        except Exception:
            continue
        if child is not None:
            yield i, child


def states(node):
    try:
        ss = node.get_state_set()
        names = {}
        for label, st in (
            ("showing", Atspi.StateType.SHOWING), ("enabled", Atspi.StateType.ENABLED),
            ("sensitive", Atspi.StateType.SENSITIVE),
            ("focused", Atspi.StateType.FOCUSED), ("active", Atspi.StateType.ACTIVE),
            ("editable", Atspi.StateType.EDITABLE), ("checked", Atspi.StateType.CHECKED),
            ("selected", Atspi.StateType.SELECTED),
        ):
            names[label] = bool(ss.contains(st))
        # GTK apps report SENSITIVE (not ENABLED) for usable widgets; Qt/others report ENABLED. Either means usable.
        names["usable"] = names["enabled"] or names["sensitive"]
        return names
    except Exception:
        return {}


def role_of(node):
    try:
        return node.get_role_name() or ""
    except Exception:
        return ""


def name_of(node):
    try:
        return node.get_name() or ""
    except Exception:
        return ""


def interfaces(node):
    try:
        return set(node.get_interfaces() or [])
    except Exception:
        return set()


def text_of(node, limit=300):
    try:
        if "Text" in interfaces(node):
            n = Atspi.Text.get_character_count(node)
            return Atspi.Text.get_text(node, 0, min(n, limit)) or ""
    except Exception:
        pass
    return ""


def frames():
    """Top-level windows across all apps: [(path, app_name, frame)]."""
    out = []
    desktop = Atspi.get_desktop(0)
    for ai, app in children(desktop):
        for fi, frame in children(app):
            r = role_of(frame)
            if r in ("frame", "dialog", "window", "alert", "file chooser", "application"):
                out.append((f"{ai}.{fi}", name_of(app), frame))
    return out


def cmd_windows():
    wins = []
    for path, app, frame in frames():
        st = states(frame)
        title = name_of(frame)
        if not title and not st.get("showing"):
            continue
        wins.append({"path": path, "app": app, "title": title, "active": bool(st.get("active"))})
    return {"ok": True, "windows": wins}


def pick_window(query):
    q = (query or "").strip().lower()
    cands = frames()
    if q:
        for path, app, frame in cands:
            if q in name_of(frame).lower() or q in app.lower():
                return path, app, frame
        return None
    for path, app, frame in cands:
        if states(frame).get("active"):
            return path, app, frame
    for path, app, frame in cands:  # no ACTIVE state reported (some Wayland setups): first showing window
        if states(frame).get("showing") and name_of(frame):
            return path, app, frame
    return None


def cmd_snapshot(req):
    picked = None
    if req.get("frame_path"):
        for path, app, frame in frames():
            if path == req["frame_path"]:
                picked = (path, app, frame)
                break
    else:
        picked = pick_window(req.get("window"))
    if not picked:
        return {"ok": False, "error": "no_window", "detail": "No matching window is visible to accessibility."}
    base, app, frame = picked
    max_nodes = int(req.get("max_nodes") or 300)
    deadline = time.time() + DEADLINE_S
    nodes = []

    def walk(node, path, depth, parent_name=""):
        if len(nodes) >= max_nodes or depth > MAX_DEPTH or time.time() > deadline:
            return
        role = role_of(node)
        st = states(node)
        if st and st.get("showing") is False and depth > 0:
            return  # invisible subtree
        name = name_of(node)
        keep = role in INTERACTIVE or (role in SHOWN_CONTAINERS_KEEP_NAME and name)
        if role in SHOWN_CONTAINERS_KEEP_NAME and name and name == parent_name:
            keep = False  # a button's inner label that just repeats the button's own name
        if keep and depth > 0:
            item = {"path": path, "role": role, "name": name[:120]}
            txt = text_of(node) if role in INTERACTIVE else ""
            if txt:
                item["text"] = txt
            flags = [k for k in ("focused", "checked", "selected") if st.get(k)]
            if st and not st.get("usable"):
                flags.append("disabled")
            if st.get("editable"):
                flags.append("editable")
            if flags:
                item["flags"] = flags
            nodes.append(item)
        next_parent = name if (keep and role in INTERACTIVE and name) else parent_name
        for i, child in children(node):
            walk(child, f"{path}.{i}", depth + 1, next_parent)

    walk(frame, base, 0)
    return {"ok": True, "app": app, "title": name_of(frame), "nodes": nodes, "truncated": len(nodes) >= max_nodes}


def resolve(path):
    node = Atspi.get_desktop(0)
    for part in path.split("."):
        node = node.get_child_at_index(int(part))
        if node is None:
            return None
    return node


def cmd_act(req):
    try:
        node = resolve(req["path"])
    except Exception:
        node = None
    if node is None:
        return {"ok": False, "error": "stale", "detail": "That element is gone — look at the screen again."}
    if req.get("role") and role_of(node) != req["role"]:
        return {"ok": False, "error": "stale", "detail": "The window changed — look at the screen again."}
    if req.get("name") is not None and name_of(node)[:120] != req["name"]:
        return {"ok": False, "error": "stale", "detail": "The window changed — look at the screen again."}
    op = req.get("op")
    ifaces = interfaces(node)
    try:
        if op == "click":
            if "Action" not in ifaces:
                return {"ok": False, "error": "no_action", "detail": "This element can't be clicked."}
            n = Atspi.Action.get_n_actions(node)
            names = [Atspi.Action.get_action_name(node, i) for i in range(n)]
            for want in ("click", "press", "activate", "toggle", "select", "open", "jump"):
                if want in names:
                    return {"ok": bool(Atspi.Action.do_action(node, names.index(want))), "action": want}
            return {"ok": bool(Atspi.Action.do_action(node, 0)), "action": names[0] if names else ""}
        if op == "set_text":
            if "EditableText" not in ifaces:
                return {"ok": False, "error": "not_editable", "detail": "This field can't be typed into."}
            return {"ok": bool(Atspi.EditableText.set_text_contents(node, req.get("text", "")))}
        if op == "insert_text":
            if "EditableText" not in ifaces:
                return {"ok": False, "error": "not_editable", "detail": "This field can't be typed into."}
            text = req.get("text", "")
            pos = Atspi.Text.get_caret_offset(node) if "Text" in ifaces else -1
            return {"ok": bool(Atspi.EditableText.insert_text(node, pos, text, len(text.encode("utf-8"))))}
        if op == "focus":
            if "Component" not in ifaces:
                return {"ok": False, "error": "no_focus", "detail": "This element can't take focus."}
            return {"ok": bool(Atspi.Component.grab_focus(node))}
    except Exception as exc:
        return {"ok": False, "error": "failed", "detail": str(exc)[:200]}
    return {"ok": False, "error": "bad_op", "detail": f"Unknown operation {op}"}


def focused_editable():
    """Path of the focused editable text element in the active window, if any (used by type_text)."""
    picked = pick_window("")
    if not picked:
        return None
    base, _, frame = picked
    found = []

    def walk(node, path, depth):
        if found or depth > MAX_DEPTH:
            return
        st = states(node)
        if st.get("focused") and st.get("editable"):
            found.append({"path": path, "role": role_of(node), "name": name_of(node)[:120]})
            return
        for i, child in children(node):
            walk(child, f"{path}.{i}", depth + 1)

    walk(frame, base, 0)
    return found[0] if found else None


def main():
    req = json.loads(sys.argv[1])
    cmd = req.get("cmd")
    if cmd == "windows":
        out = cmd_windows()
    elif cmd == "snapshot":
        out = cmd_snapshot(req)
    elif cmd == "act":
        out = cmd_act(req)
    elif cmd == "focused_editable":
        out = {"ok": True, "element": focused_editable()}
    else:
        out = {"ok": False, "error": "bad_cmd"}
    print(json.dumps(out, ensure_ascii=False))


try:
    main()
except Exception as exc:
    print(json.dumps({"ok": False, "error": "helper_crash", "detail": str(exc)[:200]}))
