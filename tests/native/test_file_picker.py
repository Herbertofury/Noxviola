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
            args = SimpleNamespace(pid=314, title=('Exact picker' if cancel else 'Add collections from a same-identity backup; existing collections stay untouched'), file=os.path.abspath('fixture.noxlibrary'), cancel=cancel)
            def run(cmd, **kwargs):
                nonlocal submitted
                commands.append(cmd)
                if cmd[1] == 'search':
                    return subprocess.CompletedProcess(cmd, 1 if submitted else 0, '' if submitted else '123\n', '')
                if cmd[1] == 'getwindowpid':
                    return subprocess.CompletedProcess(cmd, 0, '314\n', '')
                if cmd[1] == 'getwindowname':
                    return subprocess.CompletedProcess(cmd, 0, args.title+'\n', '')
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

    def test_x11_accept_mnemonic_refuses_secondary_modal(self):
        for secondary in (False, True):
            commands, dismissed = [], False
            args = SimpleNamespace(pid=314, title='Add collections from a same-identity backup; existing collections stay untouched', file=os.path.abspath('fixture.noxlibrary'), cancel=False)
            def run(cmd, **kwargs):
                nonlocal dismissed
                commands.append(cmd)
                if cmd[0] == 'xprop':
                    return subprocess.CompletedProcess(cmd, 0, 'WM_TRANSIENT_FOR(WINDOW): window id # 0x7b', '')
                if cmd[1] == 'search':
                    if '--name' not in cmd:
                        return subprocess.CompletedProcess(cmd, 0, '123\n456\n' if secondary else '123\n', '')
                    return subprocess.CompletedProcess(cmd, 1 if dismissed else 0, '' if dismissed else '123\n', '')
                if cmd[1] == 'getwindowpid': return subprocess.CompletedProcess(cmd, 0, '314\n', '')
                if cmd[1] == 'getwindowname': return subprocess.CompletedProcess(cmd, 0, args.title+'\n', '')
                if cmd[-1] == 'alt+o': dismissed = True
                return subprocess.CompletedProcess(cmd, 0, '', '')
            with patch.object(picker.subprocess, 'run', side_effect=run):
                if secondary:
                    with self.assertRaisesRegex(RuntimeError, 'Secondary owned modal'):
                        picker.x11_picker(args, time.monotonic()+2)
                else:
                    self.assertTrue(picker.x11_picker(args, time.monotonic()+2)['dialogDismissed'])
            accepts = [cmd for cmd in commands if cmd[-1] == 'alt+o']
            self.assertEqual(len(accepts), 0 if secondary else 1)

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


    def test_legacy_requires_exact_name_role_state_and_action(self):
        self.assertTrue(picker.legacy_allowed('action','Cancel',{'Cancel'},43,0,'Press'))
        self.assertTrue(picker.legacy_allowed('value','File name:',{'File name:'},42,0,''))
        for name, role, state, action in [('Replace',43,0,'Press'), ('Cancel',0,0,'Press'), ('Cancel',43,1,'Press'), ('Cancel',43,0x8000,'Press'), ('Cancel',43,0x10000,'Press'), ('Cancel',43,0,'Open')]:
            self.assertFalse(picker.legacy_allowed('action',name,{'Cancel'},role,state,action))
        self.assertFalse(picker.legacy_allowed('value','File name:',{'File name:'},42,0x40,''))

    def test_native_wrapper_actual_route_with_fake_owned_tree(self):
        for cancel, duplicate, field_mode in [(True,False,'single'),(False,False,'single'),(True,True,'single'),(False,False,'nested'),(False,False,'siblings'),(False,False,'foreign'),(False,False,'export')]:
            actions=[]
            args=SimpleNamespace(pid=314,title=('Export all saved collections for this identity; choose a NEW filename' if field_mode=='export' else 'Add collections from a same-identity backup; existing collections stay untouched'),file=os.path.abspath('fixture.noxlibrary'),cancel=cancel,timeout=2)
            class Legacy:
                State=0
                DefaultAction='Press'
                Value=''
                def __init__(self,name,role): self.Name,self.Role=name,role
                def SetValue(self,value,waitTime=0): self.Value=value;actions.append('value')
                def DoDefaultAction(self,waitTime=0): actions.append('action');main.children=[]
            class Node:
                IsEnabled=True
                IsOffscreen=False
                AutomationId=''
                def __init__(self,name,pid=314,kind=0,pattern=None):
                    self.Name,self.ProcessId,self.ControlType,self.pattern=name,pid,kind,pattern
                    self.children=[];self.sibling=None
                def add(self,*children):
                    self.children=list(children)
                    for left,right in zip(children,children[1:]): left.sibling=right
                    return self
                def GetFirstChildControl(self): return self.children[0] if self.children else None
                def GetNextSiblingControl(self): return self.sibling
                def GetPattern(self,kind): return self.pattern if kind==18 else None
            button_name='Cancel' if cancel else ('Save' if field_mode=='export' else 'Open')
            button=Node(button_name,pattern=Legacy(button_name,43))
            field=Node('File name:',kind=50004,pattern=Legacy('File name:',42))
            if field_mode == 'nested':
                field=Node('File name:',kind=50003,pattern=Legacy('File name:',42)).add(field)
            elif field_mode == 'foreign':
                field.ProcessId=999
            picker_node=Node(args.title,kind=32).add(field,button)
            if duplicate: picker_node.add(field,button,Node(button_name,pattern=Legacy(button_name,43)))
            if field_mode == 'siblings': picker_node.add(field,button,Node('File name:',kind=50003,pattern=Legacy('File name:',42)))
            if field_mode == 'export': picker_node.add(field,button,Node('Open',pattern=Legacy('Open',43)),Node('Open',pattern=Legacy('Open',43)))
            main=Node('Main',kind=32).add(picker_node)
            foreign=Node(args.title,pid=999,kind=32)
            root=Node('Desktop',pid=0).add(foreign,main)
            api=SimpleNamespace(GetRootControl=lambda:root,ControlType=SimpleNamespace(WindowControl=32),PatternId=SimpleNamespace(ValuePattern=2,InvokePattern=0,LegacyIAccessiblePattern=18))
            with patch.dict(sys.modules,{'uiautomation':api}), patch.object(picker.sys,'stderr'):
                if duplicate or field_mode in ('siblings','foreign'):
                    with self.assertRaisesRegex(RuntimeError,'Expected one exact owned'):
                        picker.windows_picker(args)
                    self.assertEqual(actions,[])
                else:
                    result=picker.windows_picker(args)
                    self.assertTrue(result['dialogDismissed'])
                    self.assertIn('LegacyIAccessiblePattern',result['delivery'])
                    self.assertEqual(actions,['action'] if cancel else ['value','action'])

    def test_windows_action_is_bound_to_exact_operation_title(self):
        self.assertEqual(picker.windows_action_names('Export all saved collections for this identity; choose a NEW filename', False), {'Save'})
        self.assertEqual(picker.windows_action_names('Add collections from a same-identity backup; existing collections stay untouched', False), {'Open'})
        self.assertEqual(picker.windows_action_names('Exact picker', True), {'Cancel'})
        with self.assertRaises(RuntimeError): picker.windows_action_names('Other export title', False)

    def test_filename_combo_collapses_only_its_unique_edit_descendant(self):
        def match(kind, ancestry): return (SimpleNamespace(ControlType=kind), object(), 'ValuePattern', ancestry)
        combo, edit = match(50003,(1,)), match(50004,(1,0))
        self.assertEqual(picker.filename_matches([combo,edit]),[edit])
        for other in [match(50004,(2,)), match(50004,(0,)), match(50003,(1,0))]:
            candidates=[combo,other]
            self.assertEqual(picker.filename_matches(candidates),candidates)
        duplicate=[combo,edit,match(50004,(1,1))]
        self.assertEqual(picker.filename_matches(duplicate),duplicate)

    def test_native_wrapper_keeps_owned_bounded_unique_selection(self):
        source = inspect.getsource(picker.windows_picker)
        for required in ['node.ProcessId != args.pid', 'node.Name == args.title', 'visited > 64', 'visited > 2048', 'len(found) > 1', 'len(matches) != 1', 'pattern.Value != args.file', 'legacy_allowed', 'pattern.DoDefaultAction(waitTime=0)']:
            self.assertIn(required, source)
        for forbidden in ['SendKeys', '.Click(', 'SetFocus', 'SetForegroundWindow']:
            self.assertNotIn(forbidden, source)


if __name__ == '__main__':
    unittest.main()
