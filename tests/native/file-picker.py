"""Operate one real native file picker belonging to the launched fixture PID.

Windows: built-in UI Automation ValuePattern/InvokePattern. Linux: AT-SPI and,
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
    return ["xdotool", "search", "--onlyvisible", "--pid", str(pid), "--name", "^" + re.escape(title) + "$"]


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
        verify()
        run(["key", "--window", xid, "Return"])
    while time.monotonic() < deadline:
        current = run(x11_search_arguments(args.pid, args.title)[1:], check=False)
        if current.returncode == 1 and not current.stdout.strip():
            return {"pid": args.pid, "title": args.title, "action": "cancel" if args.cancel else "submit",
                    "delivery": "X11 targeted GTK keyboard", "window": xid, "dialogDismissed": True,
                    "accessibilityQualified": False, "accessibilityGap": "AT-SPI application registry empty"}
        current.check_returncode()
        if current.stdout.strip().splitlines() != [xid]:
            raise RuntimeError("Owned picker changed during keyboard completion")
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


WINDOWS_SCRIPT = r'''
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$r = $env:NOXVIOLA_PICKER_REQUEST | ConvertFrom-Json
$deadline = [DateTime]::UtcNow.AddSeconds([double]$r.timeout)
$A = [System.Windows.Automation.AutomationElement]
$T = [System.Windows.Automation.TreeScope]
function Phase([string]$name) {
  [Console]::Error.WriteLine((@{diagnostic='owned-picker-phase';pid=[int]$r.pid;phase=$name} | ConvertTo-Json -Compress))
}
# Read-only diagnostics: names are read only AFTER exact PID verification.
# Never use these candidates as alternate action targets.
function OwnedDiagnostics {
  $items = New-Object System.Collections.ArrayList
  $condition = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, [int]$r.pid)
  $roots = $A::RootElement.FindAll($T::Children, $condition)
  $queue = New-Object System.Collections.Queue
  foreach ($root in $roots) { $queue.Enqueue(@($root, 0)) }
  $visited = 0
  $until = [DateTime]::UtcNow.AddMilliseconds(700)
  while ($queue.Count -gt 0 -and $visited -lt 64 -and [DateTime]::UtcNow -lt $until) {
    $pair = $queue.Dequeue(); $element = $pair[0]; $depth = [int]$pair[1]; $visited++
    try {
      if ($element.Current.ProcessId -ne [int]$r.pid) { continue }
      if ($depth -eq 0 -or $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Window) {
        $name = [string]$element.Current.Name
        if ($name.Length -gt 512) { $name = $name.Substring(0,512) }
        [void]$items.Add(@{title=$name;depth=$depth;offscreen=$element.Current.IsOffscreen;type=$element.Current.ControlType.ProgrammaticName;handle=$element.Current.NativeWindowHandle})
      }
      if ($depth -lt 3) {
        $children = $element.FindAll($T::Children, $condition)
        for ($i=0; $i -lt $children.Count -and $queue.Count -lt 64; $i++) { $queue.Enqueue(@($children[$i], ($depth+1))) }
      }
    } catch { }
  }
  [Console]::Error.WriteLine((@{diagnostic='owned-picker-windows';pid=[int]$r.pid;windows=@($items);visited=$visited;bounded=$true} | ConvertTo-Json -Depth 5 -Compress))
}
function Dialog {
  # Windows IFileDialog is an owned child Window of the application's root Window.
  # Traverse ONLY exact-PID Window children, never arbitrary desktop descendants.
  $condition = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, [int]$r.pid)),
    (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Window)))
  $roots = $A::RootElement.FindAll($T::Children, $condition)
  if ($roots.Count -gt 64) { throw 'Owned window traversal exceeds inspection budget' }
  $queue = New-Object System.Collections.Queue
  foreach ($root in $roots) { $queue.Enqueue(@($root, 0)) }
  $found = New-Object System.Collections.ArrayList
  $visited = 0
  while ($queue.Count -gt 0) {
    if ($visited -ge 64 -or [DateTime]::UtcNow -ge $deadline) { throw 'Owned window traversal exceeds inspection budget' }
    $pair = $queue.Dequeue(); $element = $pair[0]; $depth = [int]$pair[1]; $visited++
    if ($element.Current.ProcessId -ne [int]$r.pid) { continue }
    if ($element.Current.Name -ceq [string]$r.title -and -not $element.Current.IsOffscreen) {
      [void]$found.Add($element)
      if ($found.Count -gt 1) { throw 'Ambiguous owned native picker' }
    }
    $children = $element.FindAll($T::Children, $condition)
    if (($depth -ge 3 -and $children.Count -gt 0) -or ($visited + $queue.Count + $children.Count -gt 64)) { throw 'Owned window traversal exceeds inspection budget' }
    for ($i=0; $i -lt $children.Count; $i++) { $queue.Enqueue(@($children[$i], ($depth+1))) }
  }
  if ($found.Count -eq 1) { return $found[0] }
  return $null
}
function OwnedButtonDiagnostics($d) {
  $condition = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
  $raw = $d.FindAll($T::Descendants, $condition)
  $buttons = New-Object System.Collections.ArrayList
  $until = [DateTime]::UtcNow.AddMilliseconds(700)
  for ($i=0; $i -lt $raw.Count -and $i -lt 32 -and [DateTime]::UtcNow -lt $until; $i++) {
    $button = $raw[$i]
    if ($button.Current.ProcessId -ne [int]$r.pid) { continue }
    $name = [string]$button.Current.Name
    if ($name.Length -gt 96) { $name=$name.Substring(0,96) }
    [void]$buttons.Add(@{name=$name;pid=$button.Current.ProcessId;enabled=$button.Current.IsEnabled;offscreen=$button.Current.IsOffscreen})
  }
  [Console]::Error.WriteLine((@{diagnostic='owned-picker-buttons';pid=[int]$r.pid;rawCount=$raw.Count;buttons=@($buttons)} | ConvertTo-Json -Depth 5 -Compress))
}
function Descendants($d, $type) {
  $condition = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, $type)
  return @($d.FindAll($T::Descendants, $condition) | Where-Object { $_.Current.ProcessId -eq [int]$r.pid -and -not $_.Current.IsOffscreen -and $_.Current.IsEnabled })
}
$d=$null
OwnedDiagnostics
$firstDiscovery = $true
while ([DateTime]::UtcNow -lt $deadline) {
  if ($firstDiscovery) { Phase 'before-dialog-discovery' }
  $d=Dialog
  if ($firstDiscovery) { Phase 'after-dialog-discovery'; $firstDiscovery=$false }
  if ($d) {break}; Start-Sleep -Milliseconds 50
}
if (-not $d) { OwnedDiagnostics; throw 'Exact owned native picker did not appear' }
Phase 'dialog-discovered'
if (-not $r.cancel) {
  Phase 'before-filename-enumeration'
  $edits = @(Descendants $d ([System.Windows.Automation.ControlType]::Edit) | Where-Object { $_.Current.Name -in @('File name:', 'File name', 'Filename:', 'Filename') })
  Phase 'after-filename-enumeration'
  if ($edits.Count -ne 1) { throw "Expected one filename Edit control, found $($edits.Count)" }
  if (-not (Dialog)) { throw 'Owned picker changed before filename entry' }
  $value = $edits[0].GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  if ($value.Current.IsReadOnly) { throw 'Filename field is read-only' }
  Phase 'before-filename-set'
  $value.SetValue([string]$r.file)
  Phase 'after-filename-set'
  if ($value.Current.Value -cne [string]$r.file) { throw 'Filename readback mismatch' }
}
$button=$null
$firstActionCheck=$true
Phase 'before-action-dialog-check'
while ([DateTime]::UtcNow -lt $deadline) {
  $d=Dialog; if (-not $d) { throw 'Picker disappeared before native action' }
  if ($firstActionCheck) { Phase 'after-action-dialog-check' }
  $names = if ($r.cancel) { @('Cancel') } else { @('Open','Save') }
  if ($firstActionCheck) { Phase 'before-button-enumeration' }
  $buttons = @(Descendants $d ([System.Windows.Automation.ControlType]::Button) | Where-Object { $_.Current.Name.Replace('&','') -in $names })
  if ($firstActionCheck) { Phase 'after-button-enumeration'; OwnedButtonDiagnostics $d; $firstActionCheck=$false }
  if ($buttons.Count -gt 1) { throw 'Ambiguous native picker action' }
  if ($buttons.Count -eq 1) {$button=$buttons[0];break}
  Start-Sleep -Milliseconds 50
}
if (-not $button) { throw 'No enabled native picker action' }
Phase 'before-invoke-pattern'
$invoke=$button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
Phase 'before-invoke'
$invoke.Invoke()
Phase 'after-invoke'
Phase 'before-dismissal-check'
while ([DateTime]::UtcNow -lt $deadline) {
  if (-not (Dialog)) {
    Phase 'dialog-dismissed'
    @{pid=[int]$r.pid;title=[string]$r.title;action=$(if($r.cancel){'cancel'}else{'submit'});delivery='Windows UI Automation ValuePattern/InvokePattern';dialogDismissed=$true} | ConvertTo-Json -Compress
    exit 0
  }
  Start-Sleep -Milliseconds 50
}
throw 'Picker did not dismiss; secondary prompts are not automatically approved'
'''


def windows_picker(args):
    env = dict(os.environ, NOXVIOLA_PICKER_REQUEST=json.dumps(vars(args)))
    try:
        outcome = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT],
                                 env=env, capture_output=True, text=True, encoding="utf-8", timeout=args.timeout+1)
    except subprocess.TimeoutExpired as error:
        diagnostics = error.stderr or ""
        if isinstance(diagnostics, bytes):
            diagnostics = diagnostics.decode("utf-8", errors="replace")
        raise TimeoutError("Windows native picker timed out; owned diagnostics: " + (diagnostics[:800] + " ... " + diagnostics[-1600:] if len(diagnostics) > 2400 else diagnostics)) from error
    if outcome.returncode:
        raise RuntimeError("Windows native picker automation failed: " + outcome.stderr.strip()[:1600])
    if outcome.stderr.strip():
        print(outcome.stderr.strip(), file=sys.stderr)
    return json.loads(outcome.stdout.lstrip("\ufeff"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--title", required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--file")
    group.add_argument("--cancel", action="store_true")
    parser.add_argument("--timeout", type=float, default=15)
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    validate(args.pid, args.title, args.file, args.cancel, args.timeout)
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
