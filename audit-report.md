<USER_REQUEST>
run /code-remediation-ultra on

# JezSy Admin Notification Audit

Audit date: 17 September 2026  
Scope: `admin-dashboard`, deployed Supabase project `wufcmtndotfvxvvxkamv`, database functions/triggers, and deployed payment Edge Functions. No code or database changes were made.

## Executive conclusion

The notification system works as a small shared activity feed, but not as a reliable multi-user operational inbox.

The most important findings are:

1. Every active `staff`, `admin`, and `owner` shares the same notification rows and the same `is_read` flag. One person reading or deleting an alert changes it for everyone.
2. Operational users have direct insert, update, and delete permission over notification content. Notifications are therefore not server-controlled.
3. `admin_notifications` is not in the realtime publication. The bell subscribes to it, but new rows do not arrive in realtime.
4. Notifications contain no recipient, actor, source, entity ID, route, or structured payload. Most cannot open the relevant record.
5. Several important events do not produce feed notifications. Separate sidebar badges and browser alerts hide some of those gaps.
6. Staff is not accidentally blocked by `is_admin_or_owner()`: the table policy correctly uses `is_staff_or_admin()`. The main problem is excessive write authority, not missing staff visibility.

---

# A. Current architecture map

```text
Reservations/messages/payment functions/Edge Functions
                         |
                         v
             public.admin_notifications
       shared rows: title, message, type, is_read
                         |
             initial SELECT + ineffective
             Postgres Changes subscription
                         |
                         v
             Top navigation bell/dropdown
             shared mark-read and deletion

Parallel notification paths:
reservations/messages/inventory --> realtime subscriptions --> browser alerts/sounds
reservations/messages/inventory --> sidebar-derived badges
public.notifications -----------> customer/mobile push notifications
```

These are three separate systems:

- Admin feed: `public.admin_notifications`
- Operational realtime indicators: direct subscriptions to reservations, messages, and inventory
- Customer notification system: `public.notifications`, customer push dispatch, and `SendNotificationModal`

They do not share a canonical event contract.

## Database structure

`public.admin_notifications` has exactly six columns:

| Column | Type | Null | Default |
|---|---|---:|---|
| `id` | `uuid` | No | `gen_random_uuid()` |
| `title` | `text` | No | None |
| `message` | `text` | No | None |
| `type` | `text` | Yes | None |
| `is_read` | `boolean` | Yes | `false` |
| `created_at` | `timestamptz` | Yes | `now()` |

Absent fields include:

- Recipient user or role
- Actor ID, name, or role
- Source system/event
- Entity type or entity ID
- Route/deep link
- JSON payload
- Priority/severity
- Idempotency/event key
- `read_at`, `read_by`, `updated_at`, or dismissal data

The generated dashboard type accurately reflects this limited shape in [database.types.ts](C:/Users/carlv/admin-dashboard/src/types/database.types.ts:113), but `TopNav` does not use it and stores notifications as `any[]`.

## RLS and grants

RLS is enabled but not forced.

There is one permissive policy:

- Name: `Admins can manage admin notifications`
- Command: `ALL`
- Role: `authenticated`
- `USING`: `is_staff_or_admin()`
- Explicit `WITH CHECK`: none

`is_staff_or_admin()` admits active, nondeleted, unblocked:

- `staff`
- `admin`
- `owner`

Staff and administrators additionally require an approved device; owners bypass that device check.

Table grants for both `anon` and `authenticated` include:

- `SELECT`
- `INSERT`
- `UPDATE`
- `DELETE`
- `TRUNCATE`
- `REFERENCES`
- `TRIGGER`

RLS prevents ordinary customers and anonymous users from selecting or changing rows because the helper returns false. However, the grants are substantially broader than necessary.

## Indexes and realtime

The only index is the primary key on `id`.

Missing useful indexes include:

- `(is_read, created_at DESC)`
- `(created_at DESC)`
- Recipient/read-state indexes, once per-user state exists
- Unique source-event/idempotency index

Publication inspection showed:

- `reservations`: realtime enabled
- `messages`: realtime enabled
- `inventory`: realtime enabled
- `admin_notifications`: **not in a publication**

The bell subscription in [TopNav.tsx](C:/Users/carlv/admin-dashboard/src/components/TopNav.tsx:145) calls the generic subscriber in [supabaseService.js](C:/Users/carlv/admin-dashboard/src/lib/supabaseService.js:342), but the subscription cannot receive Postgres Changes for this table.

## Current data

At audit time, the table contained:

| Type | Read | Rows | Latest |
|---|---:|---:|---|
| `Message` | Yes | 13 | 12 Sep 2026 |
| `Reservation` | Yes | 11 | 13 Sep 2026 |

There were no current `Payment` or `ReturnRequest` rows and no unread rows.

## Producers

| Producer | Source event | Audience | Output | Actionability and duplicates |
|---|---|---|---|---|
| `notify_admin_on_reservation()` | Reservation inserted | Shared staff/admin/owner feed | `Reservation` / “New Reservation” / customer and product in prose | Clicking opens `/reservations`, but not the reservation. Normally one row per insert. Also creates a browser alert through a separate reservation subscription. |
| `notify_admin_on_message()` | Customer support message inserted; excludes auto responses | Shared staff/admin/owner feed | `Message` / “New Message” / customer name in prose | Clicking opens `/messages`, but not the conversation. One row per customer message, so a conversation can generate many alerts. Separate browser and sidebar alerts overlap. |
| `submit_reservation_balance_receipt()` through `enqueue_admin_notification()` | Remaining-balance receipt submitted | Shared staff/admin/owner feed | `Payment` / “Remaining balance receipt submitted” / display ID, method and amount in prose | `Payment` has no navigation mapping. Each valid resubmission produces another alert. |
| `request_customer_refund()` | Customer submits return/refund request | Shared staff/admin/owner feed | `ReturnRequest` / “New return/refund request” / reservation display ID in prose | No `ReturnRequest` navigation mapping. The RPC prevents more than one active request, reducing duplicate rows. |
| `settle_payment_webhook()` | Paid gateway event is unexpected and requires refund | Shared staff/admin/owner feed | `Payment` / “Payment requires refund” / reservation display ID in prose | No navigation mapping. Exact provider event retries are deduplicated by `processed_payment_webhook_events`. |
| `payments-create` Edge Function | Checkout session created but could not be linked to payment | Shared staff/admin/owner feed | `Payment` / “Unlinked PayMongo session” / session and payment IDs in prose | Operationally actionable, but clicking does nothing. A repeated checkout attempt may produce another row. See [payments-create/index.ts](C:/Users/carlv/jezsy-mobile-app/supabase/functions/payments-create/index.ts:387). |
| `payments-webhook` Edge Function | PayMongo event cannot be mapped to a payment | Shared staff/admin/owner feed | `Payment` / “Unknown PayMongo session” / webhook and session IDs in prose | Operationally actionable, but clicking does nothing. Provider retry can repeat this alert because there is no mapped payment on which to record normal idempotency. See [payments-webhook/index.ts](C:/Users/carlv/jezsy-mobile-app/supabase/functions/payments-webhook/index.ts:87). |
| `enqueue_admin_notification()` | Generic internal ingestion helper | Shared staff/admin/owner feed | Caller-supplied title, message and type | No event key or duplicate protection. Properly restricted to `service_role`. |

The canonical helper is defined in [20260914030000_remaining_balance_receipt_architecture.sql](C:/Users/carlv/jezsy-mobile-app/supabase/migrations/20260914030000_remaining_balance_receipt_architecture.sql:142).

All `SECURITY DEFINER` functions involved in producing these alerts have pinned `search_path` values—either empty or `public, pg_temp`. That portion is correctly hardened.

---

# B. Existing event matrix

| Event | Classification | Current behavior |
|---|---|---|
| New reservation | **Implemented / overlapping** | Feed row, browser notification and sound, dashboard refresh, and reservation sidebar count can all react to the same event. |
| Initial payment receipt uploaded | **Missing from feed / partial elsewhere** | `submit_reservation_receipt()` updates the reservation but creates no admin notification. Reservation realtime and the sidebar may reveal the new status. |
| Remaining-balance receipt uploaded | **Implemented** | Creates a `Payment` feed row, but it has no working navigation. |
| Receipt resubmitted after rejection | **Partial** | Initial-payment retry still has no feed alert. Remaining-balance retry creates another alert. |
| Payment rejected | **Missing from admin feed** | The customer receives a structured notification. The rejecting staff member already initiated the action, so a second alert to that actor may be unnecessary. |
| Refund required | **Implemented / partial** | Unexpected gateway settlement creates a `Payment` alert. Refund liability is also shown independently in dashboard and reservation queues. Feed click does nothing. |
| Customer return/refund request | **Implemented** | `ReturnRequest` row is produced, but cannot open the request queue or record. |
| Normal payment completed | **Missing** | Reservation/payment state changes and the customer is notified, but the admin feed receives nothing. |
| Reservation cancelled by customer | **Missing** | Cancellation RPC changes reservation state without an admin feed row. |
| Reservation cancelled by staff/admin | **Not necessary as an alert to the actor** | Recorded in operational logs; no feed notification. |
| Low/out-of-stock inventory | **Missing from feed / implemented as sidebar state** | Sidebar derives a warning from inventory rows. No persistent event, transition alert, or daily digest exists. |
| New support customer message | **Implemented / overlapping** | Feed row, sidebar unread badge, sound, and desktop alert. |
| Staff or auto-response message | **Feed correctly excluded; browser alert flawed** | Database trigger filters these correctly. The raw message realtime hook filters only by current user ID, so another staff member’s reply or an auto response can still produce a misleading “customer” desktop alert. |
| Direct P2P activity | **Correctly excluded** | No `direct_messages` producer targets the admin feed. |
| New customer review | **Missing** | No admin feed trigger or producer. |
| Review requiring reply | **Missing** | Review moderation is available, but no persistent alert or reply-required rule exists. |
| Suspicious/fraud payment | **Partial** | Unknown/unlinked PayMongo events alert. A suspicious manual receipt is handled during staff review, not detected as a new alert-producing event. |
| Failed payment | **Missing** | Webhook records `failed` but produces no admin notification. |
| Expired payment | **Missing** | Expiry function changes payment/reservation state without a feed alert. |
| System/security alert | **Missing** | No producers for device approval, account deletion requests, repeated payment failures, permission changes, or other security/operational conditions. |

---

# C. Security and correctness findings

### [NOTIF-SEC-001] Operational users can forge or alter notifications — High

Because the authenticated policy permits `ALL`, any qualifying staff, admin, or owner session can directly:

- Insert fabricated alerts
- Change type, title, message, timestamp, and read state
- Delete alerts
- Clear alerts for every other operator

This fails the requirement that inserts and payloads be server-controlled.

Recommended control: allow clients to select notifications and modify only their own read/dismissal state through a narrow RPC or separate receipt table. Revoke direct content `INSERT`, `UPDATE`, and `DELETE`.

### [NOTIF-STATE-001] Read state is global, not per user — High

There is no recipient or read-receipt relationship. The same row is shared by every operator.

Consequences:

- One staff member clicking an alert marks it read for everyone.
- “Mark all read” changes global rows.
- Dismissing or clearing deletes rows for every user.
- It is impossible to prove that one user cannot mark another user’s notifications read—the model contains no user-specific notification state.

The affected actions are in [TopNav.tsx](C:/Users/carlv/admin-dashboard/src/components/TopNav.tsx:188), [TopNav.tsx](C:/Users/carlv/admin-dashboard/src/components/TopNav.tsx:239), and [TopNav.tsx](C:/Users/carlv/admin-dashboard/src/components/TopNav.tsx:264).

### [NOTIF-RT-001] Bell and unread count are not realtime — High

`admin_notifications` is not in the realtime publication, so the subscription never receives database changes. The initial fetch works, but new rows require a remount or manual reload.

The “Live” status displayed beside the bell does not prove that the notification feed itself is live.

### [NOTIF-NAV-001] Most alerts cannot open the affected record — Medium

The row has no entity ID or route.

Current heuristics in [TopNav.tsx](C:/Users/carlv/admin-dashboard/src/components/TopNav.tsx:206):

| Type | Destination |
|---|---|
| `Message` | `/messages` |
| `Reservation` | `/reservations` |
| `Customer` | `/customers` |
| `Product`, inventory/stock text | `/inventory` |
| `Payment` | None |
| `ReturnRequest` | None |
| Unknown | None |

Even mapped types open only the page, not the reservation, conversation, product, or customer.

### [NOTIF-COUNT-001] Unread count can undercount — Medium

The client:

1. Fetches the entire table without server ordering.
2. Sorts locally.
3. Keeps the newest 20.
4. Counts unread only within those 20.

Unread rows older than the newest 20 are invisible to both the badge and “Mark all read.” There is also no supporting unread/time index.

### [NOTIF-DRIFT-001] Optimistic state is not rolled back — Medium

Click, mark-all, dismiss, and clear-all update local state before the database operation. Failures are logged but the UI is not restored, leaving the bell inconsistent until reload.

### [NOTIF-ALERT-001] Message desktop alert misclassifies non-customer messages — Medium

[useRealtimeSync.js](C:/Users/carlv/admin-dashboard/src/hooks/useRealtimeSync.js:97) checks only whether `sender_id !== user.uid`. It does not require `sender_role === 'customer'` or exclude auto responses.

The database feed trigger is more accurate than the browser alert path.

### [NOTIF-SETTINGS-001] Notification settings are nonfunctional — Medium

The settings page displays toggles for:

- New reservations
- Low-stock daily digests
- Direct messages

They are uncontrolled `defaultChecked` inputs with no saved state and are not consulted by producers or subscriptions. The claimed low-stock daily digest does not exist. See [Settings.jsx](C:/Users/carlv/admin-dashboard/src/pages/admin/Settings.jsx:835).

### [NOTIF-DEAD-001] Legacy and overlapping notification code remains — Low

The notification exports in [communicationService.js](C:/Users/carlv/admin-dashboard/src/services/communicationService.js:189) target the customer `notifications` table and have no callers.

They should not be mistaken for the admin feed. The customer push modal in [SendNotificationModal.jsx](C:/Users/carlv/admin-dashboard/src/components/SendNotificationModal.jsx:21) is active, but belongs to the separate customer push system.

`TopNav` also retains Firestore-era `docId` and Android timestamp compatibility comments despite the current Supabase schema.

## Security controls that passed

- Customers and anonymous users cannot read `admin_notifications` under the current RLS helper.
- Staff is not blocked by an `is_admin_or_owner()` guard; the policy includes staff.
- Inactive, deleted, or blocked employees are denied.
- Staff/admin device approval is enforced.
- Existing notification-producing `SECURITY DEFINER` functions use pinned `search_path`.
- The generic enqueue function is not executable by customer or ordinary authenticated roles.
- Direct P2P activity has no admin notification producer.

---

# D. Missing-event matrix

Recommended relevance is included to avoid turning the feed into an indiscriminate activity log.

| Missing event | Recommended priority | Intended audience | Suggested destination |
|---|---:|---|---|
| Initial receipt submitted or resubmitted | Critical | Reservation operators | `/reservations?reservation=<id>&action=review-payment` |
| Payment failed after actionable retry threshold | High | Admin/owner or payment operators | Reservation payment detail |
| Payment expired while reservation remains held | High | Reservation operators | Reservation detail |
| Customer cancellation | High | Reservation operators | Cancelled reservation detail |
| Normal online payment completed | Medium | Reservation operators | Reservation detail; informational or auto-expiring |
| Low stock threshold crossed | High | Inventory operators | `/inventory?product=<id>` |
| Out-of-stock transition | High | Inventory operators | Product/inventory record |
| New review requiring moderation/reply | Medium | Assigned support/marketing roles | `/reviews?review=<id>` |
| Account deletion request | High | Admin/owner | `/account-deletion?request=<id>` |
| New device approval request | High | Admin/owner | `/devices?device=<id>` |
| Repeated unknown/unlinked payment events | Critical | Admin/owner | Payment incident view |
| Material role/security setting change | High | Owner | Activity/security record |

Events that should generally remain excluded:

- Customer-to-customer/P2P social activity
- Routine staff actions already performed by the receiving actor
- Every ordinary reservation status update
- Every individual inventory decrement before a threshold is crossed

---

# E. Recommended remediation plan

1. **Replace global read state with per-user state.**  
   Keep immutable notification events and add a separate read/dismissal table keyed by `(notification_id, user_id)`. Alternatively, fan out one recipient row per user. The separate-receipt model avoids duplicating event content.

2. **Lock down write authority.**  
   Revoke client content insertion, mutation, deletion, and unnecessary grants. Give operational roles read access; expose narrowly scoped mark-read/dismiss RPCs that derive the user from `auth.uid()`.

3. **Add a structured event contract.**  
   Add fields such as `event_key`, `type`, `source`, `actor_id`, `entity_type`, `entity_id`, `data jsonb`, `priority`, and `created_at`. Enforce uniqueness on `event_key` for retry-safe producers.

4. **Repair realtime and badge queries.**  
   Publish the relevant table, fetch the newest rows ordered server-side, and obtain the unread total with an exact filtered count. Add appropriate indexes.

5. **Make every actionable type navigable.**  
   Route using structured entity fields rather than searching title/body text. Payment and return/refund alerts should open the exact reservation or request.

6. **Fill only operationally relevant producer gaps.**  
   Prioritize initial receipt submission, cancellation, failed/expired payments, stock threshold transitions, review moderation, and security queues. Keep normal informational events lower priority or auto-expiring.

7. **Consolidate browser alerts and sidebar badges.**  
   Derive them from the canonical event stream where practical. At minimum, make the browser message filter match the database producer’s customer/auto-response rules.

8. **Remove or wire the settings UI.**  
   Persist preferences and apply them to delivery, or remove the misleading toggles until the behavior exists.

9. **Add contract tests.**  
   Cover role visibility, customer denial, per-user read isolation, producer idempotency, realtime delivery, unread counts over 20 rows, and navigation for every registered type.

## Verification performed

- Read-only inspection of the live table, policies, grants, indexes, functions, triggers, publications, and current row aggregates
- Inspection of deployed payment Edge Functions
- Static trace through dashboard layout, bell, generic subscription service, sidebar badges, settings, customer push modal, and generated database types
- `npm run lint`: passed with zero errors and 95 existing warnings
- No notification-specific automated tests were found
- No source files or database objects were modified during this audit


and

The mobile app is not yet HCI-ready for failure-path and assistive-technology acceptance testing. The audit found 7 verified interaction defects/contract violations and one test-architecture gap. No files were changed.

## Actual Defects

### [ACTUAL DEFECT] [HCI-001] Schedule failures masquerade as unavailable appointments — High

- Claim: Network/database failures during time-slot loading are presented as “No times left on this date,” with no retry.
- Evidence: The catch path creates an unavailable `"error"` slot at [TimeSlotPicker.tsx:221](C:/Users/carlv/jezsy-mobile-app/src/components/TimeSlotPicker.tsx:221). `availableCount` then becomes zero and disables the picker at [TimeSlotPicker.tsx:269](C:/Users/carlv/jezsy-mobile-app/src/components/TimeSlotPicker.tsx:269), displaying the misleading copy at [TimeSlotPicker.tsx:294](C:/Users/carlv/jezsy-mobile-app/src/components/TimeSlotPicker.tsx:294).
- Reproduction: Reject any `store_hours`, `store_closures`, or `get_slot_booked_counts` request.
- Impact: Customers cannot distinguish a fully booked day from a system failure and cannot recover without leaving the flow.
- Fix: Preserve an explicit error state with “Could not load schedule” and a Retry action.
- Verify: Add a mocked failure test covering copy, enabled retry, and successful recovery.

### [ACTUAL DEFECT] [HCI-002] Body-scan runtime camera failures have no recovery UI — High

- Claim: A camera error after scan startup is only logged.
- Evidence: Initial permission and hardware failures have dedicated UI at [body-scan.tsx:658](C:/Users/carlv/jezsy-mobile-app/app/profile/body-scan.tsx:658), but the active camera’s `onError` only calls `console.warn` at [body-scan.tsx:749](C:/Users/carlv/jezsy-mobile-app/app/profile/body-scan.tsx:749).
- Reproduction: Interrupt or revoke the camera during an active scan, or trigger a native camera runtime error.
- Impact: The scan can appear frozen with no explanation, retry, settings link, or manual-entry escape.
- Fix: Store the runtime error and render `HardwarePermissionState` with Retry and Enter Manually actions.
- Verify: Native dev-client test covering background/foreground interruption and simulated camera failure.

### [ACTUAL DEFECT] [HCI-003] Inbox and chat failures become false empty/blank states — High

- Claim: Message, notification, and conversation-fetch failures do not retain distinct error states.
- Evidence:
  - Notification failure only shows a transient, incorrectly worded “messages” toast at [messages.tsx:71](<C:/Users/carlv/jezsy-mobile-app/app/(tabs)/messages.tsx:71>), then renders “No notifications yet” at [messages.tsx:480](<C:/Users/carlv/jezsy-mobile-app/app/(tabs)/messages.tsx:480>).
  - Conversation errors are swallowed by the provider at [MessagesContext.tsx:53](C:/Users/carlv/jezsy-mobile-app/src/context/MessagesContext.tsx:53), after which an empty-conversation state is rendered.
  - Chat-history failures are only logged at [conversationId].tsx:207](C:/Users/carlv/jezsy-mobile-app/app/messages/[conversationId].tsx:207); there is no initial loading or retry state.
- Impact: Users may believe messages or notifications were deleted or never existed.
- Fix: Expose error state from `MessagesContext` and apply the same loading/error/empty/content contract already used by Wishlist.
- Verify: Screen tests for failed first load, failed refresh with stale content, and successful retry.

### [ACTUAL DEFECT] [HCI-004] System motion preference is only partially honored — Medium

- Claim: Persistent and automatic animations continue when Reduce Motion is enabled.
- Evidence: The home carousel advances every four seconds at [index.tsx:279](<C:/Users/carlv/jezsy-mobile-app/app/(tabs)/index.tsx:279>), and skeletons pulse indefinitely at [Skeleton.tsx:20](C:/Users/carlv/jezsy-mobile-app/src/components/Skeleton.tsx:20). The existing [FadeInView.tsx:32](C:/Users/carlv/jezsy-mobile-app/src/components/FadeInView.tsx:32) demonstrates that the project already knows how to observe this preference.
- Impact: Distracting or uncomfortable motion persists for users with vestibular or cognitive accessibility needs.
- Fix: Centralize the preference in a hook; stop carousel auto-advance and render static skeletons/typing indicators when enabled.
- Verify: Toggle Android Remove Animations/iOS Reduce Motion and inspect Home, loading lists, and chat.

## Contract Violations

### [CONTRACT VIOLATION] [HCI-005] Most text inputs are not programmatically labeled — High

- Claim: Visual sibling labels are not connected to their `TextInput` controls.
- Evidence: AST inventory found 57 of 70 `TextInput` instances without `accessibilityLabel`. Representative examples include authentication at [auth.tsx:493](<C:/Users/carlv/jezsy-mobile-app/app/(auth)/auth.tsx:493>), profile setup at [profile-setup.tsx:317](<C:/Users/carlv/jezsy-mobile-app/app/(auth)/profile-setup.tsx:317>), and measurements at [measurements.tsx:595](C:/Users/carlv/jezsy-mobile-app/app/profile/measurements.tsx:595).
- Impact: TalkBack/VoiceOver may announce only a value or placeholder, making populated fields difficult to identify.
- Fix: Add stable labels matching visible copy and appropriate hints, content types, and invalid states.
- Verify: Traverse every form using TalkBack and VoiceOver after fields contain values.

### [CONTRACT VIOLATION] [HCI-006] Choice controls expose visual state but not semantic state — Medium

- Claim: Several segmented controls and chips do not announce their role or selection.
- Evidence: Examples include Inbox tabs at [messages.tsx:377](<C:/Users/carlv/jezsy-mobile-app/app/(tabs)/messages.tsx:377>), gender chips at [profile-setup.tsx:407](<C:/Users/carlv/jezsy-mobile-app/app/(auth)/profile-setup.tsx:407>), outfit view selection at [outfit-builder.tsx:683](C:/Users/carlv/jezsy-mobile-app/app/outfit-builder.tsx:683), and color-role controls at [ColorPickerModal.tsx:99](C:/Users/carlv/jezsy-mobile-app/src/components/ColorPickerModal.tsx:99).
- Impact: Screen-reader users cannot reliably determine which choice is active.
- Fix: Use radio/tab/checkbox semantics and `accessibilityState.selected` or `checked`.
- Verify: Confirm each choice announces its name, role, and state before and after activation.

### [CONTRACT VIOLATION] [HCI-007] Raw backend errors are customer-facing — Medium

- Claim: Numerous handlers prefer `err.message`, bypassing written customer copy.
- Evidence: This directly contradicts [microcopy-standard.md:12](C:/Users/carlv/jezsy-mobile-app/docs/microcopy-standard.md:12). Examples include OAuth at [welcome.tsx:138](<C:/Users/carlv/jezsy-mobile-app/app/(auth)/welcome.tsx:138>), profile setup at [profile-setup.tsx:306](<C:/Users/carlv/jezsy-mobile-app/app/(auth)/profile-setup.tsx:306>), and reservation payment at [reservations/[id].tsx:350](C:/Users/carlv/jezsy-mobile-app/app/reservations/[id].tsx:350).
- Impact: Customers can receive technical Supabase, RPC, storage, or authentication strings instead of actionable guidance.
- Fix: Log the original error privately and map known domain codes to stable, task-oriented messages.
- Verify: Inject representative Auth, PostgREST, Functions, and storage failures and snapshot displayed copy.

## Architecture Concern

### [ARCHITECTURE CONCERN] [HCI-008] Resilience tests validate a fixture, not real screens — Medium

- Claim: The advertised four-state screen contract is tested through a local harness component.
- Evidence: `TestResilientScreen` is declared inside [ScreenStateResilience.test.tsx:52](C:/Users/carlv/jezsy-mobile-app/src/components/__tests__/ScreenStateResilience.test.tsx:52). It does not render Inbox, chat, scheduling, or another production screen.
- Impact: The test suite passes while HCI-001 and HCI-003 remain present.
- Fix: Add production-component integration tests for failure, retry, stale-data, empty, and success states.
- Verify: Ensure reverting the proposed production fixes makes the corresponding tests fail.

## Cleanly inspected areas

The shared primary button, product cards, wishlist, core error/empty components, destructive confirmation modal, time-slot radio rows, toast live announcements, theme contrast tokens, offline catalog fallback, and message-send retry behavior have sound interaction patterns.

No evidence-backed Security/Data Integrity Risk or Performance Risk was established within this HCI-focused audit.

## Verification

- `npx tsc --noEmit`: passed.
- `npm test -- --runInBand`: 64 suites and 648 tests passed; several React 19 renderer/`act` warnings remain.
- `npm run lint`: failed with one unresolved `@xenova/transformers` import and 11 warnings. `npm ls @xenova/transformers --depth=0` reports it absent despite being declared.
- No physical-device, TalkBack, VoiceOver, large-font, rotation, or native camera/pose/worklet verification was possible.

The workspace changed externally during the audit from `main` to commit `522f8c5` on `fix/reservation-countdown-and-nested-button`, with modified AR documentation and Filament code. Those files were not changed by this audit, and the findings above are in unaffected interaction paths.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-09-18T01:15:30+08:00.

The user has mentioned some items in the form @[ITEM]. Here is extra information about the items that were mentioned by the user, in the order that they appear:

/code-remediation-ultra is a [Slash Command]:
<SKILL>The user requested you read and use the "code-remediation-ultra" skill. The path to the skill file is:
c:\Users\carlv\admin-dashboard\.agents\skills\code-remediation-ultra\SKILL.md</SKILL>
</ADDITIONAL_METADATA>
<USER_SETTINGS_CHANGE>
The user changed setting `Model Selection` from Gemini 3.8 Flash (Medium) to Gemini 3.1 Pro (High). No need to comment on this change if the user doesn't ask about it. If reporting what model you are, please use a human readable name instead of the exact string.
</USER_SETTINGS_CHANGE>
