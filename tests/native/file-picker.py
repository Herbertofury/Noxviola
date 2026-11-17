"""Operate one real native file picker belonging to the launched fixture PID.

Windows: pinned native UIAutomation wrapper with Value/Invoke and verified Legacy patterns. Linux: AT-SPI and,
when the location field is hidden, Ctrl+L sent to the exact owned X11 window.
If AT-SPI has no applications, a separately reported targeted X11 keyboard route
uses the real GTK picker without claiming accessibility qualification.
No global input, clipboard, dialog replacement, overwrite approval or app killing.
English Windows/GTK fixture images are supported. Portals owned by another PID,
ambiguous controls, unavailable accessibility and unsupported platforms fail closed.
The outer process kills only its own helper on timeout; the browser remains intact.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

class MissingControl(RuntimeError):
    """A control has not appeared; ambiguity is a separate, terminal failure."""


PATH_LABELS = {"Name", "Name:", "Location", "Location:", "File name", "File name:", "Filename", "Filename:"}


def validate(pid, title, file, cancel, timeout):
    if type(pid) is not int or pid <= 0:
        raise ValueError("An exact positive launched PID is required")
    if not isinstance(title, str) or not title or len(title) > 512 or any(ord(c) < 32 for c in title):
        raise ValueError("An exact nonempty native dialog title is required")
    if bool(file) == bool(cancel):
        raise ValueError("Choose exactly one absolute fixture file or --cancel")
    if file and (not os.path.isabs(file) or any(ord(c) < 32 for c in file)):
        raise ValueError("Fixture file must be an absolute path without control characters")
    if not 1 <= timeout <= 30:
        raise ValueError("Timeout must be between 1 and 30 seconds")


def select_dialog(items, pid, title):
    selected = [x for x in items if x.get("pid") == pid and x.get("title") == title and x.get("visible") and x.get("topLevel")]
    if len(selected) > 1:
        raise RuntimeError("Ambiguous owned native dialog; refusing input")
    return selected[0] if selected else None


def select_control(items, kind):
    if kind == "path":
        hits = [x for x in items if x.get("visible") and x.get("enabled") and x.get("editable") and any(n in PATH_LABELS for n in x.get("labels", []))]
    else:
        names = {"Cancel"} if kind == "cancel" else {"Save", "Open"}
        hits = [x for x in items if x.get("visible") and x.get("enabled") and x.get("button") and x.get("name", "").replace("_", "").replace("&", "") in names]
    if not hits:
        raise MissingControl(f"No native {kind} control is visible yet")
    if len(hits) != 1:
        raise RuntimeError(f"Expected one native {kind} control; found {len(hits)}")
    return hits[0]


def x11_search_arguments(pid, title):
    # Exact PID and exact title: no match-all/fallback target or global keyboard.
    return ["xdotool", "search", "--all", "--onlyvisible", "--pid", str(pid), "--name", "^" + re.escape(title) + "$"]


def reveal_location(pid, title, deadline):
    def run(args):
        return subprocess.run(args, check=True, capture_output=True, text=True,
                              timeout=max(.1, deadline-time.monotonic())).stdout.strip()
    windows = run(x11_search_arguments(pid, title)).splitlines()
    if len(windows) != 1 or not windows[0].isdigit():
        raise RuntimeError("Expected one exact owned X11 picker before Ctrl+L")
    xid = windows[0]
    if run(["xdotool", "getwindowpid", xid]) != str(pid) or run(["xdotool", "getwindowname", xid]) != title:
        raise RuntimeError("Owned picker changed before its location shortcut")
    run(["xdotool", "key", "--window", xid, "ctrl+l"])
    return xid


def x11_picker(args, deadline):
    """Native GTK keyboard route only when AT-SPI has no registered applications."""
    def run(parts, check=True):
        return subprocess.run(["xdotool", *parts], check=check, capture_output=True,
                              text=True, timeout=max(.05, deadline-time.monotonic()))

    matches = run(x11_search_arguments(args.pid, args.title)[1:], check=False)
    if matches.returncode == 1 and not matches.stdout.strip():
        return None
    matches.check_returncode()
    ids = matches.stdout.strip().splitlines()
    if len(ids) != 1 or not ids[0].isdigit():
        raise RuntimeError("Expected one exact owned X11 picker for keyboard route")
    xid = ids[0]

    def verify():
        if time.monotonic() >= deadline:
            raise TimeoutError("Owned X11 picker keyboard route timed out")
        if (run(["getwindowpid", xid]).stdout.strip() != str(args.pid)
                or run(["getwindowname", xid]).stdout.strip() != args.title):
            raise RuntimeError("Owned X11 picker changed before keyboard input")
        # Recheck uniqueness as well as the retained handle before each input.
        current = run(x11_search_arguments(args.pid, args.title)[1:]).stdout.strip().splitlines()
        if current != [xid]:
            raise RuntimeError("Owned X11 picker became ambiguous before keyboard input")

    def capture(stage):
        directory = getattr(args, 'evidence_dir', None)
        if not directory:
            return
        verify()
        import gi
        gi.require_version('Gdk', '3.0')
        gi.require_version('GdkX11', '3.0')
        from gi.repository import Gdk, GdkX11
        display = Gdk.Display.open(os.environ['DISPLAY'])
        window = GdkX11.X11Window.foreign_new_for_display(display, int(xid))
        pixels = Gdk.pixbuf_get_from_window(window, 0, 0, window.get_width(), window.get_height())
        if not pixels:
            raise RuntimeError('Owned picker screenshot unavailable')
        pixels.savev(str(Path(directory) / (stage + '.png')), 'png', [], [])
        display.close()

    capture('opened')
    accept_key = None
    if not args.cancel:
        if args.title == "Export all saved collections for this identity; choose a NEW filename":
            if os.path.lexists(args.file):
                raise RuntimeError("Keyboard export requires a new nonexistent target")
            accept_key = "alt+s"
        elif args.title == "Add collections from a same-identity backup; existing collections stay untouched":
            accept_key = "alt+o"
        else:
            raise RuntimeError("No explicitly known GTK accept mnemonic for this picker")
    if args.cancel:
        verify()
        run(["key", "--window", xid, "Escape"])
    else:
        verify()
        run(["key", "--window", xid, "ctrl+l"])
        verify()
        run(["key", "--window", xid, "ctrl+a"])
        verify()
        run(["type", "--window", xid, "--delay", "0", "--", args.file])
        capture("path-entered")
        verify()
        run(["key", "--window", xid, "Return"])
    accept_sent = False
    earliest_accept = time.monotonic() + .25
    while time.monotonic() < deadline:
        current = run(x11_search_arguments(args.pid, args.title)[1:], check=False)
        if current.returncode == 1 and not current.stdout.strip():
            return {"pid": args.pid, "title": args.title, "action": "cancel" if args.cancel else "submit",
                    "delivery": "X11 targeted GTK keyboard", "window": xid, "dialogDismissed": True,
                    "accessibilityQualified": False, "accessibilityGap": "AT-SPI application registry empty"}
        current.check_returncode()
        if current.stdout.strip().splitlines() != [xid]:
            raise RuntimeError("Owned picker changed during keyboard completion")
        if accept_key and not accept_sent and time.monotonic() >= earliest_accept:
            # Do not send even an accept mnemonic while a secondary owned modal exists.
            visible = run(["search", "--onlyvisible", "--pid", str(args.pid)]).stdout.strip().splitlines()
            if len(visible) > 32:
                raise RuntimeError("Owned window inspection exceeds budget")
            for other in visible:
                if not other.isdigit() or other == xid:
                    continue
                if run(["getwindowpid", other]).stdout.strip() != str(args.pid):
                    continue
                prop = subprocess.run(["xprop", "-id", other, "WM_TRANSIENT_FOR"], check=True,
                                      capture_output=True, text=True, timeout=max(.05, deadline-time.monotonic())).stdout
                targets = re.findall(r"0x[0-9a-fA-F]+", prop)
                if any(int(target, 16) == int(xid) for target in targets):
                    raise RuntimeError("Secondary owned modal present; refusing accept mnemonic")
            if accept_key == "alt+s" and os.path.lexists(args.file):
                raise RuntimeError("Export target appeared; refusing accept mnemonic")
            capture("before-accept")
            verify()
            run(["key", "--window", xid, accept_key])
            accept_sent = True
        time.sleep(.05)
    raise TimeoutError("Owned X11 picker did not dismiss; no secondary prompt or overwrite is approved")


def linux_picker(args):
    import gi
    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi
    Atspi.init()
    if hasattr(Atspi, "set_timeout"):
        Atspi.set_timeout(1500, 1500)
    deadline = time.monotonic() + args.timeout
    desktop = Atspi.get_desktop(0)
    if desktop is None:
        raise RuntimeError("No accessibility desktop; use shared dbus-run-session with AT-SPI installed")

    def showing(obj):
        states = obj.get_state_set()
        return states.contains(Atspi.StateType.SHOWING) and not states.contains(Atspi.StateType.DEFUNCT)

    def diagnostics():
        # Read-only evidence; foreign application names are never read or logged.
        until = time.monotonic() + 1.0
        report = {"diagnostic": "owned-linux-picker", "pid": args.pid,
                  "applicationPids": [], "owned": [], "x11": []}
        try:
            desktop.clear_cache()
            for i in range(min(desktop.get_child_count(), 32)):
                if time.monotonic() >= until:
                    break
                app = desktop.get_child_at_index(i)
                if not app:
                    continue
                pid = app.get_process_id()
                report["applicationPids"].append(pid)
                if pid != args.pid:
                    continue
                report["owned"].append({"kind": "application", "name": (app.get_name() or "")[:256]})
                for j in range(min(app.get_child_count(), 32)):
                    if time.monotonic() >= until:
                        break
                    obj = app.get_child_at_index(j)
                    if obj and obj.get_process_id() == args.pid:
                        report["owned"].append({"kind": "top-level", "name": (obj.get_name() or "")[:256],
                                                "role": obj.get_role_name(), "showing": showing(obj)})
        except Exception as error:
            report["accessibilityError"] = type(error).__name__
        # Separate bounded native-window evidence distinguishes missing AT-SPI exposure.
        until = time.monotonic() + 1.0
        try:
            def query(parts):
                return subprocess.run(["xdotool", *parts], check=True, capture_output=True,
                                      text=True, timeout=max(.05, until-time.monotonic())).stdout.strip()
            ids = query(["search", "--onlyvisible", "--pid", str(args.pid)]).splitlines()
            for xid in ids[:16]:
                if time.monotonic() >= until:
                    break
                if xid.isdigit() and query(["getwindowpid", xid]) == str(args.pid):
                    report["x11"].append({"id": xid, "pid": args.pid, "title": query(["getwindowname", xid])[:256]})
        except Exception as error:
            report["x11Error"] = type(error).__name__
        print(json.dumps(report), file=sys.stderr, flush=True)

    def dialogs():
        found = []
        desktop.clear_cache()
        for i in range(desktop.get_child_count()):
            app = desktop.get_child_at_index(i)
            if not app or app.get_process_id() != args.pid:
                continue
            app.clear_cache()
            for j in range(app.get_child_count()):
                obj = app.get_child_at_index(j)
                if obj and obj.get_name() == args.title:
                    found.append({"pid": obj.get_process_id(), "title": obj.get_name(), "visible": showing(obj), "topLevel": obj.get_role() in (Atspi.Role.DIALOG, Atspi.Role.FILE_CHOOSER, Atspi.Role.FRAME), "object": obj})
        return found

    def owned():
        return select_dialog(dialogs(), args.pid, args.title)

    def controls(dialog):
        result, queue, visited = [], [(dialog, 0)], 0
        skip = {Atspi.Role.TABLE, Atspi.Role.TREE_TABLE, Atspi.Role.LIST, Atspi.Role.TREE}
        while queue:
            if time.monotonic() >= deadline:
                raise TimeoutError("Native picker inspection timed out")
            obj, depth = queue.pop()
            visited += 1
            if visited > 2048 or depth > 24:
                raise RuntimeError("Native dialog accessibility tree exceeds inspection budget")
            if obj.get_process_id() != args.pid:
                continue
            obj.clear_cache()
            states = obj.get_state_set()
            name = obj.get_name() or ""
            labels = [name]
            for relation in obj.get_relation_set():
                if relation.get_relation_type() == Atspi.RelationType.LABELLED_BY:
                    labels.extend(relation.get_target(i).get_name() for i in range(relation.get_n_targets()))
            result.append({"object": obj, "name": name, "labels": labels,
                           "visible": showing(obj), "enabled": states.contains(Atspi.StateType.ENABLED),
                           "editable": states.contains(Atspi.StateType.EDITABLE) and bool(obj.get_editable_text_iface()),
                           "button": obj.get_role() == Atspi.Role.PUSH_BUTTON})
            if obj.get_role() not in skip:
                queue.extend((obj.get_child_at_index(i), depth+1) for i in range(obj.get_child_count()) if obj.get_child_at_index(i))
        return result

    diagnostics()
    picked = None
    while time.monotonic() < deadline:
        desktop.clear_cache()
        if desktop.get_child_count() == 0:
            keyboard_result = x11_picker(args, deadline)
            if keyboard_result:
                return keyboard_result
        picked = owned()
        if picked:
            break
        time.sleep(.05)
    if not picked:
        diagnostics()
        raise TimeoutError("Exact owned native picker did not appear")
    shortcut = None
    if not args.cancel:
        try:
            entry = select_control(controls(picked["object"]), "path")
        except MissingControl:
            shortcut = reveal_location(args.pid, args.title, deadline)
            entry = None
            while time.monotonic() < deadline:
                current = owned()
                if not current:
                    raise RuntimeError("Picker disappeared before filename entry")
                try:
                    entry = select_control(controls(current["object"]), "path")
                    break
                except MissingControl:
                    time.sleep(.05)
            if not entry:
                raise RuntimeError("The owned picker exposes no unique filename/location field")
        if not owned():
            raise RuntimeError("Picker changed before entering filename")
        edit = entry["object"].get_editable_text_iface()
        if not edit.set_text_contents(args.file):
            raise RuntimeError("Native filename field rejected its value")
        text = entry["object"].get_text_iface()
        if not text or text.get_text(0, -1) != args.file:
            raise RuntimeError("Native filename readback did not match fixture path")
    target = None
    while time.monotonic() < deadline:
        current = owned()
        if not current:
            raise RuntimeError("Picker disappeared before invoking its native button")
        try:
            target = select_control(controls(current["object"]), "cancel" if args.cancel else "accept")
            break
        except MissingControl:
            time.sleep(.05)
    if not target:
        raise RuntimeError("No unique enabled native picker action")
    action = target["object"].get_action_iface()
    allowed = [i for i in range(action.get_n_actions()) if action.get_action_name(i) in ("click", "press", "activate")]
    if len(allowed) != 1 or not action.do_action(allowed[0]):
        raise RuntimeError("Native picker action unavailable or rejected")
    while time.monotonic() < deadline:
        if not owned():
            return {"pid": args.pid, "title": args.title, "action": "cancel" if args.cancel else "submit", "delivery": "AT-SPI EditableText/Action", "locationShortcutWindow": shortcut, "dialogDismissed": True}
        time.sleep(.05)
    raise TimeoutError("Native picker did not dismiss; secondary prompts are not automatically approved")


def legacy_allowed(kind, name, expected, role, state, default_action):
    if name.replace('&', '') not in expected or state & (0x1 | 0x8000 | 0x10000):
        return False
    if kind == 'value':
        return role == 42 and not state & 0x40  # ROLE_SYSTEM_TEXT, not read-only
    return role == 43 and default_action.lower() in ('press', 'click')


def filename_matches(matches):
    """Only collapse a ComboBox's own single editable descendant, never siblings."""
    if len(matches) != 2:
        return matches
    combos = [item for item in matches if item[0].ControlType == 50003]
    edits = [item for item in matches if item[0].ControlType == 50004]
    if len(combos) != 1 or len(edits) != 1:
        return matches
    ancestor, descendant = combos[0][3], edits[0][3]
    if len(descendant) > len(ancestor) and descendant[:len(ancestor)] == ancestor:
        return edits
    return matches


def windows_picker(args):
    # Maintained native UIA wrapper; unlike stock managed UIA, includes Legacy MSAA.
    sys.coinit_flags = 0  # non-window-owning MTA worker
    import uiautomation as auto
    deadline = time.monotonic() + args.timeout

    def phase(name, **data):
        print(json.dumps({'diagnostic': 'native-uia', 'pid': args.pid, 'phase': name, **data}), file=sys.stderr, flush=True)

    def children(node, limit):
        child, count = node.GetFirstChildControl(), 0
        while child:
            count += 1
            if count > limit or time.monotonic() >= deadline:
                raise TimeoutError('Native UIA child inspection budget exceeded')
            yield child
            child = child.GetNextSiblingControl()

    def dialog():
        queue = [(node, 0) for node in children(auto.GetRootControl(), 256)
                 if node.ProcessId == args.pid and node.ControlType == auto.ControlType.WindowControl]
        found, visited = [], 0
        while queue:
            node, depth = queue.pop()
            visited += 1
            if visited > 64 or time.monotonic() >= deadline:
                raise TimeoutError('Owned UIA window traversal budget exceeded')
            if node.ProcessId != args.pid:
                continue
            if node.Name == args.title and not node.IsOffscreen:
                found.append(node)
            for child in children(node, 256):
                if child.ProcessId == args.pid and child.ControlType == auto.ControlType.WindowControl:
                    if depth >= 3:
                        raise RuntimeError('Owned UIA window depth exceeded')
                    queue.append((child, depth+1))
        if len(found) > 1:
            raise RuntimeError('Ambiguous exact owned native picker')
        return found[0] if found else None

    def control(root, kind, names):
        queue, matches, evidence, visited = [(root, 0, ())], [], [], 0
        while queue:
            node, depth, ancestry = queue.pop()
            visited += 1
            if visited > 2048 or depth > 24 or time.monotonic() >= deadline:
                raise TimeoutError('Owned UIA control traversal budget exceeded')
            if node.ProcessId != args.pid:
                continue
            name = node.Name or ''
            if name.replace('&', '') in names and node.IsEnabled and not node.IsOffscreen:
                pattern_id = auto.PatternId.ValuePattern if kind == 'value' else auto.PatternId.InvokePattern
                pattern = node.GetPattern(pattern_id)
                method = 'ValuePattern' if kind == 'value' else 'InvokePattern'
                legacy = None
                if pattern is None:
                    legacy = node.GetPattern(auto.PatternId.LegacyIAccessiblePattern)
                    if legacy and legacy_allowed(kind, legacy.Name, names, legacy.Role, legacy.State, legacy.DefaultAction or ''):
                        pattern, method = legacy, 'LegacyIAccessiblePattern'
                evidence.append({'name': name[:96], 'type': node.ControlType, 'method': method if pattern else None,
                                 'legacyRole': legacy.Role if legacy else None})
                if pattern:
                    if kind != 'value' or method == 'LegacyIAccessiblePattern' or not pattern.IsReadOnly:
                        matches.append((node, pattern, method, ancestry))
            for index, child in enumerate(children(node, 2048)):
                queue.append((child, depth+1, ancestry+(index,)))
        phase('named-controls', kind=kind, controls=evidence[:32])
        if kind == 'value':
            matches = filename_matches(matches)
        if len(matches) != 1:
            raise RuntimeError(f'Expected one exact owned {kind} control; found {len(matches)}')
        return matches[0][:3]

    phase('before-dialog-discovery')
    current = None
    while time.monotonic() < deadline:
        current = dialog()
        if current:
            break
        time.sleep(.05)
    if not current:
        raise TimeoutError('Exact owned native picker did not appear')
    phase('dialog-discovered')
    methods = []
    if not args.cancel:
        node, pattern, method = control(current, 'value', {'File name:', 'File name', 'Filename:', 'Filename'})
        if not dialog() or node.ProcessId != args.pid or node.Name.replace('&', '') not in {'File name:', 'File name', 'Filename:', 'Filename'} or not node.IsEnabled or node.IsOffscreen:
            raise RuntimeError('Owned filename control changed')
        if method == 'LegacyIAccessiblePattern' and not legacy_allowed('value', pattern.Name, {'File name:', 'File name', 'Filename:', 'Filename'}, pattern.Role, pattern.State, pattern.DefaultAction or ''):
            raise RuntimeError('Legacy filename semantics changed')
        phase('before-filename-set', method=method)
        pattern.SetValue(args.file, waitTime=0)
        if pattern.Value != args.file:
            raise RuntimeError('Filename readback mismatch')
        methods.append(method)
    current = dialog()
    if not current:
        raise RuntimeError('Picker disappeared before native action')
    names = {'Cancel'} if args.cancel else {'Save', 'Open'}
    node, pattern, method = control(current, 'action', names)
    if not dialog() or node.ProcessId != args.pid or node.Name.replace('&', '') not in names or not node.IsEnabled or node.IsOffscreen:
        raise RuntimeError('Owned action control changed')
    phase('before-native-action', method=method)
    if method == 'LegacyIAccessiblePattern':
        if not legacy_allowed('action', pattern.Name, names, pattern.Role, pattern.State, pattern.DefaultAction or ''):
            raise RuntimeError('Legacy action semantics changed')
        pattern.DoDefaultAction(waitTime=0)
    else:
        pattern.Invoke(waitTime=0)
    methods.append(method)
    phase('after-native-action')
    while time.monotonic() < deadline:
        if not dialog():
            return {'pid': args.pid, 'title': args.title, 'action': 'cancel' if args.cancel else 'submit',
                    'delivery': 'Native UIA ' + '/'.join(methods), 'dialogDismissed': True}
        time.sleep(.05)
    raise TimeoutError('Picker did not dismiss; no secondary prompt or overwrite is approved')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--title", required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--file")
    group.add_argument("--cancel", action="store_true")
    parser.add_argument("--timeout", type=float, default=15)
    parser.add_argument("--evidence-dir", help="Existing synthetic fixture directory for owned-dialog screenshots")
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    validate(args.pid, args.title, args.file, args.cancel, args.timeout)
    if args.evidence_dir and (not os.path.isabs(args.evidence_dir) or not Path(args.evidence_dir).is_dir()):
        raise ValueError("Existing absolute synthetic evidence directory required")
    if not args.worker:
        interpreter = "/usr/bin/python3" if sys.platform.startswith("linux") else sys.executable
        if not Path(interpreter).is_file():
            raise RuntimeError("Native picker fixture requires the system Python interpreter")
        try:
            worker = subprocess.run([interpreter, "-B", str(Path(__file__).resolve()), *sys.argv[1:], "--worker"],
                                    capture_output=True, text=True, timeout=args.timeout+3)
        except subprocess.TimeoutExpired as error:
            diagnostics = error.stderr or ""
            if isinstance(diagnostics, bytes):
                diagnostics = diagnostics.decode("utf-8", errors="replace")
            raise TimeoutError("Native helper timed out; owned diagnostics: " + (diagnostics[:800] + " ... " + diagnostics[-1600:] if len(diagnostics) > 2400 else diagnostics)) from error
        if worker.returncode:
            raise RuntimeError("Native picker helper failed: " + (worker.stdout + worker.stderr).strip()[:2000])
        print(worker.stdout.strip())
        return
    if sys.platform == "win32":
        result = windows_picker(args)
    elif sys.platform.startswith("linux"):
        result = linux_picker(args)
    else:
        raise RuntimeError("Native picker acceptance supports Windows and Linux X11/GTK only")
    print(json.dumps({"platform": sys.platform, **result}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"platform": sys.platform, "error": {"name": type(error).__name__, "message": str(error)}}))
        sys.exit(1)
