'use strict';

// Workspaces and groups organize tabs. They never select or replace a browser
// identity, own a cookie store, close tabs, or change the session document.
const crypto = require('node:crypto');
const storage = require('./storage.cjs');
const {ServiceStore, record, keys, id, text, timestamp} = require('./service-store.cjs');

const COLORS = Object.freeze(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']);
const DEFAULT_WORKSPACE = 'default';
const empty = () => ({version: 1, workspaces: [{id: DEFAULT_WORKSPACE, name: 'Default', color: 'purple', dateAdded: 0, dateModified: 0}], groups: []});
function name(value) { text(value, 'Name'); if (!value.trim()) throw storage.fail('A nonempty name is required.'); return value; }
function color(value) { if (!COLORS.includes(value)) throw storage.fail('Choose a supported workspace/group color.'); return value; }
function decode(value) {
  record(value, 'Workspace document');
  if (value.version !== 1) throw storage.fail('Unsupported workspace version; original data was preserved.', 'UNSUPPORTED_VERSION');
  if (!Array.isArray(value.workspaces) || !Array.isArray(value.groups)) throw storage.fail('Workspaces and groups must be arrays.');
  const workspaceIds = new Set(), groupIds = new Set();
  const workspaces = value.workspaces.map(workspace => {
    record(workspace, 'Workspace'); id(workspace.id); name(workspace.name); color(workspace.color);
    timestamp(workspace.dateAdded, 'Workspace creation time'); timestamp(workspace.dateModified, 'Workspace modification time');
    if (workspaceIds.has(workspace.id)) throw storage.fail('Workspace IDs are repeated.');
    workspaceIds.add(workspace.id); return {...workspace};
  });
  if (!workspaceIds.has(DEFAULT_WORKSPACE)) throw storage.fail('The default workspace is missing.');
  const groups = value.groups.map(group => {
    record(group, 'Tab group'); id(group.id); id(group.workspaceId, 'Workspace ID'); name(group.name); color(group.color);
    timestamp(group.dateAdded, 'Group creation time'); timestamp(group.dateModified, 'Group modification time');
    if (typeof group.collapsed !== 'boolean') throw storage.fail('A group collapsed state must be boolean.');
    if (groupIds.has(group.id)) throw storage.fail('Tab-group IDs are repeated.');
    if (!workspaceIds.has(group.workspaceId)) throw storage.fail('A tab group refers to a missing workspace.');
    groupIds.add(group.id); return {...group};
  });
  return {...value, workspaces, groups};
}
function workspaceView(workspace) { return {id: workspace.id, name: workspace.name, color: workspace.color, dateAdded: workspace.dateAdded, dateModified: workspace.dateModified, protected: workspace.id === DEFAULT_WORKSPACE}; }
function groupView(group) { return {id: group.id, workspaceId: group.workspaceId, name: group.name, color: group.color, collapsed: group.collapsed, dateAdded: group.dateAdded, dateModified: group.dateModified}; }

class WorkspaceService extends ServiceStore {
  constructor(options = {}) {
    super({...options, name: 'Workspaces', decode, empty});
    this.isWorkspaceInUse = options.isWorkspaceInUse === undefined ? () => false : options.isWorkspaceInUse;
    this.isGroupInUse = options.isGroupInUse === undefined ? () => false : options.isGroupInUse;
    if (typeof this.isWorkspaceInUse !== 'function' || typeof this.isGroupInUse !== 'function') throw new TypeError('Workspace usage callbacks must be functions.');
    this._reindex();
  }
  _reindex() {
    this._workspaces = new Map(this._document.workspaces.map(workspace => [workspace.id, workspace]));
    this._groups = new Map(this._document.groups.map(group => [group.id, group]));
  }
  _workspace(workspaceId) {
    id(workspaceId, 'Workspace ID'); const result = this._workspaces.get(workspaceId);
    if (!result) throw storage.fail('Workspace not found.', 'NOT_FOUND'); return result;
  }
  _group(groupId) {
    id(groupId, 'Group ID'); const result = this._groups.get(groupId);
    if (!result) throw storage.fail('Tab group not found.', 'NOT_FOUND'); return result;
  }
  _unused(callback, target, label) {
    const used = callback(target);
    if (typeof used !== 'boolean') throw storage.fail(`${label} usage could not be checked.`);
    if (used) throw storage.fail(`Move the assigned tabs before removing this ${label.toLowerCase()}.`, 'IN_USE');
  }
  list() { this._ready(); return this._document.workspaces.map(workspaceView); }
  get(workspaceId) { this._ready(); return workspaceView(this._workspace(workspaceId)); }
  create(details) {
    this._ready(); keys(details, ['name', 'color'], 'New workspace');
    const now = this._time(), workspace = {id: crypto.randomUUID(), name: name(details.name), color: color(details.color === undefined ? 'purple' : details.color), dateAdded: now, dateModified: now};
    this._commit({...this._document, workspaces: [...this._document.workspaces, workspace]}, [{type: 'workspace-created', workspace: workspaceView(workspace)}]);
    return workspaceView(workspace);
  }
  update(workspaceId, changes) {
    this._ready(); keys(changes, ['name', 'color'], 'Workspace changes');
    const current = this._workspace(workspaceId), next = {...current};
    if (changes.name !== undefined) next.name = name(changes.name);
    if (changes.color !== undefined) next.color = color(changes.color);
    if (next.name === current.name && next.color === current.color) return workspaceView(current);
    next.dateModified = this._time();
    this._commit({...this._document, workspaces: this._document.workspaces.map(workspace => workspace.id === workspaceId ? next : workspace)},
      [{type: 'workspace-changed', workspace: workspaceView(next)}]);
    return workspaceView(next);
  }
  remove(workspaceId) {
    this._ready(); this._workspace(workspaceId);
    if (workspaceId === DEFAULT_WORKSPACE) throw storage.fail('The default workspace cannot be removed.');
    this._unused(this.isWorkspaceInUse, workspaceId, 'Workspace');
    if (this._document.groups.some(group => group.workspaceId === workspaceId)) throw storage.fail('Remove or relocate the workspace’s group definitions first.', 'IN_USE');
    this._commit({...this._document, workspaces: this._document.workspaces.filter(workspace => workspace.id !== workspaceId)}, [{type: 'workspace-removed', id: workspaceId}]);
    return true;
  }
  listGroups(workspaceId) {
    this._ready(); if (workspaceId !== undefined) this._workspace(workspaceId);
    return this._document.groups.filter(group => workspaceId === undefined || group.workspaceId === workspaceId).map(groupView);
  }
  getGroup(groupId) { this._ready(); return groupView(this._group(groupId)); }
  createGroup(details) {
    this._ready(); keys(details, ['workspaceId', 'name', 'color', 'collapsed'], 'New tab group');
    const workspaceId = details.workspaceId === undefined ? DEFAULT_WORKSPACE : details.workspaceId; this._workspace(workspaceId);
    const now = this._time(), group = {id: crypto.randomUUID(), workspaceId, name: name(details.name), color: color(details.color === undefined ? 'grey' : details.color),
      collapsed: details.collapsed === undefined ? false : details.collapsed, dateAdded: now, dateModified: now};
    if (typeof group.collapsed !== 'boolean') throw storage.fail('A group collapsed state must be boolean.');
    this._commit({...this._document, groups: [...this._document.groups, group]}, [{type: 'group-created', group: groupView(group)}]);
    return groupView(group);
  }
  updateGroup(groupId, changes) {
    this._ready(); keys(changes, ['name', 'color', 'collapsed'], 'Tab-group changes');
    const current = this._group(groupId), next = {...current};
    if (changes.name !== undefined) next.name = name(changes.name);
    if (changes.color !== undefined) next.color = color(changes.color);
    if (changes.collapsed !== undefined) { if (typeof changes.collapsed !== 'boolean') throw storage.fail('A group collapsed state must be boolean.'); next.collapsed = changes.collapsed; }
    if (next.name === current.name && next.color === current.color && next.collapsed === current.collapsed) return groupView(current);
    next.dateModified = this._time();
    this._commit({...this._document, groups: this._document.groups.map(group => group.id === groupId ? next : group)}, [{type: 'group-changed', group: groupView(next)}]);
    return groupView(next);
  }
  removeGroup(groupId) {
    this._ready(); this._group(groupId); this._unused(this.isGroupInUse, groupId, 'Tab group');
    this._commit({...this._document, groups: this._document.groups.filter(group => group.id !== groupId)}, [{type: 'group-removed', id: groupId}]);
    return true;
  }
}

module.exports = {WorkspaceService, decode, COLORS, DEFAULT_WORKSPACE};
