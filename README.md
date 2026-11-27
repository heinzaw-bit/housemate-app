# HouseMate web app

Independent Next.js web client for HouseMate, published as [heinzaw-bit/housemate-app](https://github.com/heinzaw-bit/housemate-app). This repository owns its dependencies, assets, tests, and CI. The [whole-project repository](https://github.com/heinzaw-bit/housemate) includes it as the `app/` submodule alongside the independent API. Run the commands below from this repository root; no sibling checkout is required.

## Current slice

Your balance combines confirmed records and Unpaid bills, with an **Includes
unpaid bills** note. The API credits each bill’s full total to its planned payer
and deducts allocated shares from participants. Home and Money label the amount
**You’re owed** or **You owe**. Assistant answers use the same combined amount.
Marking a bill Paid does not count it twice. Confirmed record details and manual transfer
previews keep their confirmed-record basis and are labelled clearly.
Home and Money refresh every 15 seconds while visible and online and on return;
financial drafts pause Money polling. Deploy the API’s additive `expectedNetMinor`
field first; older replies show Confirmed balance only.

The `codex/zip-ui-redesign` branch starts the UI migration from the supplied
**Web App Creation.zip**. Home now presents the API balance, bill/chore attention
rows, meal plans, shopping and chore counts, and financial activity. The main
navigation is Home, Money, Board, Assistant and Profile. Board exposes six tools.
Money opens on Overview and keeps existing balances/record links under Settlements.
Financial confirmation still uses the API’s allocation and idempotency behavior;
Assistant remains question-only. Open Board and Money drafts block tool/tab changes.

DM Sans and Manrope are pinned Fontsource dependencies, loaded through
`next/font/local`; builds do not download fonts from Google. With `npm run dev`,
open `/preview` for the labelled sample dashboard, `/preview/money` for sample
Money sections and `/preview/house` for the Board tool grid. Preview never saves
household changes and is unavailable in production. The public landing page and
existing record forms retain their current content. Browser preview checks pass for desktop and small phone layouts, household
switching, theme reloads and section navigation. Signed-in end-to-end and actual
Android/iPhone acceptance remain release checks; local sign-in needs Auth
configuration.

Header controls use matching 44px touch targets, outline icons, accessible
labels and theme-aware colors. Notifications and Theme are plain icons; Account
and Search retain soft circular backgrounds in browsers. In the installed phone
app at widths up to 650px, Search uses a plain magnifying-glass icon to match
Notifications and Theme, keeping its 44px touch area and keyboard focus outline.
Search sits beside the page
breadcrumb on desktop and beside the brand on phones. Search uses
one focus outline around its input row. The account identity appears inside its
menu. Phone headers keep safe-area side
padding. Up to 900px, a two-column header keeps logo/search on the left and
other controls on the right. Up to 650px, the mascot replaces the full wordmark
to keep every 44px control on one row, including with larger text settings.
The mobile mascot uses a matching 44px tile and cannot shrink beside the header
controls.

Click or tap the workspace mascot to refresh the current page, keeping its URL
and selected household. The mascot is a keyboard-accessible button on phones
and in the desktop sidebar. Refresh is disabled while a draft or unsaved
settings are open; finish or discard that work first. Other brand marks remain
decorative.

Signed-out visitors at `/` see a public landing page with feature highlights,
setup steps, an interactive Home/Money/Board tour, FAQ and a privacy overview.
Six sections follow the natural page scroll, with header links to jump directly
to content. Sections fade in as they enter view and remain visible afterward.
Reduced motion, unavailable animation APIs and keyboard focus keep content
readable. The root entry requires JavaScript to complete the session/launch check.
Previews use explicitly labelled fictional records and make no household reads.
Set up a household and Sign in open `/sign-in`. The landing page tells invitees
to use their invitation link. The sign-in page explains how to create or join a
household and shows a confirmation after signing out. Restored members at that
route return to `/`.
Reloads show the mascot and “Opening HouseMate…” until session restoration and launch detection finish. Signed-in visitors continue directly to their dashboard without a landing flash; signed-out Android Chrome/iPhone Safari Home Screen launches open sign-in. Signed-out ordinary browser visitors still see the landing. Invite/household links, pending
invitations and sign-in callbacks retain the existing authentication/access flow.
The landing supports the shared dark-mode toggle and responsive layouts. Its
footer links describe the product and privacy; they are not legal terms or an
approved legal privacy policy. No support address is invented.

- Home puts the three earliest unpaid bills first, followed by personal balance and household unpaid-bill totals. Chore, meal and shopping summaries are removed. Recent activity previews three financial events and can expand to the ten returned by the API. Add actions live in Money and Board. Due soon covers today through seven days ahead in the household timezone. The dashboard update status has no manual Refresh button. Refresh runs on focus/reconnection and about once a minute; failed refreshes label the last snapshot as stale and access/context changes clear it. Events and announcements are not in the Home summary yet.
- Money links support `?household=<id>&view=expenses|bills|balances&record=<id>`, and `&add=1` opens the selected expense or bill form. Record links are checked by the API; transfer details can open older records beyond the first history page.
- Money opens on Overview with a shared personal balance and household unpaid bills summary above Overview, Expenses, Bills, and Settlements navigation. Confirmed money changes refresh the summary. Bill/expense history previews three records; View all bills/expenses expands the loaded list inline and Show less restores the preview. Load more is available while expanded. Details pair with the list on desktop and retain mobile Back navigation. Text-only Hide details/View details controls preserve mounted detail and confirmation state; selecting a record opens its details. No separate record panels or Details/Activity tabs are used.

- Responsive sign-in screen with Google OAuth and email magic link through Supabase Auth.
- Household creation and single-use shareable invite joining, with USD or THB selection and timezone.
- API-backed identity and household creation/listing/selection.
- Global household Search in the header (Ctrl/Command + K) opens a keyboard-accessible dialog for Expenses, Bills, Transfers, Events and Announcements, with literal text/type filters, newest-first cursor pages and exact record links. Meals, Chores, Shopping and Polls are excluded from both the selector and All records results, including later pages. The API retains earlier record support for compatible clients; pages containing only excluded records keep their Load more control when another page exists. Queries require at least two characters, remain only in the open dialog’s memory, and never contact AI. Close/scope/query/filter/offline changes discard results; stale responses cannot cross scopes. Drafts block result navigation. Requires the API search contract and runtime to be released before this client.
- Search starts as a compact panel with a focused input, a small All records selector and contextual minimum-length guidance. Results use category icons, short previews, status and subtle dates. On phones, a bottom sheet keeps the input/filter above scrollable results and adjusts to the visible viewport/keyboard. Clear search restores input focus; real phone keyboard/visual acceptance remains separate from automated checks.
- Profile shows your avatar, display name, household, and role with an inline name editor. The Account card shows your sign-in email, account switching, and sign-out controls. Find Settings below Account on phones and in the desktop sidebar. Settings groups appearance and installation help under App and device, links to notifications for the selected household, and shows household details, members and invitations. The household picker opens that group directly. Edit and save controls retain draft protection and role checks. The currency summary explains when it is locked. The read-only preview supports both pages.
- API-backed shared expense list, detail, and add flow on Money. Active members can choose a payer and selected participants, preview equal/exact/percentage/ratio shares, then confirm. Failed confirmations keep the form and retry key so retrying does not create a duplicate.
- API-backed bill list, detail, and add flow on Money. The form proceeds through Details, Split and adjustments, and Review. Enter provider, billing period, due date, provider payment status, selected base participants, and any explicitly classified personal or shared charges and credits. The API preview shows the shared remainder and final shares before confirmation. For a saved bill, owners and admins use Mark Paid or Mark Unpaid to report provider payment status. A saved change refreshes the Unpaid bills total in Money and other open HouseMate tabs in the same browser.
- Money Overview shows individual member balances and two recent transfers beneath the shared summary cards. Member balances also appear in Settlements. Use View all to expand Recent activity in Overview or Recorded transfers in Settlements when more than two transfers are available. Select a transfer row to open its details in Settlements. The household owner can open the Record transfer tab beside Settlements to record a transfer they sent or received. Choose the other participant, enter the amount and date, and review the API preview before confirming. Successful confirmation refreshes balances, and an idempotency key makes retries safe.
- Expense details offer **Edit** to the creator or a household owner or admin. Bill details offer **Edit bill** to household owners and admins only. The form reloads the saved split inputs, requires a fresh API preview for a revised draft, and preserves entered values after a failed save. The API rejects stale revisions and expired previews; edit confirmation refreshes the displayed record. Bill payment status stays in its separate detail control.
- Expense details offer **Remove mistaken expense** to the creator or a household owner or admin. **Remove mistaken bill** is available only to household owners and admins. The action uses the audited Void flow: enter a reason, review the fresh API preview of member balances or pending bills, and confirm. Voided records remain visible with actor, time, and reason; their shares no longer count and recorded settlements remain unchanged. **Discard draft** closes an unconfirmed entry without creating a record.
- The API keeps the audit history for expenses and bills. Settlements lists recorded transfers with sender, recipient, date, recorder, optional note and method, and recorded time. Edit and removal controls follow permissions that the API enforces.
- Global household navigation: a minimal row with a small green initial badge, household name and chevron opens an accessible menu to switch households (current marked), create another household, check an invitation, or open household settings. Home no longer duplicates the selector. On phones/tablets the global header control opens the same options as a bottom sheet. Open drafts block context-changing actions; invite input is protected from updates/reloads and joining still requires the existing API invitation review/acceptance. Create/join are disabled in design preview.
- Board opens to the tool grid with no tool selected. Choose a tool to open its list. Direct links can open their specific record. The next-actions panel and shared Add menu are removed. Each tab offers its own create action, compact filters, list previews and record details with mobile Back navigation. Announcement filters stay on one row, using To acknowledge for the shorter visible label and horizontal scrolling when phone width or text scaling requires it. A + New button beside the Board title opens the selected tab’s form (full action labels on desktop), with Cancel inside the form. Clicking New again focuses the existing draft without clearing it. Refresh sits below the filters, which have spacing below the Board section tabs. Home no longer shows chore, meal or shopping cards; Assistant defaults promote household questions and money.
- The Events tool in Board lets active members create future plans with optional details, location, and end time, then answer Going, Maybe, or Not going until the start. The detail shows every current active member's response. “Add expense from event” starts an editable draft with the event title and Going members suggested as participants. A normal API preview and explicit confirmation are still required. Attendance changes do not alter a saved expense, and this version does not store an event-expense link.
- Announcements use two-line message previews and show acknowledgement-needed badges only for eligible recipients. Active urgent/important notices are prioritised among loaded pages, then newest first; API paging stays newest-first. Publishing still requires review, explicit confirmation and safe retries. Existing Board record links, notification history, preferences, and saved drafts remain available.
- Installable PWA with Android Chrome/iPhone Safari help on sign-in and in Settings, explicit browser installation when available, PNG/maskable/Apple icons, and safe-area spacing. The Assistant's smiling house mascot is also the in-app logo, browser icon and installed app icon, retaining the HouseMate wordmark and theme colors. Production service-worker updates ask for an explicit reload and wait for open drafts or unsaved settings. The offline navigation screen caches only public guidance; private household data and API responses are never cached by the worker, and writes are never queued.
- In **Board → Meals**, browse Upcoming, Reply needed, and Past. Use **New meal** beside the Board title to choose a meal type, set the meal time and reply deadline in the household timezone, and select participants. Cooking roles are optional. Select a meal to see replies, respond if invited, or edit cooking roles. **Back to meals** returns to the list.
- In **Board → Shopping**, use **New item** to add something to buy. Open an item to assign a buyer, edit it, or confirm a purchase. If the purchase should be split, choose Add a shared expense and review the calculated shares before confirming. History contains purchased and cancelled items.
- In **Board → Chores**, use **New chore** to choose an assignee and a due time in the household timezone. The list opens on **Assigned to me**, with Upcoming, Overdue, Swap requests, and History filters. Open a chore to complete, skip, swap, or reassign it when your role permits.
- In **Board → Polls**, use **New poll** beside the Board title to open the draft. Review the question, choices, eligible voters, and deadline before publishing. Polls refresh automatically.
- Offline/reconnection notices and 20-second API timeouts. An interrupted financial confirmation says **Not yet confirmed**, keeps its draft/preview/key, and needs an explicit retry of that review. Bill payment status and shopping purchases without an expense ask you to refresh the record before retrying. Open forms warn on browser reload/leave. New-record drafts support device-local recovery below; Assistant questions and other edits/settings/votes remain in memory.
- Skip-to-content navigation, semantic headings, filter selection labels, stronger visible focus/text contrast, mobile touch targets/reflow, and reduced-motion styles. Workspaces load separately, simultaneous identical reads share an in-flight request, background polling pauses when hidden/offline, and long financial/notification lists stay paginated.
- Interaction motion includes main-tab content fades, subtle button presses, desktop dialog fades/mobile sheet slides, in-place list expansion feedback, the Assistant’s one-time greeting/thinking dots/answer fades, decorative checks for confirmed successes and notification entry/exit. New motion respects OS Reduce motion; financial amounts and confirmation controls stay stable. Popup dismissal becomes inert immediately, cleans up its short exit timer on unmount, and never marks the inbox read. CSS provides the effects without an animation library.
- The root app shell stays mounted between Home, Money, Board, Assistant, Profile, Settings and Notifications. Same-household tab changes reuse the current account view and header controls. Route queries still synchronize household selection and record links; account/household changes replace scoped UI state.
- Home, Money and Board can initially show a checked snapshot less than one minute old while a fresh API read runs. A bounded 64-entry browser-memory store is isolated by access token and household; it never persists records or answers offline. Routine refreshes run quietly. Failed-refresh warnings flag data that may be out of date. Writes, session/account changes, household changes and authorization failures invalidate snapshots; late older reads cannot restore them. Only dashboard/balances/members and first-page money/communication lists qualify. Details, subsequent pages, search, Assistant and financial previews/confirmations remain fresh API operations. Accessible section-shaped skeletons cover uncached loading; phone speed gains are not yet measured.

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

Owners and admins create invite links in Settings → Household; active links show first, with used/expired/revoked links under Show history. Each link works once and expires after seven days. A recipient opens the link, signs in if needed, reviews the household name, and confirms joining. A valid link can also be pasted into onboarding or the global household menu’s Join with invite form. A `?household=<id>` link checks active membership through the API before showing that household; an inaccessible household shows an error instead of another household's data.

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

Current API support includes identity, household create/list/detail, invite links, member management, roles, settings, shared expenses, hybrid bills, balances, manual settlements, meal checks, shopping, one-off chores, events with attendance, announcements, polls, notifications, preferences, web push devices, and read-only household questions. Assistant centers on one large chat box beneath the house mascot, with three small shortcuts: Catch me up, My balance and Board updates. Catch me up includes important active announcements, upcoming events and due bills; Board updates combines announcements and events. The latest answer appears below it, with earlier answers in collapsed history and record previews expandable on demand. Answer footers omit View balance and Calculate a split; other household source links and individual record links remain accessible. Ask/Enter submits in one step; Shift + Enter adds a newline and Ctrl/Command + Enter also works. There is no consent checkbox, sharing notice or expandable privacy section. An animated mascot/dots indicator replaces the visible input inside the chat box while loading, with Cancel below it and a static reduced-motion version. Only answers appear below the composer. Cancellation, failures and clarification preserve input; completed requests restore focus. Household answers separate their API summary and context, retain exact amounts and offer checked times and clearly labelled record/source links. General replies use short plain-text paragraphs/bullets, a subtle AI label and an Answered timestamp. Provider errors/limits offer household shortcuts and Open Board/Open Money links without automatic retry. Clearing answers preserves input. Assistant is question-only: it never calls draft preparation or opens action editors. Create records through Board or Money using their existing explicit review/confirmation flows. Unsent questions are not saved or resumed after a reload; the Assistant has no saved-draft/discard controls and ignores older saved questions/action seeds. The API and retained editor components remain compatible with previous clients. Say “Hello”, ask “What are you?”, “What announcements are there?”, or a general household-advice question. Greetings, explanations and common announcement questions work locally. General replies use the API's private Gemini key and free-tier confirmation, are labelled as AI answers, and may be mistaken. Weather lookup is removed. Ambiguous household questions show read-only choices; choosing one checks fresh records. Short follow-ups use only the previous household topic in this tab, such as “What about today?” after events. Clearing answers, reloading or changing account/household clears context. No previous messages or answers go to Gemini. General questions remain independent. Household records and financial amounts remain API-generated and never go to Gemini. Google's unpaid service may use/review general questions; keep names, amounts and confidential details out. The existing API request field remains for compatibility without an acknowledgement UI; named balances remain in Money. Quick questions work independently. Push transport has automated simulated coverage; actual browser delivery and signed-in visual acceptance remain unverified. The first-release direction is in the root `SPEC.md` and `UX_FLOWS.md`.

## Saved drafts

Unfinished new expenses, bills, meals, shopping items, chores, events, announcements and polls are automatically saved on this device for seven days since the last save. Assistant questions and action drafts are excluded from saved recovery. Reopen the same section/form and choose **Resume draft** or **Discard saved draft**. Saved drafts belong to your signed-in account and household; signing out or changing accounts clears them. Household currency/timezone changes invalidate old draft context.

Recovered money drafts require another API preview and explicit confirmation. An interrupted create request retains its original fields and retry key; retry unchanged to check whether it was already saved. Nothing is submitted automatically or queued while offline. Cancel/discard or successful submission clears the saved draft. Competing tabs show a conflict instead of silently replacing a saved entry.

Drafts are stored locally, are not encrypted by HouseMate, do not sync between devices, and disappear if browser/site data is cleared. Browser storage failures are shown in the form. Tokens, API preview totals, household/member snapshots, chat answers and Gemini consent are not saved. Existing-record edits, shopping purchases, transfers/removals, settings and unsaved votes continue to use the existing in-memory guards.

## Retained Assistant action APIs

The current web Assistant is question-only and does not expose these commands. The following describes retained API/editor support for earlier clients.

Earlier clients supported commands such as `Add shopping eggs`, `Create chore clean the kitchen`, `Add expense dinner 500 THB` or `Create bill electricity`. Commands are interpreted locally by HouseMate and need no Gemini consent. Retained editors require completion of missing fields, editing people/details, Review (or Calculate and review), then explicitly Confirm and save or Cancel. Expense supports all four split methods; bills support individual/shared charges and credits with API-calculated shares. No command automatically saves or processes a payment. Failed/uncertain confirmations retain the original payload/key for manual retry, with changed confirmations blocked if a prior save may have succeeded. Editable drafts support device-local recovery; chat answers remain in memory.

Release prerequisite: apply the API action-create migration and deploy the compatible API before this web app. Signed-in confirmations, notification delivery and actual-phone acceptance are tracked separately in QUALITY_CHECKS.md.
# Production uptime

`GET /api/health` checks the Next.js web runtime and returns a small public
`{ status: "ok", service: "housemate-web" }` response with `Cache-Control: no-store`.
It has no household data or database credentials. The separate API readiness
check covers database availability. External monitors should use this route;
the landing page can exceed monitoring providers' response-size limits.

## Notification timing and device checks

Bell/Inbox refresh from fresh authorized API records when push arrives, with a visible/online 15-second fallback. Native banners display before invalidation; tap links remain.

Notifications → Settings → Test notification sends one immediate test to this device, including during quiet hours. Wait a minute between tests. Push-service acceptance does not confirm phone receipt. Use the iPhone Home Screen installation and check Focus/Scheduled Summary; check Android notification/battery restrictions for delays. Deploy the new API/migration before using tests.
