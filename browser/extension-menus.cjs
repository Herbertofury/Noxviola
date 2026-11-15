'use strict';
// Context selection and title substitution adapted from electron-chrome-extensions
// 4.10.0, src/browser/api/context-menus.ts (MIT; extension-adapter-LICENSE.txt).
// Mutation validation, identity/epoch admission and actual checkbox/radio state
// are Noxviola's integration, not upstream's success-shaped fallback paths.
const {matches, pattern} = require('./extension-policy.cjs');
function contextTypes(params) {
  const contexts = new Set(['all']);
  if (['audio', 'video', 'image'].includes(params.mediaType)) contexts.add(params.mediaType);
  if (params.pageURL) contexts.add('page');
  if (params.linkURL) contexts.add('link');
  if (params.frameURL && params.frameURL !== params.pageURL) contexts.add('frame');
  if (params.selectionText) contexts.add('selection');
  if (params.isEditable) contexts.add('editable');
  return contexts;
}
function matchesConditions(props, params, allowFileAccess) {
  if (props.visible === false || !(props.contexts || ['page']).some(value => contextTypes(params).has(value))) return false;
  for (const [key, url] of [['targetUrlPatterns', params.srcURL || params.linkURL], ['documentUrlPatterns', params.frameURL || params.pageURL]]) {
    if (props[key]?.length && (!url || !props[key].some(value => matches(value, url, {allowFileAccess})))) return false;
  }
  return true;
}
const fields = new Set(['id','type','title','contexts','visible','enabled','checked','parentId','documentUrlPatterns','targetUrlPatterns']);
function validate(props, items) {
  if (!props || typeof props !== 'object' || Array.isArray(props)) throw new Error('Menu properties must be an object.');
  for (const key of Object.keys(props)) if (!fields.has(key)) throw new Error('Unsupported context menu property: ' + key);
  if (!(typeof props.id === 'string' && props.id.length || Number.isSafeInteger(props.id) && props.id >= 0)) throw new Error('A string or nonnegative integer menu ID is required.');
  if (!['normal','checkbox','radio','separator'].includes(props.type || 'normal')) throw new Error('Unsupported menu type.');
  if ((props.type || 'normal') !== 'separator' && (typeof props.title !== 'string' || !props.title)) throw new Error('A menu title is required.');
  for (const key of ['visible','enabled','checked']) if (props[key] !== undefined && typeof props[key] !== 'boolean') throw new Error('Invalid menu ' + key);
  if (props.checked !== undefined && !['checkbox','radio'].includes(props.type)) throw new Error('Only checkbox and radio menus have checked state.');
  if (props.contexts && (!Array.isArray(props.contexts) || !props.contexts.length || props.contexts.some(value => !['all','page','frame','selection','link','editable','image','video','audio'].includes(value)))) throw new Error('Unsupported menu context.');
  for (const key of ['documentUrlPatterns','targetUrlPatterns']) if (props[key] && (!Array.isArray(props[key]) || props[key].some(value => !pattern(value)))) throw new Error('Invalid menu match pattern.');
  const visited = new Set([String(props.id)]);
  let parent = props.parentId;
  while (parent !== undefined) {
    const key = String(parent);
    if (visited.has(key)) throw new Error('Context menu parent cycle.');
    visited.add(key);
    const item = items.get(key);
    if (!item) throw new Error('Context menu parent not found.');
    if (['separator','checkbox','radio'].includes(item.type)) throw new Error('This menu type cannot contain children.');
    parent = item.parentId;
  }
}
class ExtensionMenus {
  constructor({admit, clicked}) { this.admit = admit; this.clicked = clicked; this.owners = new Map(); }
  key(context) { return context.identity + '\0' + context.id; }
  records(context) {
    const key = this.key(context), old = this.owners.get(key);
    if (!old || old.epoch !== context.epoch) this.owners.set(key, {epoch: context.epoch, items: new Map()});
    return this.owners.get(key).items;
  }
  revoke(id, identity) { this.owners.delete(identity + '\0' + id); }
  invoke(context, method, args) {
    const items = this.records(context);
    if (method === 'create') {
      const props = structuredClone(args[0]);
      validate(props, items);
      if (items.has(String(props.id))) throw new Error('Context menu ID already exists.');
      items.set(String(props.id), props);
      return props.id;
    }
    if (method === 'update') {
      const current = items.get(String(args[0]));
      if (!current) throw new Error('Context menu not found.');
      if (args[1]?.id !== undefined) throw new Error('Context menu ID cannot be changed.');
      const props = {...current, ...structuredClone(args[1])};
      validate(props, items); items.set(String(props.id), props); return;
    }
    if (method === 'removeAll') { items.clear(); return; }
    if (method !== 'remove') throw new Error('Unsupported context menu method.');
    if (!items.has(String(args[0]))) throw new Error('Context menu not found.');
    const removed = new Set([String(args[0])]);
    for (let changed = true; changed;) {
      changed = false;
      for (const [id, props] of items) if (!removed.has(id) && removed.has(String(props.parentId))) { removed.add(id); changed = true; }
    }
    for (const id of removed) items.delete(id);
  }
  build(context, tab, params) {
    const items = this.records(context), templates = new Map();
    for (const [id, props] of items) {
      if (!matchesConditions(props, params, context.allowFileAccess)) continue;
      const template = {id, type: props.type || 'normal', label: (props.title || '').split('%s').join(params.selectionText || ''), enabled: props.enabled !== false};
      if (['checkbox','radio'].includes(props.type)) template.checked = !!props.checked;
      template.click = () => {
        const current = items.get(id);
        if (!current || current.enabled === false || !this.admit(context, tab)) return;
        const info = {menuItemId: current.id, editable: !!params.isEditable};
        if (current.parentId !== undefined) info.parentMenuItemId = current.parentId;
        for (const [from,to] of [['pageURL','pageUrl'],['frameURL','frameUrl'],['linkURL','linkUrl'],['srcURL','srcUrl'],['selectionText','selectionText'],['mediaType','mediaType']]) if (params[from]) info[to] = params[from];
        if (['checkbox','radio'].includes(current.type)) {
          info.wasChecked = !!current.checked;
          current.checked = current.type === 'radio' || !current.checked;
          if (current.type === 'radio') for (const sibling of items.values()) if (sibling !== current && sibling.type === 'radio' && sibling.parentId === current.parentId) sibling.checked = false;
          info.checked = current.checked;
        }
        this.clicked(context, info, tab);
      };
      templates.set(id, template);
    }
    const roots = [];
    for (const [id, template] of templates) {
      const parent = items.get(id).parentId;
      if (parent === undefined) roots.push(template);
      else if (templates.has(String(parent))) {
        const owner = templates.get(String(parent)); owner.type = 'submenu'; (owner.submenu ||= []).push(template);
      }
    }
    return roots.length > 1 ? [{label: context.name, submenu: roots}] : roots;
  }
}
module.exports = {ExtensionMenus};
