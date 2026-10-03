# HouseMate web app

Independent Next.js web client for HouseMate, published as [heinzaw-bit/housemate-app](https://github.com/heinzaw-bit/housemate-app). This repository owns its dependencies, assets, tests, and CI. The [whole-project repository](https://github.com/heinzaw-bit/housemate) includes it as the `app/` submodule alongside the independent API. Run the commands below from this repository root; no sibling checkout is required.

## Current slice

Header controls use matching 44px touch targets, outline icons, accessible
labels and theme-aware colors. Notifications and Theme are plain icons; Account
and Search retain soft circular backgrounds. Search sits beside the page
breadcrumb on desktop and beside the brand on phones. Search uses
one focus outline around its input row. The account identity appears inside its
menu. Phone headers keep safe-area side
padding. Up to 900px, a two-column header keeps logo/search on the left and
other controls on the right. Up to 650px, the mascot replaces the full wordmark
to keep every 44px control on one row, including with larger text settings.

Signed-out visitors at `/` see a public landing page with feature highlights,
setup steps, an interactive Home/Money/House tour, FAQ and a privacy overview.
Six sections follow the natural page scroll, with header links to jump directly
to content. Sections fade in as they enter view and remain visible afterward.
Reduced motion, unavailable animation APIs and keyboard focus keep content
readable. All public content is server-rendered and readable without JavaScript.
Previews use explicitly labelled fictional records and make no household reads.
Get started opens `/sign-in`; existing members at that route return to `/`.
Signed-in visitors continue to their dashboard. Invite/household links, pending
invitations and sign-in callbacks retain the existing authentication/access flow.
The landing supports the shared dark-mode toggle and responsive layouts. Its
footer links describe the product and privacy; they are not legal terms or an
approved legal privacy policy. No support address is invented.

- Home puts household-wide Needs attention first: the three earliest unpaid bills, the next open chore, and the next meal check. These attention cards sit in one equal-width, equal-height desktop row with aligned action footers and stack on small screens. Compact cards show personal balance, household unpaid-bill totals, and open shopping and chore counts. Recent activity shows three financial events and can expand to the ten returned by the API. Home has no quick-action button group; add actions live in Money and House. Overdue bills appear first; due soon covers today through seven days ahead in the household timezone. Refresh runs on focus/reconnection and about once a minute; failed refreshes label the last snapshot as stale. Household changes clear the previous data. Events and announcements are not in the Home summary yet.
- Money links support `?household=<id>&view=expenses|bills|balances&record=<id>`, and `&add=1` opens the selected expense or bill form. Record links are checked by the API; transfer details can open older records beyond the first history page.
- Money opens on Balances with a shared personal-balance and household-unpaid-bills summary above Balances, Expenses, and Bills navigation. Confirmed money changes refresh the summary. Expense and bill lists pair with record details on desktop; mobile shows one selected detail at a time with a Back control. Bill and expense history/detail cards can each be collapsed from their arrow header buttons; all start expanded, and selecting a record opens its details automatically.

- Responsive sign-in screen with Google OAuth and email magic link through Supabase Auth.
- Household creation and single-use shareable invite joining, with USD or THB selection and timezone.
- API-backed identity and household creation/listing/selection.
- Global household Search in the header (Ctrl/Command + K) opens a keyboard-accessible dialog with nine record types, literal text/type filters, newest-first cursor pages and exact record links. Queries require at least two characters, remain only in the open dialog’s memory, and never contact AI. Close/scope/query/filter/offline changes discard results; stale responses cannot cross scopes. Drafts block result navigation. Requires the API search contract and runtime to be released before this client.
- Search starts as a compact panel with a focused input, a small All records selector and contextual minimum-length guidance. Results use category icons, short previews, status and subtle dates. On phones, a bottom sheet keeps the input/filter above scrollable results and adjusts to the visible viewport/keyboard. Clear search restores input focus; real phone keyboard/visual acceptance remains separate from automated checks.
- Profile uses a compact identity header and My profile / Household / Preferences sections. Saved name and household summaries open explicit Edit/Save/Cancel forms, with draft-protected navigation and reloads. Household timezone search filters supported options; currency remains subject to the existing owner/activity rules. Members show names/roles, owner role changes require review and confirmation, and invitation history is expandable. Preferences offers appearance, a direct household-scoped notification settings link, and installation help. Preview shares this layout with household reads/writes disabled.
- API-backed shared expense list, detail, and add flow on Money. Active members can choose a payer and selected participants, preview equal/exact/percentage/ratio shares, then confirm. Failed confirmations keep the form and retry key so retrying does not create a duplicate.
- API-backed bill list, detail, and add flow on Money. The form proceeds through Details, Split and adjustments, and Review. Enter provider, billing period, due date, provider payment status, selected base participants, and any explicitly classified personal or shared charges and credits. The API preview shows the shared remainder and final shares before confirmation. The bill-level Unpaid/Paid control records provider payment manually; it does not process money or track each member's repayment.
- API-backed Balances tab on Money. See each member's net balance and source entries, pending Unpaid bills, informational settlement suggestions, and recorded transfer history. Why this balance and Recorded transfers show three recent entries initially; Show more/Show less expands the loaded list, and Load more retrieves older pages while expanded. Selecting another member collapses its source preview. The bottom sidebar profile block is removed; account controls remain in the top bar. Suggested transfers initially shows two current suggestions in API order, with independent Show more/Show less controls. Either transfer participant can preview and record a manual transfer with amount, date, and optional method or note. The balance refreshes after confirmation; an idempotency key makes a failed confirmation safe to retry. HouseMate does not send or verify money.
- Expense and bill details offer **Edit** to the record creator or a household owner/admin. The form reloads the saved split inputs, requires a fresh API preview for a revised draft, and preserves entered values after a failed save. The API rejects stale revisions and expired previews; edit confirmation refreshes the displayed record. Bill payment status stays in its separate detail control.
- Expense and bill details offer **Remove mistaken expense/bill** to the creator or a household owner/admin. The action uses the audited Void flow: enter a reason, review the fresh API preview of member balances or pending bills, and confirm. Voided records remain visible with actor, time, and reason; their shares no longer count and recorded settlements remain unchanged. **Discard draft** closes an unconfirmed entry without creating a record.
- Every active member can inspect a record's Change history in its expense or bill detail. Entries show the actor and time for creation, edits, voids, and bill provider-status changes; edits list changed fields with old and new values. Reported transfer history stays in Balances with sender, recipient, date, recorder, optional note and method, and recorded time. Edit and Remove mistaken record buttons follow API-provided permissions; the API independently enforces them.
- Global household navigation: the compact sidebar card opens an accessible menu to switch households (current marked), create another household, check an invitation, or open household settings. Home no longer duplicates the selector. On phones/tablets the global header control opens the same options as a bottom sheet. Open drafts block context-changing actions; invite input is protected from updates/reloads and joining still requires the existing API invitation review/acceptance. Create/join are disabled in design preview.
- House opens on Chores with one shared header, an Add menu, and a personal next-actions preview from the authorized API. The preview shows the next unanswered meal check (with a direct reply), swap request, assigned open chore, and assigned shopping item; it refreshes after changes and on return. Chores separates swap requests, personal assignments, overdue, upcoming, and history. Shopping separates items to buy from purchased/cancelled history. Meals separates replies needed, upcoming, and past checks, with response deadlines visible in the list. Selecting an item focuses its detail on mobile, with Back to the list. Meals lets active members publish checks, select participants, answer their own invitation, see attendance, and assign cooking roles. Shopping supports add, edit, assign, cancel, and purchase, optionally creating an API-previewed expense. Chores supports one-off assignment, completion, skip, swaps, and owner/admin reassignment. Assistant now offers authorized household questions; the design preview remains separate from live household data.
- Events in House lets active members create future plans with optional details, location, and end time, then answer Going, Maybe, or Not going until the start. The detail shows every current active member's response. “Add expense from event” starts an editable draft with the event title and Going members suggested as participants. A normal API preview and explicit confirmation are still required. Attendance changes do not alter a saved expense, and this version does not store an event-expense link.
- Announcements and Polls are interactive House sections and Add menu entries. Announcements offer Normal/Important/Urgent priority, selected recipients, optional acknowledgement and expiry, and recipient status. Polls offer selected voters, single/multiple choices, a required deadline, editable or withdrawable votes until closure, and aggregate results. Both have review-before-publish, safe retries, paginated filters, mobile detail navigation, and API refresh while visible. Published content and audience stay fixed. Pending acknowledgements and votes appear in Your next actions. Links support `view=announcements&announcement=<id>` and `view=polls&poll=<id>`, plus `add=1`; API access checks still apply.
- Installable PWA with Android Chrome/iPhone Safari help on sign-in and Profile, explicit browser installation when available, PNG/maskable/Apple icons, and safe-area spacing. The Assistant's smiling house mascot is also the in-app logo, browser icon and installed app icon, retaining the HouseMate wordmark and theme colors. Production service-worker updates ask for an explicit reload and wait for open drafts or unsaved settings. The offline navigation screen caches only public guidance; private household data and API responses are never cached by the worker, and writes are never queued.
- Offline/reconnection notices and 20-second API timeouts. An interrupted financial confirmation says **Not yet confirmed**, keeps its draft/preview/key, and needs an explicit retry of that review. Bill payment status and shopping purchases without an expense ask you to refresh the record before retrying. Open forms warn on browser reload/leave; drafts are held in memory and are not restored after closing or switching sections.
- Skip-to-content navigation, semantic headings, filter selection labels, stronger visible focus/text contrast, mobile touch targets/reflow, and reduced-motion styles. Workspaces load separately, simultaneous identical reads share an in-flight request, background polling pauses when hidden/offline, and long financial/notification lists stay paginated.
- The header bell opens a compact Notifications inbox with unread count, All/Unread, older pages, read controls, and tappable record rows grouped by Today/Yesterday/Earlier in the household timezone. Settings has Device notifications, Choose updates, and Quiet hours; category switches and account device management expand on demand. Quiet-hour times appear when enabled. Household preferences require **Save changes**; refreshing devices preserves unsaved edits and leaving Settings asks before discarding them. New actions and API-generated deadline reminders appear without a historical activity backfill.
- While the app is visible and online, new unread announcements, chore assignments/reassignments, and added shopping tasks show popups with View and Dismiss controls. Detection uses the existing 30-second refresh and respects current In app category settings. Initial history stays quiet; each notification appears once per tab across route changes. Up to three popups appear at a time, above phone navigation or at the top-right on desktop. They close after eight seconds, pausing on hover, keyboard focus, or a hidden tab. Dismissal leaves the inbox/read state intact. No browser notification permission or push setup is needed for these popups.
- Web push explains its value before an explicit Enable action, handles blocked/unsupported browsers, refreshes existing subscriptions, and lets the member disable account devices. Lock-screen messages are generic; links stay on the app origin and require normal access checks. Sign-out unsubscribes this browser. No token is stored in the service worker. Production push is configured as of 2026-10-02. Each member opens Notifications → Settings → **Enable notifications** and grants permission. An enabled current device instead offers **Turn off**; **Manage devices → Check devices** refreshes device status. On iPhone (iOS 16.4+), add HouseMate to the Home Screen and open it from its icon before enabling. New opt-in receives only subsequent updates; actual delivery must be checked with the receiving app closed, without signing out. Inbox and preferences work independently of push.
- Development-only design preview at `http://localhost:3000/preview`, with sample USD and THB households and no sign-in or API writes. Use the preview link on the sign-in screen to browse it. The preview route returns 404 in production.

## Opening push notifications

Notification taps immediately ask the browser to open the authorized record link,
allowing Android Chrome to select an installed HouseMate app. The returned window
is focused; a start-page URL is corrected to the record, and failed opening falls
back to a live same-origin window. Missing/unsupported links open Notifications.
Browser/OS app selection and actual phone navigation require device acceptance.
After a deployment, open the installed app and accept its Reload update prompt
after finishing drafts before testing a fresh notification. Keep the existing
push subscription. Phone receipt was reported working on 2026-10-03; Android tap
navigation was reported failing and remains subject to retest after this fix.

## Design system

The web app uses shadcn/ui with Base UI primitives, the Rhea style, Olive base colors, CSS theme variables, Lucide icons, and Geist Sans. HouseMate's forest-green primary color and warm background are defined in `app/globals.css`; the shadcn configuration is in `components.json`. Shared Button, Card, Input, and Badge components live in `components/ui/` and are used by the authentication, onboarding, dashboard, invitation, and settings screens. Run `npx shadcn@latest add <component>` from this `app/` directory to add another component, then run the checks below. Keep household data and authorization in the API when changing the interface.

The web app uses the independently published [API contract](https://github.com/heinzaw-bit/housemate-api/blob/main/openapi.yaml). In a whole-project checkout, the contract is available at `api/openapi.yaml`; the umbrella pins the API and web commits together. It never writes household data directly to Supabase. The API validates every bearer token and authorizes household access. Shared product scope and working context live in the umbrella's [SPEC](https://github.com/heinzaw-bit/housemate/blob/main/SPEC.md) and [handoff](https://github.com/heinzaw-bit/housemate/blob/main/PROJECT_HANDOFF.md). Local `AGENTS.md` preserves the shared boundaries and the Next.js instructions.

## Local setup

1. Run `npm ci` in this directory.
2. Copy `.env.example` to `.env.local` and set the API URL, Supabase project URL, and **publishable** key. Never put a database URL or secret/service-role key in a `NEXT_PUBLIC_` variable.
3. In Supabase Auth settings, add `http://localhost:3000` and your deployed app origin to the redirect allow list. Configure the Google provider if you want Google sign-in; email magic links use the email provider.
4. Configure and run the API on port 3001. Its `WEB_ORIGINS` must include `http://localhost:3000`. Apply the API's migrations 001–016, including `npm run migrate:notifications` and `npm run migrate:assistant`, before testing the live app. Keep the API running for scheduled reminders. Optional live push setup is described in the API README; production requires HTTPS and some mobile browsers require installing the PWA.
5. Run `npm run dev` and open `http://localhost:3000`.

Without Supabase settings, the public sign-in screen renders with disabled authentication controls. With Supabase set up but the API unavailable, the app shows a retryable connection error. It does not invent household data.

Email links and Google OAuth return to the app origin (`http://localhost:3000` locally). Supabase JS processes successful URL-fragment callbacks and restores the session from browser storage; the app translates callback failures into visible guidance. The Supabase Site URL is also used as a fallback redirect. To enable Google sign-in in another environment, enable the Google provider in Supabase, supply its Google Cloud OAuth client ID and secret there, set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` in `.env.local`, and restart the web server. Google sign-in has been verified in the configured local project. Never put the Google client secret in the web app's environment file.

Owners and admins create invite links in Profile → Household; active links show first, with used/expired/revoked links under Show history. Each link works once and expires after seven days. A recipient opens the link, signs in if needed, reviews the household name, and confirms joining. A valid link can also be pasted into onboarding or the global household menu’s Join with invite form. A `?household=<id>` link checks active membership through the API before showing that household; an inaccessible household shows an error instead of another household's data.

## Checks and scope

The header's sun/moon button beside the profile icon switches light/dark mode.
The first visit follows the device preference; explicit choices are remembered
in this browser and synchronized across tabs. The sign-in screen offers the
same toggle. If storage is blocked, the current page can still change theme.

Click the profile icon for Profile, the current account, Switch Google account,
or Sign out. Switching uses Google's account chooser and returns to the app
origin. It requires the existing Google provider configuration and
`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`. Switching keeps the current Supabase
session until Google succeeds; cancellation leaves that account signed in.
Open drafts must be finished/discarded first. Device push registration and the
previous household selection are cleared before navigation, and account changes
replace the complete household view before fresh API reads. The app uses one
active account per browser, shared across its tabs; it does not retain multiple
account sessions. Actual two-Google-account/phone acceptance is a manual check.

Production supports Sentry browser/server reporting and route/global recovery.
Configure `NEXT_PUBLIC_SENTRY_DSN` and server-only `SENTRY_DSN` to the web project
DSN in Vercel production, then redeploy. Reports strip household/user data, tokens,
request details, error text and breadcrumbs. Tracing/replay/log collection and
source-map uploading are disabled. Never expose a private Sentry auth token.
See the [API operations guide](https://github.com/heinzaw-bit/housemate-api/blob/main/OPERATIONS.md)
for incident procedures. A missing DSN leaves reporting off.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. `.github/workflows/ci.yml` runs the same checks when this project is moved to its own repository.

After building, run `npm run measure:bundle` to report JavaScript referenced by production HTML, including gzip bytes. This measures the signed-out/session-restoration shell, excluding deferred authenticated workspace code; it is not a phone runtime benchmark. DOM tests use Testing Library, user-event, jsdom, and axe-core for form structure and keyboard interaction. jsdom has no layout, so color contrast uses a separate palette calculation and zoom/layout/screen-reader behavior requires manual acceptance.

Run `npm run icons:generate` to regenerate the checked-in PNGs from `public/icon.svg` using Sharp. Keep its character geometry aligned with `components/housemate-mascot.tsx`, which is shared by Brand and Assistant. The maskable export has an opaque background and padded character; the Apple export is an opaque square for system rounding. When changing artwork, update the icon version in the manifest and root layout metadata.

The worker registers only in production. Use `npm run build` then `npm run start` after stopping the development server for local PWA work; real phones need a reachable HTTPS origin, configured API CORS, and Supabase Auth redirects. Phone `localhost` refers to the phone. Follow [release quality checks](QUALITY_CHECKS.md) for Android Chrome and iPhone Safari, interrupted confirmations, offline behavior, app updates, accessibility, and runtime performance. These actual-device checks remain pending.

Current API support includes identity, household create/list/detail, invite links, member management, roles, settings, shared expenses, hybrid bills, balances, manual settlements, meal checks, shopping, one-off chores, events with attendance, announcements, polls, notifications, preferences, web push devices, and read-only household questions. Assistant centers on one large chat box beneath the house mascot, with three small shortcuts for overview, meals and personal balance. The latest answer appears below it, with earlier answers in collapsed history and record previews expandable on demand. Meal answers link to the existing planning form; money answers link to expense split calculation and review. Ctrl/Command + Enter, cancellation and unfinished-question protection remain; clearing answers preserves input. Consent appears when typing a question and full privacy details are expandable. Assistant now prepares local meal checks and announcements: try “Plan dinner tomorrow at 7pm” or “Announce that dinner is ready.” Fill missing times/deadline/audience, edit the details, Review, then Confirm and publish. Commands stay in HouseMate and do not need Gemini consent/configuration. The normal API validates and publishes, creates normal notifications, and returns a source link. Interrupted publication keeps its exact payload/key for manual retry; drafts remain in tab memory and are cleared on scope/access changes. Shopping, chore, expense and hybrid-bill drafts were deployed on 2026-10-02; complete missing fields and use normal API review/confirmation. General free-text questions use the API's private Gemini key and free-tier confirmation. Members acknowledge Google's unpaid-service privacy notice before sending, and keep names, amounts and confidential details out; named balances remain in Money. Quick questions work independently. Push transport has automated simulated coverage; actual browser delivery and signed-in visual acceptance remain unverified. The first-release direction is in the root `SPEC.md` and `UX_FLOWS.md`.

## Assistant action drafts

Keep using the focused chat input for authorized questions. Try `Add shopping eggs`, `Create chore clean the kitchen`, `Add expense dinner 500 THB` or `Create bill electricity`. Commands are interpreted locally by HouseMate and need no Gemini consent. Complete the visible missing fields, edit people/details, Review (or Calculate and review), then explicitly Confirm and save or Cancel. Expense supports all four split methods; bills support individual/shared charges and credits with API-calculated shares. No command automatically saves or processes a payment. Failed/uncertain confirmations retain the original payload/key for manual retry, with edits locked if a prior save may have succeeded. Drafts remain tab memory only.

Release prerequisite: apply the API action-create migration and deploy the compatible API before this web app. Signed-in confirmations, notification delivery and actual-phone acceptance are tracked separately in QUALITY_CHECKS.md.
# Production uptime

`GET /api/health` checks the Next.js web runtime and returns a small public
`{ status: "ok", service: "housemate-web" }` response with `Cache-Control: no-store`.
It has no household data or database credentials. The separate API readiness
check covers database availability. External monitors should use this route;
the landing page can exceed monitoring providers' response-size limits.

