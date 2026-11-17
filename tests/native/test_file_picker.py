"""Portable safety contracts; these do not claim native picker acceptance."""
import importlib.util
import inspect
from pathlib import Path
import os
import sys
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import subprocess
import time
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("file_picker", Path(__file__).with_name("file-picker.py"))
picker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(picker)


class FilePickerContracts(unittest.TestCase):
    def test_requires_exact_pid_title_action_and_absolute_path(self):
        path = os.path.abspath("fixture.noxlibrary")
        picker.validate(314, "Exact fixture title", path, False, 15)
        picker.validate(314, "Exact fixture title", None, True, 15)
        for args in [(0,"T",path,False,15), (True,"T",path,False,15),
                     (314,"",path,False,15), (314,"T\n",path,False,15),
                     (314,"T","relative",False,15), (314,"T",path,True,15),
                     (314,"T",None,False,15), (314,"T",path,False,31)]:
            with self.assertRaises(ValueError):
                picker.validate(*args)

    def test_window_selection_never_broadens_pid_title_or_visibility(self):
        own = dict(pid=314,title="Pick",visible=True,topLevel=True)
        others = [{**own,"pid":315}, {**own,"title":"Pick other"},
                  {**own,"visible":False}, {**own,"topLevel":False}]
        self.assertIs(picker.select_dialog(others+[own],314,"Pick"),own)
        self.assertIsNone(picker.select_dialog(others,314,"Pick"))
        with self.assertRaisesRegex(RuntimeError,"Ambiguous"):
            picker.select_dialog([own,dict(own)],314,"Pick")

    def test_uses_only_unique_filename_field_and_normal_actions(self):
        field=dict(visible=True,enabled=True,editable=True,labels=['File name:'])
        search={**field,'labels':['Search']}
        self.assertIs(picker.select_control([search,field], 'path'),field)
        for items in [[search],[field,dict(field)],[{**field,'enabled':False}]]:
            with self.assertRaises(RuntimeError):picker.select_control(items,'path')
        save=dict(visible=True,enabled=True,button=True,name='_Save')
        overwrite={**save,'name':'Replace'}
        self.assertIs(picker.select_control([save,overwrite],'accept'),save)
        with self.assertRaises(RuntimeError):picker.select_control([overwrite],'accept')
        cancel={**save,'name':'Cancel'}
        self.assertIs(picker.select_control([cancel,save],'cancel'),cancel)

    def test_x11_location_shortcut_target_is_exact_not_regex_wildcard(self):
        self.assertEqual(picker.x11_search_arguments(314,'Pick (fixture).*'),
                         ['xdotool','search','--all','--onlyvisible','--pid','314','--name',r'^Pick\ \(fixture\)\.\*$'])

    def test_windows_diagnostics_are_bounded_and_owned_only(self):
        script = picker.WINDOWS_SCRIPT
        block = script.split('function OwnedDiagnostics {', 1)[1].split('function Dialog {', 1)[0]
        self.assertIn('$visited -lt 64', block)
        self.assertIn('$depth -lt 3', block)
        self.assertIn('AddMilliseconds(700)', block)
        self.assertLess(block.index('ProcessId -ne [int]$r.pid'), block.index('$element.Current.Name'))
        self.assertIn('[Console]::Error.WriteLine', block)
        for forbidden in ['Invoke()', 'SetValue(', 'SendKeys', 'SendInput']:
            self.assertNotIn(forbidden, block)

    def test_linux_diagnostics_do_not_read_foreign_titles_or_send_input(self):
        block = inspect.getsource(picker.linux_picker).split('def diagnostics():', 1)[1].split('def dialogs():', 1)[0]
        self.assertIn('min(desktop.get_child_count(), 32)', block)
        self.assertIn('min(app.get_child_count(), 32)', block)
        self.assertLess(block.index('if pid != args.pid:'), block.index('app.get_name()'))
        self.assertLess(block.index('obj.get_process_id() == args.pid'), block.index('obj.get_name()'))
        self.assertLess(block.index('query(["getwindowpid", xid]) == str(args.pid)'), block.index('query(["getwindowname", xid])'))
        for forbidden in ['"key"', 'set_text_contents', 'do_action']:
            self.assertNotIn(forbidden, block)

    def test_x11_fallback_targets_only_verified_owned_window(self):
        for cancel in (True, False):
            commands = []
            submitted = False
            args = SimpleNamespace(pid=314, title='Exact picker', file=os.path.abspath('fixture.noxlibrary'), cancel=cancel)
            def run(cmd, **kwargs):
                nonlocal submitted
                commands.append(cmd)
                if cmd[1] == 'search':
                    return subprocess.CompletedProcess(cmd, 1 if submitted else 0, '' if submitted else '123\n', '')
                if cmd[1] == 'getwindowpid':
                    return subprocess.CompletedProcess(cmd, 0, '314\n', '')
                if cmd[1] == 'getwindowname':
                    return subprocess.CompletedProcess(cmd, 0, 'Exact picker\n', '')
                self.assertEqual(cmd[2:4], ['--window', '123'])
                if cmd[-1] in ('Escape', 'Return'): submitted = True
                return subprocess.CompletedProcess(cmd, 0, '', '')
            with patch.object(picker.subprocess, 'run', side_effect=run):
                result = picker.x11_picker(args, time.monotonic()+10)
            self.assertFalse(result['accessibilityQualified'])
            self.assertTrue(result['dialogDismissed'])
            inputs = [cmd for cmd in commands if cmd[1] in ('key', 'type')]
            self.assertEqual(len(inputs), 1 if cancel else 4)
            for command in inputs:
                index = commands.index(command)
                self.assertEqual([cmd[1] for cmd in commands[index-3:index]], ['getwindowpid','getwindowname','search'])

    def test_x11_fallback_rejects_changed_owner_before_input(self):
        commands = []
        def run(cmd, **kwargs):
            commands.append(cmd)
            return subprocess.CompletedProcess(cmd, 0, '123\n' if cmd[1] == 'search' else '999\n', '')
        args = SimpleNamespace(pid=314, title='Exact picker', file=None, cancel=True)
        with patch.object(picker.subprocess, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'changed before'):
                picker.x11_picker(args, time.monotonic()+10)
        self.assertFalse(any(cmd[1] in ('key','type') for cmd in commands))
        source = inspect.getsource(picker.linux_picker)
        self.assertIn('if desktop.get_child_count() == 0:', source)

    def test_windows_button_diagnostics_are_owned_readonly_and_bounded(self):
        block = picker.WINDOWS_SCRIPT.split('function OwnedButtonDiagnostics($d) {', 1)[1].split('function NamedControls', 1)[0]
        self.assertIn('$i -lt 32', block)
        self.assertIn('AddMilliseconds(700)', block)
        self.assertLess(block.index('ProcessId -ne [int]$r.pid'), block.index('$button.Current.Name'))
        self.assertIn('IsEnabled', block)
        self.assertIn('IsOffscreen', block)
        for forbidden in ['Invoke()', 'SetValue(', 'SendKeys', 'SendInput']:
            self.assertNotIn(forbidden, block)

    def test_windows_named_controls_require_exact_owner_name_and_pattern(self):
        block = picker.WINDOWS_SCRIPT.split('function NamedControls', 1)[1].split('$d=$null', 1)[0]
        self.assertIn('$A::ProcessIdProperty, [int]$r.pid', block)
        self.assertIn("$name.Replace('&','') -cnotin $names", block)
        self.assertIn('TryGetCurrentPattern($pattern, [ref]$behavior)', block)
        self.assertIn('$supported -and $control.Current.IsEnabled -and -not $control.Current.IsOffscreen', block)
        self.assertIn('$raw.Count -gt 2048', block)
        self.assertNotIn('ControlTypeProperty', block)
        self.assertLess(block.index('ProcessId -ne [int]$r.pid'), block.index('$control.Current.Name'))

    def test_windows_phase_diagnostics_bracket_native_operations(self):
        script = picker.WINDOWS_SCRIPT
        for before, operation, after in [
            ("Phase 'before-dialog-discovery'", '$d=Dialog', "Phase 'after-dialog-discovery'"),
            ("Phase 'before-button-enumeration'", '$buttons = @(NamedControls', "Phase 'after-button-enumeration'"),
            ("Phase 'before-invoke'", '$invoke.Invoke()', "Phase 'after-invoke'")]:
            self.assertLess(script.index(before), script.index(operation))
            self.assertLess(script.index(operation), script.index(after))

    def test_windows_nested_picker_keeps_exact_owner_and_title(self):
        block = picker.WINDOWS_SCRIPT.split('function Dialog {', 1)[1].split('function OwnedButtonDiagnostics', 1)[0]
        self.assertIn('$A::ProcessIdProperty, [int]$r.pid', block)
        self.assertIn('[System.Windows.Automation.ControlType]::Window', block)
        self.assertIn('$element.Current.Name -ceq [string]$r.title', block)
        self.assertIn('-not $element.Current.IsOffscreen', block)
        self.assertIn('$visited -ge 64', block)
        self.assertIn('$depth -ge 3', block)
        self.assertIn("throw 'Ambiguous owned native picker'", block)
        self.assertNotIn('$T::Descendants', block)
        self.assertLess(block.index('ProcessId -ne [int]$r.pid'), block.index('$element.Current.Name'))

    def test_windows_uses_scoped_accessibility_not_global_keys(self):
        script=picker.WINDOWS_SCRIPT
        for required in ['ProcessIdProperty','ControlTypeProperty','$T::Children','ValuePattern','InvokePattern']:
            self.assertIn(required,script)
        for forbidden in ['SendKeys','SendInput','SetForegroundWindow','ExecutionPolicy','Replace\')']:
            self.assertNotIn(forbidden,script)


if __name__ == '__main__':
    unittest.main()
