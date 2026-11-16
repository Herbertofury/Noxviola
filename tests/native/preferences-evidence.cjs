'use strict';
// Pure acceptance assertions shared by the real source driver and portable
// regression checks. Importing this file does not load or execute Electron.
const assert = require('node:assert/strict');
const { shortcutList } = require('../../browser/preferences.cjs');

function assertOnlySpellingChanged(before, after, enabled, platform = process.platform) {
  const { shortcuts: beforeOverrides, ...beforePreferences } = before.preferences;
  const { shortcuts: afterOverrides, ...afterPreferences } = after.preferences;
  assert.deepEqual(afterPreferences, { ...beforePreferences, spellcheckEnabled: enabled },
    'Changing local spelling must preserve every independent non-shortcut preference');
  assert.deepEqual(after.shortcuts, before.shortcuts,
    'Changing local spelling must preserve every effective shortcut and its metadata');

  // The settings form submits its displayed defaults. An omitted override and
  // an explicit copy of that same default are equivalent. Resolve both saved
  // representations using the actual product rules for this platform; do not
  // merely trust a potentially stale shortcut projection in the live snapshot.
  const resolvedBefore = shortcutList(before.preferences, platform);
  const resolvedAfter = shortcutList(after.preferences, platform);
  assert.deepEqual(before.shortcuts, resolvedBefore, 'The original live shortcuts must match their saved preference representation');
  assert.deepEqual(after.shortcuts, resolvedAfter, 'The resulting live shortcuts must match their saved preference representation');
  assert.deepEqual(resolvedAfter, resolvedBefore, 'Saved shortcut overrides must preserve every effective binding, including disabled entries');

  const known = new Set(resolvedBefore.map(item => item.id));
  const unknown = overrides => Object.fromEntries(Object.entries(overrides || {}).filter(([key]) => !known.has(key)));
  assert.deepEqual(unknown(afterOverrides), unknown(beforeOverrides),
    'Unknown shortcut metadata must be preserved exactly, without adding or removing keys');
  return { platform, before: { preferences: before.preferences, shortcuts: before.shortcuts },
    after: { preferences: after.preferences, shortcuts: after.shortcuts }, resolvedBefore, resolvedAfter };
}

module.exports = { assertOnlySpellingChanged };
