"""Request the ordinary OS close path of one owned packaged browser window.

This test helper never destroys a window or terminates a process. It uses the
same vetoable WM_CLOSE / WM_DELETE_WINDOW protocol as a desktop window manager.
References: Microsoft EnumWindows/SendMessageTimeoutW; Xlib and ICCCM section
4.2.8. Only the launched browser PID may be selected; ambiguity is an error.
"""

import argparse
import ctypes as c
import ctypes.util
import json
import sys


def select_window(candidates, pid, title=None):
    if type(pid) is not int or pid <= 0:
        raise ValueError("An exact positive launched process ID is required")
    owned = [item for item in candidates if item["pid"] == pid and
             item["visible"] and item["topLevel"] and (title is None or item.get("title") == title)]
    if len(owned) != 1:
        raise RuntimeError(f"Expected one visible top-level window for owned PID {pid}; found {len(owned)}")
    return owned[0]


def windows_message():
    return {"message": 0x0010, "wParam": 0, "lParam": 0,
            "flags": 0x0002, "timeoutMs": 5000}


def x11_message(protocols, delete):
    if not protocols or not delete:
        raise RuntimeError("WM_PROTOCOLS and WM_DELETE_WINDOW must already exist")
    return {"eventType": 33, "messageType": protocols, "format": 32,
            "data": [delete, 0, 0, 0, 0], "propagate": False, "eventMask": 0}


def close_windows(pid):
    from ctypes import wintypes as w
    user32 = c.WinDLL("user32", use_last_error=True)
    callback_type = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    user32.EnumWindows.argtypes = [callback_type, w.LPARAM]
    user32.EnumWindows.restype = w.BOOL
    user32.IsWindowVisible.argtypes = [w.HWND]
    user32.IsWindowVisible.restype = w.BOOL
    user32.GetWindowThreadProcessId.argtypes = [w.HWND, c.POINTER(w.DWORD)]
    user32.GetWindowThreadProcessId.restype = w.DWORD
    user32.GetWindowTextLengthW.argtypes = [w.HWND]
    user32.GetWindowTextLengthW.restype = c.c_int
    user32.GetWindowTextW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
    user32.GetWindowTextW.restype = c.c_int
    user32.SendMessageTimeoutW.argtypes = [w.HWND, w.UINT, w.WPARAM,
                                         w.LPARAM, w.UINT, w.UINT,
                                         c.POINTER(c.c_size_t)]
    user32.SendMessageTimeoutW.restype = c.c_ssize_t
    candidates = []

    @callback_type
    def inspect(hwnd, _parameter):
        owner = w.DWORD()
        thread = user32.GetWindowThreadProcessId(hwnd, c.byref(owner))
        if owner.value == pid and user32.IsWindowVisible(hwnd):
            title = c.create_unicode_buffer(user32.GetWindowTextLengthW(hwnd) + 1)
            user32.GetWindowTextW(hwnd, title, len(title))
            candidates.append({"id": int(hwnd), "pid": owner.value,
                               "threadId": thread, "title": title.value,
                               "visible": True, "topLevel": True})
        return True

    if not user32.EnumWindows(inspect, 0):
        raise c.WinError(c.get_last_error())
    selected = select_window(candidates, pid)
    owner = w.DWORD()
    thread = user32.GetWindowThreadProcessId(selected["id"], c.byref(owner))
    if owner.value != pid or thread != selected["threadId"] or not user32.IsWindowVisible(selected["id"]):
        raise RuntimeError("The selected owned window changed before its close request")
    message = windows_message()
    response = c.c_size_t()
    c.set_last_error(0)
    if not user32.SendMessageTimeoutW(selected["id"], message["message"],
                                     message["wParam"], message["lParam"],
                                     message["flags"], message["timeoutMs"],
                                     c.byref(response)):
        raise RuntimeError(f"WM_CLOSE delivery failed or timed out (Win32 error {c.get_last_error()})")
    return {"pid": pid, "window": selected, "protocol": "WM_CLOSE",
            "delivery": "SendMessageTimeoutW", "arguments": message,
            "messageProcessed": True, "result": response.value}


class WindowAttributes(c.Structure):
    _fields_ = [("x", c.c_int), ("y", c.c_int), ("width", c.c_int),
                ("height", c.c_int), ("border_width", c.c_int),
                ("depth", c.c_int), ("visual", c.c_void_p), ("root", c.c_ulong),
                ("window_class", c.c_int), ("bit_gravity", c.c_int),
                ("win_gravity", c.c_int), ("backing_store", c.c_int),
                ("backing_planes", c.c_ulong), ("backing_pixel", c.c_ulong),
                ("save_under", c.c_int), ("colormap", c.c_ulong),
                ("map_installed", c.c_int), ("map_state", c.c_int),
                ("all_event_masks", c.c_long), ("your_event_mask", c.c_long),
                ("do_not_propagate_mask", c.c_long), ("override_redirect", c.c_int),
                ("screen", c.c_void_p)]


class ClientData(c.Union):
    _fields_ = [("b", c.c_char * 20), ("s", c.c_short * 10), ("l", c.c_long * 5)]


class ClientMessage(c.Structure):
    _fields_ = [("type", c.c_int), ("serial", c.c_ulong), ("send_event", c.c_int),
                ("display", c.c_void_p), ("window", c.c_ulong),
                ("message_type", c.c_ulong), ("format", c.c_int), ("data", ClientData)]


class XEvent(c.Union):
    _fields_ = [("client", ClientMessage), ("pad", c.c_long * 24)]


class XError(c.Structure):
    _fields_ = [("type", c.c_int), ("display", c.c_void_p),
                ("resourceid", c.c_ulong), ("serial", c.c_ulong),
                ("error_code", c.c_ubyte), ("request_code", c.c_ubyte),
                ("minor_code", c.c_ubyte)]


def close_x11(pid, title=None):
    library = ctypes.util.find_library("X11")
    if not library:
        raise RuntimeError("The runner has no X11 client library for its ordinary window close protocol")
    x = c.CDLL(library)
    signatures = {
        "XOpenDisplay": ([c.c_char_p], c.c_void_p),
        "XCloseDisplay": ([c.c_void_p], c.c_int),
        "XDefaultRootWindow": ([c.c_void_p], c.c_ulong),
        "XInternAtom": ([c.c_void_p, c.c_char_p, c.c_int], c.c_ulong),
        "XGetWindowProperty": ([c.c_void_p, c.c_ulong, c.c_ulong, c.c_long, c.c_long,
                                 c.c_int, c.c_ulong, c.POINTER(c.c_ulong), c.POINTER(c.c_int),
                                 c.POINTER(c.c_ulong), c.POINTER(c.c_ulong), c.POINTER(c.c_void_p)], c.c_int),
        "XGetWindowAttributes": ([c.c_void_p, c.c_ulong, c.POINTER(WindowAttributes)], c.c_int),
        "XQueryTree": ([c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong), c.POINTER(c.c_ulong),
                        c.POINTER(c.POINTER(c.c_ulong)), c.POINTER(c.c_uint)], c.c_int),
        "XSendEvent": ([c.c_void_p, c.c_ulong, c.c_int, c.c_long, c.POINTER(XEvent)], c.c_int),
        "XSync": ([c.c_void_p, c.c_int], c.c_int),
        "XFree": ([c.c_void_p], c.c_int),
    }
    for name, (arguments, returns) in signatures.items():
        getattr(x, name).argtypes = arguments
        getattr(x, name).restype = returns
    errors = []
    error_type = c.CFUNCTYPE(c.c_int, c.c_void_p, c.POINTER(XError))

    @error_type
    def on_error(_display, event):
        errors.append({"code": event.contents.error_code, "request": event.contents.request_code,
                       "resource": event.contents.resourceid})
        return 0

    x.XSetErrorHandler.argtypes = [error_type]
    x.XSetErrorHandler.restype = c.c_void_p
    x.XSetErrorHandler(on_error)
    display = x.XOpenDisplay(None)
    if not display:
        raise RuntimeError("Cannot open the runner's existing X11 display")

    def atom(name):
        return x.XInternAtom(display, name.encode("ascii"), True)

    def property_value(window, name, required_format):
        property_atom = atom(name)
        if not property_atom:
            return None
        actual, size, count, remaining, data = c.c_ulong(), c.c_int(), c.c_ulong(), c.c_ulong(), c.c_void_p()
        for length in [0, None]:
            request_length = (remaining.value + 3) // 4 if length is None else length
            code = x.XGetWindowProperty(display, window, property_atom, 0, request_length,
                                        False, 0, c.byref(actual), c.byref(size), c.byref(count),
                                        c.byref(remaining), c.byref(data))
            try:
                if code != 0 or errors:
                    raise RuntimeError(f"X11 property inspection failed: {errors}")
                if not actual.value:
                    return None
                if size.value != required_format:
                    raise RuntimeError(f"Unexpected {name} property format")
                if length is None:
                    if remaining.value:
                        raise RuntimeError(f"{name} changed during window inspection")
                    if required_format == 32:
                        return list(c.cast(data, c.POINTER(c.c_ulong))[:count.value])
                    return c.string_at(data, count.value)
            finally:
                if data.value:
                    x.XFree(data)
                    data = c.c_void_p()
        raise RuntimeError("Incomplete X11 property inspection")

    try:
        root = x.XDefaultRootWindow(display)
        windows = property_value(root, "_NET_CLIENT_LIST", 32)
        candidate_source = "_NET_CLIENT_LIST"
        if windows is None:
            candidate_source = "XQueryTree(root), for an Xvfb display without a window manager"
            root_return, parent, children, count = c.c_ulong(), c.c_ulong(), c.POINTER(c.c_ulong)(), c.c_uint()
            if not x.XQueryTree(display, root, c.byref(root_return), c.byref(parent), c.byref(children), c.byref(count)):
                raise RuntimeError("Cannot enumerate X11 root windows")
            try:
                windows = list(children[:count.value])
            finally:
                if children:
                    x.XFree(children)
        candidates = []
        for window in windows:
            owner = property_value(window, "_NET_WM_PID", 32)
            if owner != [pid]:
                continue
            attributes = WindowAttributes()
            if not x.XGetWindowAttributes(display, window, c.byref(attributes)):
                raise RuntimeError("The owned X11 window disappeared during inspection")
            window_title = property_value(window, "_NET_WM_NAME", 8) or b""
            candidates.append({"id": window, "pid": pid,
                               "visible": attributes.map_state == 2,
                               "topLevel": attributes.window_class == 1 and not attributes.override_redirect,
                               "title": window_title.decode("utf-8", errors="replace")})
        selected = select_window(candidates, pid, title)
        protocols, delete = atom("WM_PROTOCOLS"), atom("WM_DELETE_WINDOW")
        supported = property_value(selected["id"], "WM_PROTOCOLS", 32) or []
        if delete not in supported or not delete:
            raise RuntimeError("The owned window does not advertise WM_DELETE_WINDOW")
        attributes = WindowAttributes()
        if (title is not None and property_value(selected["id"], "_NET_WM_NAME", 8) != title.encode("utf-8")) or property_value(selected["id"], "_NET_WM_PID", 32) != [pid] or not x.XGetWindowAttributes(display, selected["id"], c.byref(attributes)) or attributes.map_state != 2:
            raise RuntimeError("The selected owned X11 window changed before its close request")
        message = x11_message(protocols, delete)
        event = XEvent()
        event.client.type = message["eventType"]
        event.client.send_event = True
        event.client.display = display
        event.client.window = selected["id"]
        event.client.message_type = message["messageType"]
        event.client.format = message["format"]
        for index, value in enumerate(message["data"]):
            event.client.data.l[index] = value
        x.XSync(display, False)
        if errors:
            raise RuntimeError(f"X11 window inspection failed: {errors}")
        if not x.XSendEvent(display, selected["id"], False, 0, c.byref(event)):
            raise RuntimeError("X11 rejected the owned window close message")
        x.XSync(display, False)
        if errors:
            raise RuntimeError(f"X11 close delivery failed: {errors}")
        return {"pid": pid, "window": selected, "protocol": "WM_PROTOCOLS/WM_DELETE_WINDOW",
                "delivery": "XSendEvent", "candidateSource": candidate_source,
                "arguments": message, "messageSubmitted": True}
    finally:
        x.XCloseDisplay(display)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    arguments = parser.parse_args()
    if arguments.pid <= 0:
        parser.error("--pid must be the exact positive launched process ID")
    if sys.platform == "win32":
        outcome = close_windows(arguments.pid)
    elif sys.platform.startswith("linux"):
        outcome = close_x11(arguments.pid)
    else:
        raise RuntimeError("Packaged OS-window acceptance currently supports Windows and Linux X11")
    print(json.dumps({"platform": sys.platform, **outcome}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"platform": sys.platform, "error": {"name": type(error).__name__, "message": str(error)}}))
        sys.exit(1)
