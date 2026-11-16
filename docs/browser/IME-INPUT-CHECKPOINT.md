# Input-method composition checkpoint

The browser chrome now leaves Enter/Escape candidate confirmation and cancellation
with the input method in the address, Find and identity-name fields. Previously
those events could create an incomplete identity, hide the identity-name field,
advance/clear a Find query or discard the address draft. Address form submission
is ignored while composition is active. Normal commands resume after composition
ends; focus loss clears abandoned composition state without deleting the draft.

The implementation checks the event's composition flag, the legacy IME key code,
and explicit composition lifecycle. It adds no timers, polling, dependencies or
page-content IPC, and changes no profile/session storage or extension grants.
Find's existing live-input search remains intact; only command keystrokes are
suppressed while composing. This is a usability fix, not new isolation evidence.

Verification on Node 24.22.1: the new regression fails on original renderer at
4236a9d; the changed renderer passes all 357 portable tests (including 21 DOM
renderer cases), with no skips, and source syntax checks. Tests include both event
metadata paths, composition lifecycle, normal post-composition commands and focus
loss. These are synthetic DOM events: native Windows/Linux IME behavior, including
candidate popup event ordering, remains an explicit acceptance gate. No safe
measurable performance improvement was identified on this small key-event path;
no speedup is claimed.
