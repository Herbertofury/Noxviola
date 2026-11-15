'use strict';

const crypto = require('node:crypto');
const storage = require('./storage.cjs');
const {ServiceStore, clone, record, keys, id, identity, identities, text, timestamp, integer, url} = require('./service-store.cjs');

const empty = () => ({version: 1, nodes: []});
function rootIds(owner) { identity(owner); return {root: `root:${owner}`, bar: `bar:${owner}`, other: `other:${owner}`}; }
function roots(owner) {
  const ids = rootIds(owner);
  return [
    {id: ids.root, identity: owner, role: 'root', type: 'folder', parentId: null, index: 0, title: 'Bookmarks', dateAdded: 0, dateGroupModified: 0, tags: []},
    {id: ids.bar, identity: owner, role: 'bar', type: 'folder', parentId: ids.root, index: 0, title: 'Bookmarks bar', dateAdded: 0, dateGroupModified: 0, tags: []},
    {id: ids.other, identity: owner, role: 'other', type: 'folder', parentId: ids.root, index: 1, title: 'Other bookmarks', dateAdded: 0, dateGroupModified: 0, tags: []},
  ];
}
function tags(value) {
  if (!Array.isArray(value) || value.some(tag => typeof tag !== 'string' || !tag.trim() || tag !== tag.trim()) || new Set(value).size !== value.length) throw storage.fail('Bookmark tags must be unique, nonempty text values.');
  return [...value];
}
function decode(value) {
  record(value, 'Bookmark document');
  if (value.version !== 1) throw storage.fail('Unsupported bookmark version; original data was preserved.', 'UNSUPPORTED_VERSION');
  if (!Array.isArray(value.nodes)) throw storage.fail('Bookmark nodes must be an array.');
  const byId = new Map(), owners = new Set(), children = new Map();
  const nodes = value.nodes.map(node => {
    record(node, 'Bookmark node'); id(node.id); identity(node.identity); text(node.title, 'Bookmark title');
    if (byId.has(node.id)) throw storage.fail('Bookmark IDs are repeated.');
    if (!['folder', 'bookmark', 'separator'].includes(node.type)) throw storage.fail('An unsupported bookmark node type was preserved.', 'UNSUPPORTED_DATA');
    if (node.role !== undefined && !['root', 'bar', 'other'].includes(node.role)) throw storage.fail('An unsupported protected bookmark folder was preserved.', 'UNSUPPORTED_DATA');
    integer(node.index); timestamp(node.dateAdded, 'Bookmark creation time');
    if (node.type === 'bookmark') {
      if (url(node.url) !== node.url) throw storage.fail('A saved bookmark address is not canonical.', 'UNSUPPORTED_DATA');
      if (node.dateLastUsed !== undefined) timestamp(node.dateLastUsed, 'Bookmark last-used time');
    } else if (node.url !== undefined) throw storage.fail('Only bookmarks may have a URL.');
    if (node.type === 'folder') timestamp(node.dateGroupModified, 'Folder modification time');
    if (node.type === 'separator' && node.title !== '') throw storage.fail('A separator cannot have a title.');
    if (node.role) {
      const ids = rootIds(node.identity);
      if (node.type !== 'folder' || node.id !== ids[node.role] ||
          (node.role === 'root' ? node.parentId !== null || node.index !== 0 : node.parentId !== ids.root || node.index !== (node.role === 'bar' ? 0 : 1))) {
        throw storage.fail('A protected bookmark root was altered.');
      }
    } else {
      id(node.parentId, 'Parent folder ID');
      if (Object.values(rootIds(node.identity)).includes(node.id)) throw storage.fail('A bookmark uses a protected root ID.');
    }
    const result = {...node, tags: tags(node.tags)};
    byId.set(node.id, result); owners.add(node.identity);
    if (node.parentId !== null) {
      const rows = children.get(node.parentId) || [];
      rows.push(result); children.set(node.parentId, rows);
    }
    return result;
  });
  identities(owners);
  for (const owner of owners) for (const expected of roots(owner)) {
    if (byId.get(expected.id)?.role !== expected.role) throw storage.fail('A bookmark identity is missing a protected root.');
  }
  for (const node of nodes) if (node.parentId !== null) {
    const parent = byId.get(node.parentId);
    if (!parent || parent.type !== 'folder' || parent.identity !== node.identity) throw storage.fail('A bookmark has a missing, non-folder or cross-identity parent.');
    if (parent.role === 'root' && !node.role) throw storage.fail('The bookmark root cannot contain user-created nodes.');
  }
  for (const siblings of children.values()) {
    siblings.sort((a, b) => a.index - b.index);
    if (siblings.some((node, index) => node.index !== index)) throw storage.fail('Bookmark sibling indexes must be unique and contiguous.');
  }
  // An iterative reachability pass rejects cycles without a hidden depth cap or
  // recursive call-stack failure for a legitimately deep folder hierarchy.
  const pending = [...owners].map(owner => rootIds(owner).root), reached = new Set();
  for (let index = 0; index < pending.length; index++) {
    const current = pending[index];
    if (reached.has(current)) throw storage.fail('The bookmark tree contains a cycle.');
    reached.add(current);
    for (const child of children.get(current) || []) pending.push(child.id);
  }
  if (reached.size !== nodes.length) throw storage.fail('The bookmark tree contains an unreachable cycle.');
  return {...value, nodes};
}
function view(node) {
  const result = {id: node.id, identity: node.identity, title: node.title, type: node.type, dateAdded: node.dateAdded, tags: [...node.tags], syncing: false};
  if (node.parentId !== null) { result.parentId = node.parentId; result.index = node.index; }
  if (node.type === 'bookmark') { result.url = node.url; if (node.dateLastUsed !== undefined) result.dateLastUsed = node.dateLastUsed; }
  if (node.type === 'folder') result.dateGroupModified = node.dateGroupModified;
  if (node.role) { result.protected = true; if (node.role !== 'root') result.folderType = node.role === 'bar' ? 'bookmarks-bar' : 'other'; }
  return result;
}
function searchTerms(value) {
  return [...text(value, 'Bookmark query').matchAll(/"([^"]*)"|(\S+)/gu)].map(match => (match[1] ?? match[2]).toLocaleLowerCase()).filter(Boolean);
}

class BookmarkService extends ServiceStore {
  constructor(options = {}) { super({...options, name: 'Bookmarks', decode, empty}); this._reindex(); }
  _reindex() {
    this._nodes = new Map(this._document.nodes.map(node => [node.id, node]));
    this._children = new Map();
    for (const node of this._document.nodes) if (node.parentId !== null) {
      const children = this._children.get(node.parentId) || []; children.push(node); this._children.set(node.parentId, children);
    }
    for (const children of this._children.values()) children.sort((a, b) => a.index - b.index);
  }
  _node(owner, nodeId) {
    id(nodeId, 'Bookmark ID');
    const node = this._nodes.get(nodeId) || roots(owner).find(item => item.id === nodeId);
    if (!node || node.identity !== owner) throw storage.fail('Bookmark not found in this identity.', 'NOT_FOUND');
    return node;
  }
  _siblings(owner, parentId) {
    const parent = this._node(owner, parentId);
    if (parent.type !== 'folder') throw storage.fail('The selected bookmark is not a folder.');
    if (this._nodes.has(parentId)) return [...(this._children.get(parentId) || [])];
    return roots(owner).filter(node => node.parentId === parentId);
  }
  _parent(owner, parentId) {
    const parent = this._node(owner, parentId);
    if (parent.type !== 'folder' || parent.role === 'root') throw storage.fail('Choose a writable bookmark folder.');
    return parent;
  }
  _editable(owner, nodeId) {
    const node = this._node(owner, nodeId);
    if (node.role) throw storage.fail('Protected bookmark folders cannot be changed or removed.');
    return node;
  }
  _base(owner) { return this._nodes.has(rootIds(owner).root) ? this._document.nodes : [...this._document.nodes, ...roots(owner)]; }
  _tree(owner, nodeId) {
    const root = this._node(owner, nodeId), result = view(root), pending = [[root, result]];
    for (let index = 0; index < pending.length; index++) {
      const [node, target] = pending[index];
      if (node.type !== 'folder') continue;
      target.children = this._siblings(owner, node.id).map(child => { const entry = view(child); pending.push([child, entry]); return entry; });
    }
    return result;
  }
  get(owner, nodeIds) {
    this._identity(owner); const requested = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
    return requested.map(nodeId => view(this._node(owner, nodeId)));
  }
  getTree(owner) { this._identity(owner); return [this._tree(owner, rootIds(owner).root)]; }
  getSubTree(owner, nodeId) { this._identity(owner); return [this._tree(owner, nodeId)]; }
  getChildren(owner, parentId) { this._identity(owner); return this._siblings(owner, parentId).map(view); }
  getRecent(owner, count) {
    this._identity(owner); integer(count, 'Recent bookmark count');
    return this._document.nodes.filter(node => node.identity === owner && node.type === 'bookmark').sort((a, b) => b.dateAdded - a.dateAdded || a.id.localeCompare(b.id)).slice(0, count).map(view);
  }
  search(owner, query = '') {
    this._identity(owner);
    const options = typeof query === 'string' ? {query} : keys(query, ['query', 'title', 'url', 'tags', 'type'], 'Bookmark search');
    const terms = options.query === undefined ? [] : searchTerms(options.query);
    if (options.title !== undefined) text(options.title, 'Exact bookmark title');
    if (options.url !== undefined) text(options.url, 'Exact bookmark URL');
    if (options.tags !== undefined) tags(options.tags);
    if (options.type !== undefined && !['folder', 'bookmark', 'separator'].includes(options.type)) throw storage.fail('Unsupported bookmark search type.');
    return this._document.nodes.filter(node => {
      if (node.identity !== owner || node.role) return false;
      if (options.title !== undefined && node.title !== options.title || options.url !== undefined && node.url !== options.url || options.type !== undefined && node.type !== options.type) return false;
      if (options.tags && !options.tags.every(tag => node.tags.includes(tag))) return false;
      const haystack = `${node.title}\n${node.url || ''}`.toLocaleLowerCase();
      return terms.every(term => haystack.includes(term));
    }).map(view);
  }
  create(owner, details) {
    this._identity(owner); keys(details, ['parentId', 'index', 'title', 'url', 'type', 'tags'], 'New bookmark');
    const type = details.type === undefined ? (details.url === undefined ? 'folder' : 'bookmark') : details.type;
    if (!['folder', 'bookmark', 'separator'].includes(type)) throw storage.fail('Unsupported bookmark type.');
    if (type !== 'bookmark' && details.url !== undefined) throw storage.fail('Only a bookmark can have a URL.');
    const title = details.title === undefined ? '' : text(details.title, 'Bookmark title');
    if (type === 'separator' && title) throw storage.fail('A separator cannot have a title.');
    const parentId = details.parentId === undefined ? rootIds(owner).other : details.parentId, parent = this._parent(owner, parentId);
    const siblings = this._siblings(owner, parentId), index = details.index === undefined ? siblings.length : integer(details.index);
    if (index > siblings.length) throw storage.fail('Bookmark index is outside the destination folder.');
    const now = this._time(), node = {id: crypto.randomUUID(), identity: owner, parentId, index, title, type, dateAdded: now, tags: details.tags === undefined ? [] : tags(details.tags)};
    if (type === 'bookmark') node.url = url(details.url);
    if (type === 'folder') node.dateGroupModified = now;
    const nodes = this._base(owner).map(row => row.id === parent.id ? {...row, dateGroupModified: now} :
      row.parentId === parentId && row.index >= index ? {...row, index: row.index + 1} : row).concat(node);
    this._commit({...this._document, nodes}, [{type: 'created', identity: owner, id: node.id, node: view(node)}]);
    return view(node);
  }
  update(owner, nodeId, changes) {
    this._identity(owner); keys(changes, ['title', 'url', 'tags'], 'Bookmark changes');
    const current = this._editable(owner, nodeId), next = {...current};
    if (changes.title !== undefined) { next.title = text(changes.title, 'Bookmark title'); if (current.type === 'separator' && next.title) throw storage.fail('A separator cannot have a title.'); }
    if (changes.url !== undefined) { if (current.type !== 'bookmark') throw storage.fail('A folder or separator cannot be converted into a bookmark.'); next.url = url(changes.url); }
    if (changes.tags !== undefined) next.tags = tags(changes.tags);
    const changed = {};
    for (const key of ['title', 'url', 'tags']) if (JSON.stringify(current[key]) !== JSON.stringify(next[key])) changed[key] = clone(next[key]);
    this._commit({...this._document, nodes: this._document.nodes.map(node => node.id === nodeId ? next : node)},
      [{type: 'changed', identity: owner, id: nodeId, changes: changed, node: view(next)}]);
    return view(next);
  }
  move(owner, nodeId, destination) {
    this._identity(owner); keys(destination, ['parentId', 'index'], 'Bookmark destination');
    const current = this._editable(owner, nodeId), parentId = destination.parentId === undefined ? current.parentId : destination.parentId;
    const parent = this._parent(owner, parentId);
    for (let ancestor = parent; ancestor; ancestor = ancestor.parentId === null ? null : this._node(owner, ancestor.parentId)) {
      if (ancestor.id === nodeId) throw storage.fail('A folder cannot move into itself or its descendants.');
    }
    const remaining = this._siblings(owner, parentId).filter(node => node.id !== nodeId);
    // The service index is the final position after removing the source node.
    const index = destination.index === undefined ? remaining.length : integer(destination.index);
    if (index > remaining.length) throw storage.fail('Bookmark index is outside the destination folder.');
    if (parentId === current.parentId && index === current.index) return view(current);
    const next = {...current, parentId, index}, now = this._time();
    const orders = new Map();
    if (parentId !== current.parentId) this._siblings(owner, current.parentId).filter(node => node.id !== nodeId).forEach((node, position) => orders.set(node.id, {parentId: current.parentId, index: position}));
    remaining.splice(index, 0, next); remaining.forEach((node, position) => orders.set(node.id, {parentId, index: position}));
    const nodes = this._document.nodes.map(node => {
      let result = orders.has(node.id) ? {...node, ...orders.get(node.id)} : node;
      if (node.id === current.parentId || node.id === parentId) result = {...result, dateGroupModified: now};
      return result;
    });
    this._commit({...this._document, nodes}, [{type: 'moved', identity: owner, id: nodeId, parentId, index, oldParentId: current.parentId, oldIndex: current.index, node: view(next)}]);
    return view(next);
  }
  reorder(owner, parentId, childIds) {
    this._identity(owner); this._parent(owner, parentId);
    const children = this._siblings(owner, parentId);
    const existing = new Set(children.map(node => node.id));
    if (!Array.isArray(childIds) || childIds.length !== children.length || new Set(childIds).size !== childIds.length || childIds.some(nodeId => !existing.has(nodeId))) throw storage.fail('Reordering requires every child ID exactly once.');
    if (childIds.every((nodeId, index) => nodeId === children[index].id)) return children.map(view);
    const positions = new Map(childIds.map((nodeId, index) => [nodeId, index])), now = this._time();
    const nodes = this._document.nodes.map(node => node.id === parentId ? {...node, dateGroupModified: now} : positions.has(node.id) ? {...node, index: positions.get(node.id)} : node);
    this._commit({...this._document, nodes}, [{type: 'reordered', identity: owner, id: parentId, childIds: [...childIds]}]);
    return this.getChildren(owner, parentId);
  }
  _remove(owner, nodeId, recursive) {
    const current = this._editable(owner, nodeId), children = current.type === 'folder' ? this._siblings(owner, nodeId) : [];
    if (!recursive && children.length) throw storage.fail('This folder is not empty. Use the explicit remove-tree action.');
    const removed = new Set([nodeId]), pending = [...children];
    for (let index = 0; index < pending.length; index++) {
      const node = pending[index]; removed.add(node.id);
      if (node.type === 'folder') for (const child of this._siblings(owner, node.id)) pending.push(child);
    }
    const removedTree = this._tree(owner, nodeId), now = this._time();
    const nodes = this._document.nodes.filter(node => !removed.has(node.id)).map(node => node.id === current.parentId ? {...node, dateGroupModified: now} :
      node.parentId === current.parentId && node.index > current.index ? {...node, index: node.index - 1} : node);
    this._commit({...this._document, nodes}, [{type: 'removed', identity: owner, id: nodeId, parentId: current.parentId, index: current.index, node: removedTree}]);
    return {removed: removed.size};
  }
  remove(owner, nodeId) { this._identity(owner); return this._remove(owner, nodeId, false); }
  removeTree(owner, nodeId) { this._identity(owner); return this._remove(owner, nodeId, true); }
  markUsed(owner, nodeId) {
    this._identity(owner); const current = this._editable(owner, nodeId);
    if (current.type !== 'bookmark') throw storage.fail('Only a bookmark can be opened.');
    const next = {...current, dateLastUsed: this._time()};
    this._commit({...this._document, nodes: this._document.nodes.map(node => node.id === nodeId ? next : node)},
      [{type: 'used', identity: owner, id: nodeId, node: view(next)}]);
    return view(next);
  }
}

module.exports = {BookmarkService, decode, rootIds};
