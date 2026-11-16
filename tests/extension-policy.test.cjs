'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const policy = require('../browser/extension-policy.cjs');

test('extension-page URL query matching is limited to the caller’s own origin', () => {
  const own='a'.repeat(32), other='b'.repeat(32), page=`chrome-extension://${own}/ui/options/index.html`;
  assert.equal(policy.matches(page,page,{ownExtensionId:own}),true);
  assert.equal(policy.matches(`chrome-extension://${own}/ui/*`,page,{ownExtensionId:own}),true);
  assert.equal(policy.matches(page,page),false);
  assert.equal(policy.matches(page,page,{ownExtensionId:other}),false);
  assert.equal(policy.matches(`chrome-extension://${other}/*`,page,{ownExtensionId:own}),false);
  assert.equal(policy.matches(`chrome-extension://${own}/*`,`chrome-extension://${other}/ui/options/index.html`,{ownExtensionId:own}),false);
  assert.equal(policy.pattern(`chrome-extension://${own}/*`),null,'Query matching never creates host permissions');
  assert.equal(policy.hasHost({permissions:{hosts:[`chrome-extension://${own}/*`]}},page),false);
});

test('permission pattern containment covers complete schemes and wildcard hosts, not representative URLs', () => {
  const covers = policy.patternContains;
  assert.equal(covers('*://*.example.test/*', 'https://deep.sub.example.test/anything'), true);
  assert.equal(covers('https://*.example.test/*', '*://example.test/*'), false);
  assert.equal(covers('https://one.example.test/*', 'https://*.example.test/*'), false);
  assert.equal(covers('https://*.example.test/*', 'https://notexample.test/*'), false);
  assert.equal(covers('https://*.example.test/*', 'https://*/*'), false);
  assert.equal(covers('https://[::1]/*', 'https://[::1]/page'), true);
  assert.equal(covers('<all_urls>', '<all_urls>'), true);
  assert.equal(covers('<all_urls>', 'file:///*'), false);
  assert.equal(covers('<all_urls>', 'file:///*', {allowFileAccess: true}), true);
});

test('scriptable path containment checks the whole wildcard language and retains literal punctuation', () => {
  for (const [grant, request, expected] of [
    ['/docs/*', '/docs/topic*', true], ['/docs/topic', '/docs/topic*', false],
    ['/a*b*c', '/ab*c', true], ['/a*bc', '/ab*c', false],
    ['/foo/*/bar', '/foo/*bar', false], ['/a+b/*', '/a+b/c*', true],
    ['/a+b/*', '/ab/*', false], ['/*/end', '/start/*/end', true],
  ]) assert.equal(policy.globContains(grant, request), expected, `${grant} contains ${request}`);
  assert.equal(policy.patternContains('https://example.test/docs/*', 'https://example.test/private/*'), false);
  assert.equal(policy.patternContains('https://example.test/docs/*', 'https://example.test/private/*', {ignorePath: true}), true);
  for (const [grant, candidate, expected] of [
    ['/a*', '/a*', true], ['/a*b', '/a**b', true], ['/a*b', '/a*bc', false],
    ['/a+b', '/a*b', false], ['/a+b/*', '/a+b/[x]?q=1', true],
    ['/a[bc]/*', '/ab/x', false], ['/a?.*', '/a?.[x]', true],
  ]) assert.equal(policy.glob(grant, candidate), expected, `${grant} matches literal ${candidate}`);
  assert.equal(policy.matches('https://a.test/a+b/*', 'https://a.test/a+b/*?q=[x]'), true);
  assert.equal(policy.matches('https://a.test/a+b/end', 'https://a.test/a+b/*'), false);
});

test('permission inventory separates MV2 origins, omits optional grants and preserves content-only boundaries', () => {
  const context = {allowFileAccess: false, permissions: {
    required: ['storage', 'tabs', 'https://*.example.test/ignored', 'file:///*'], hosts: ['https://host.test/*'],
    optional: ['contextMenus', 'https://optional.test/*'], optionalHosts: ['https://another.test/*'],
    contentScripts: [{matches: ['https://content.test/docs/*'], excludeMatches: ['https://content.test/docs/private/*']}],
  }};
  assert.deepEqual(policy.grantedPermissions(context), {permissions: ['storage', 'tabs'], origins: ['https://*.example.test/*', 'https://host.test/*', 'https://content.test/docs/*']});
  const contains = query => policy.containsPermissions(context, query);
  assert.equal(contains({permissions: ['storage', 'tabs'], origins: ['https://deep.example.test/*']}), true);
  assert.equal(contains({permissions: ['storage', 'contextMenus']}), false);
  assert.equal(contains({origins: ['https://optional.test/*']}), false);
  assert.equal(contains({origins: ['https://content.test/docs/chapter*']}), true);
  assert.equal(contains({origins: ['https://content.test/*']}), false);
  assert.equal(contains({origins: ['file:///*']}), false);
  assert.equal(policy.hasHost(context, 'https://content.test/docs/page'), false, 'A query never promotes content script matches into privileged host grants');
  assert.equal(contains({}), true);
  context.allowFileAccess = true;
  assert.equal(contains({origins: ['file:///any/path']}), true);
  assert.throws(() => contains({origins: ['https://user:pass@example.test/*']}), {code: 'INVALID_ARGUMENT'});
  assert.throws(() => contains({origins: ['https://example.test:443/*']}), {code: 'INVALID_ARGUMENT'});
  assert.throws(() => contains({origins: 'https://example.test/*'}), {code: 'INVALID_ARGUMENT'});
  assert.throws(() => contains({permissions: ['<all_urls>']}), {code: 'INVALID_ARGUMENT'});
});

test('declared ungranted explicit hosts cannot be reported granted through overlapping content matches', () => {
  for (const field of ['optional', 'optionalHosts']) {
    const context = {allowFileAccess: false, permissions: {required: ['storage'], [field]: ['https://shared.test/*'],
      contentScripts: [{matches: ['https://shared.test/docs/*']}]} };
    assert.equal(policy.containsPermissions(context, {origins: ['https://shared.test/docs/*']}), false);
    context.permissions.required.push('https://shared.test/*');
    assert.equal(policy.containsPermissions(context, {origins: ['https://shared.test/docs/*']}), true, 'Required explicit coverage takes precedence over an overlapping optional declaration');
  }
});

test('shared glob, URL matching and permission near misses do not backtrack or cap valid patterns', () => {
  // Ordinary Node child only: a regression to repeated `.*` backtracking must
  // fail this contract rather than hang the whole portable/native CI process.
  const source = `const assert=require('node:assert/strict'),policy=require(${JSON.stringify(require.resolve('../browser/extension-policy.cjs'))});
    for(const count of [8,12,16,64]){
      const glob='/'+'a*'.repeat(count)+'b', pattern='https://a.test'+glob;
      const context={allowFileAccess:false,permissions:{required:[],contentScripts:[{matches:[pattern]}]}};
      for(const [ending,expected] of [['c',false],['b',true]]){
        const candidate='/'+'a'.repeat(count*5)+ending;
        assert.equal(policy.glob(glob,candidate),expected);
        assert.equal(policy.matches(pattern,'https://a.test'+candidate),expected);
        assert.equal(policy.containsPermissions(context,{origins:['https://a.test'+candidate]}),expected);
      }
    }`;
  const child = spawnSync(process.execPath, ['-e', source], {encoding: 'utf8', timeout: 3000});
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
});
