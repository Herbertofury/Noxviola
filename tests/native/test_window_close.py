"""Portable selection/protocol contracts. No OS library or window is opened."""
import importlib.util
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("window_close", Path(__file__).with_name("window-close.py"))
close = importlib.util.module_from_spec(spec)
spec.loader.exec_module(close)


class WindowCloseContracts(unittest.TestCase):
    def test_selection_requires_exact_owner_visible_top_level_and_uniqueness(self):
        main = {"id": 17, "pid": 314, "visible": True, "topLevel": True}
        unrelated = {**main, "id": 18, "pid": 315}
        hidden = {**main, "id": 19, "visible": False}
        child = {**main, "id": 20, "topLevel": False}
        self.assertIs(close.select_window([unrelated, hidden, child, main], 314), main)
        for candidates in [[], [unrelated, hidden, child], [main, {**main, "id": 21}]]:
            with self.assertRaisesRegex(RuntimeError, "Expected one visible top-level window"):
                close.select_window(candidates, 314)
        for pid in [0, -1, "314", True]:
            with self.assertRaises(ValueError):
                close.select_window([main], pid)

    def test_windows_uses_vetoable_close_not_destroy_quit_or_broadcast(self):
        self.assertEqual(close.windows_message(), {"message": 0x10, "wParam": 0,
                         "lParam": 0, "flags": 2, "timeoutMs": 5000})

    def test_x11_packet_uses_owned_client_protocol_and_no_propagation(self):
        self.assertEqual(close.x11_message(71, 72), {"eventType": 33, "messageType": 71,
                         "format": 32, "data": [72, 0, 0, 0, 0],
                         "propagate": False, "eventMask": 0})
        for protocols, delete in [(0, 72), (71, 0)]:
            with self.assertRaisesRegex(RuntimeError, "must already exist"):
                close.x11_message(protocols, delete)
        self.assertEqual(close.c.sizeof(close.XEvent), 24 * close.c.sizeof(close.c.c_long))


if __name__ == "__main__":
    unittest.main()
