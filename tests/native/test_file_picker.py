"""Portable safety contracts; these do not claim native picker acceptance."""
import importlib.util
from pathlib import Path
import os
import sys
import unittest
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
                         ['xdotool','search','--onlyvisible','--pid','314','--name',r'^Pick\ \(fixture\)\.\*$'])

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

    def test_windows_uses_scoped_accessibility_not_global_keys(self):
        script=picker.WINDOWS_SCRIPT
        for required in ['ProcessIdProperty','NameProperty','$T::Children','ValuePattern','InvokePattern']:
            self.assertIn(required,script)
        for forbidden in ['SendKeys','SendInput','SetForegroundWindow','ExecutionPolicy','Replace\')']:
            self.assertNotIn(forbidden,script)


if __name__ == '__main__':
    unittest.main()
