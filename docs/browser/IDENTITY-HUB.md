# Identity coverage hub: private metadata planner

Requested goal: track a preferred username across explicitly selected sites,
show coverage gaps, check supported availability routes and help create accounts
where permitted and specifically authorized. This is not permission to register
bulk accounts, bypass CAPTCHA, disclose credentials, accept unspecified terms or
reserve names contrary to provider rules.

## Checkpoint

`identity-hub-plan.cjs` is a pure, no-I/O metadata reconciler. It produces honest
per-site states for supplied observations, stale evidence, self-reported accounts,
missing provider support and policy restrictions. It does not perform a lookup,
create a request, open a signup page, create an account or verify ownership.
There is no UI, persistence or provider transport in this checkpoint.

The current canonical `accounts.cjs` already provides identity-linked account
metadata, safe origin routing and recoverable storage. Reuse that existing
service when integrating the hub; do not fork a second account database or
interpret its `created` boolean as verified ownership. Public provider capability
contracts belong in shared Modding-Knowledge; actual desired handles, account
coverage, grants and secrets remain private. This small source-backed policy
registry is a candidate to reconcile into that shared contract, not a second
credential store. No shared registry was changed here.

Input and output are private even though no credential fields are supported:
handles and site choices may identify the user. Unknown fields are refused.
Do not log or publish either. The planner accepts at most 100 sites/observations/
self-reports, 128-character handles and 64-character site IDs, refuses duplicate
or mismatched evidence and requires a supplied current timestamp. A 15-minute
freshness window is only a UI observation window, not an availability guarantee.
Runtime integration must bound raw input before parsing and render strings as
text, not HTML. Provider-specific handle rules remain unimplemented.

## Evidence review: 2026-11-16

| Provider | Official route and limits | Reservation/account creation |
| --- | --- | --- |
| GitHub | Public user lookup documents profile existence. Missing/error responses do not prove a name is available, and a found profile does not prove ownership. No lookup was executed. | Username-only reservation is prohibited. Account registration must be performed by a human, subject to account-count and other requirements. |
| GitLab.com | Users API documents exact username filtering (case-insensitive). No transport or response adapter is implemented. Results cannot establish creation eligibility. | Policy/eligibility review required; no creation or reservation support is claimed. Administrator user-creation APIs are not a consumer signup shortcut. |
| Mastodon family | Official accounts API documents registration, but the reviewed v1 route is deprecated and returns an app-linked token. No adapter is registered because instance/version-specific current route, terms, account approval and permission review are required. | Unknown until the chosen instance is reviewed. Email confirmation and tokens must not be handled by this metadata component. |
| Other sites | Explicitly `unsupported` / `add-reviewed-provider`. | Unknown, never silently treated as allowed. |

Sources:
- [GitHub user API](https://docs.github.com/en/rest/users/users#get-a-user)
- [GitHub username policy](https://docs.github.com/en/site-policy/other-site-policies/github-username-policy)
- [GitHub account terms](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#b-account-terms)
- [GitLab users API](https://docs.gitlab.com/api/users/)
- [Mastodon accounts API](https://docs.joinmastodon.org/methods/accounts/)

These are capability and policy findings, not live username checks. GitHub's
restriction is represented as `reservation: prohibited`, not a retryable failure.
An unknown policy remains a review requirement rather than implicit approval.

## Permissioned implementation still required

1. User chooses exact sites, intended handle and browser profile; display which
   providers can actually check availability and what data will be sent.
2. Perform only supported, permitted checks with per-site throttling, retry-after
   handling and retained errors. Never infer availability from a missing profile.
3. Reconcile existing accounts first. Authenticated ownership needs a verified
   provider response bound to the correct account; self-report stays labeled.
4. Account creation is a separate per-site action with concrete recipient/data,
   terms, credential handling and optional recurring costs disclosed. Preserve
   provider/OS approval, CAPTCHA and secure sign-in boundaries. No silent consent
   to marketing, persistent access grants or paid options.
5. Use supported secure sign-in/password-manager flows and keep credentials out
   of this registry. Never use email tools under the current no-email direction.
6. Verify successful account creation and ownership with the provider before
   marking coverage complete. Invitations, pending moderation, verification and
   failed creation remain distinct, recoverable states.

## Verification and integration status

Ten synthetic tests pass on Node 24.22.1, covering missing provider support,
prohibited reservation, unknown availability after all lookup outcomes,
unverified self-report, stale/future timestamps, scope/size/credential rejection,
input preservation and prototype-name refusal. Syntax passes. No live lookup,
account registration or native UI acceptance was performed.

Active browser PR #5 was rechecked at `4236a9d1c06f176a2c7261abcd334b545e66181d`;
its account service and concurrent extension work are untouched. The earlier
bookmark planner is also untouched. These are partial product components, not
completion of the identity hub or any G001–G012 gate.

`publicPresence` is a **supplied observation**, not a result of a live transport
verified here. The caller-supplied timestamp is not an independently trusted
clock; an eventual host adapter must supply its trusted clock and provenance.
Optional evidence arrays default only when omitted, not when malformed.
