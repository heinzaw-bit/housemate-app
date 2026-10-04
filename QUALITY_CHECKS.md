# Web release quality checks

Target platforms: **Android Chrome and iPhone Safari**, selected by the user. Implementation and automated checks are complete; the actual-device and signed-in rendered checks below remain pending as of 2026-09-30.

## Production push activation — 2026-10-02

Server VAPID/contact setup is active and the API redeployment is READY. The user reports that initial joining/sign-in and core phone flows were tested with household members; this does not mark every manual check below complete. On 2026-10-03 the user confirmed Android Chrome phone push delivery and, after deployment of the notification-tap fix, confirmed tapping now opens the app successfully. iPhone-specific acceptance is still being clarified; permission/category/quiet-hours and other checks below remain separate.

The notification-tap handler now calls `clients.openWindow` immediately, allowing the browser to select the installed app, focuses the returned window and corrects a returned start-page URL to the source link. If opening fails or returns no window, it tries live same-origin windows, focusing before navigation and continuing past failed/closed windows. Automated worker tests verify these paths, link restrictions and safe inbox fallback; they do not establish Android/iPhone launch behavior.

After this fix is deployed, open HouseMate from its installed icon, finish/discard drafts and accept the **Reload** app-update prompt. Test a new notification with the app closed and again with it backgrounded and Chrome also open. Each tap should open the exact authorized record. Keep the existing installation and push subscription; reinstalling or rotating keys is unnecessary. Record whether Chrome opens, nothing opens, or the app opens on another page, plus Android/Chrome version. Also check a removed/inaccessible source and signed-out state still require normal API authorization.

On Android Chrome and an iPhone Home Screen app (iOS 16.4+), open Notifications → Settings, refresh settings/devices, explicitly enable push and allow permission. Confirm Announcements web push is enabled and turn quiet hours off for the test. Close the receiving app without signing out. From another account, publish a new announcement addressed to the receiving account after its device was enabled. Allow about two scheduled worker cycles and verify a generic lock-screen update; tapping must open the exact authorized announcement. Check permission denial, category mute, quiet deferral, sign-out removal and no replay of old entries. Record actual phone/OS/browser and delivery/deep-link outcome; READY/healthy worker checks and simulated transport are not device-delivery proof.

## Assistant acceptance (question-only web)

Check the chat box appears before suggestions/results, the retained mascot and three shortcuts (overview, bills, personal balance). On Ask/Enter, the mascot/dots animation must appear inside the input area, not in a separate card. Only the returned answer appears below it. Earlier answers remain collapsed until opened; record expansion must make no extra API call. Calculate a split opens Money with its existing preview/confirmation flow. No action command opens a draft editor or calls draft preparation, even if the API advertises drafts.

Check loading at 320px width, both themes, zoom and reduced motion. Cancel must retain the exact question and restore focus; late replies after cancel/account/household changes must stay hidden. Shift + Enter adds a newline and IME Enter must not send early. Explicit Resume restores only unsent question text, with no provider or write request; older action seeds must not reopen editors. Clearing answers preserves unfinished input. Phone/rendered acceptance remains pending.

Free text requires the API's private Gemini key, free-tier confirmation and migration 016. Verify the visible Gemini sharing notice and terms link, no separate consent checkbox, and no provider request until explicit Ask/Enter. Shift + Enter must add a newline; typing, draft recovery and household/account changes must never send questions. Check the animated loading mascot/dots inside the input area, static reduced-motion state, Cancel and duplicate prevention. Cancellation/failure/clarification must preserve input and late results must stay hidden. Compare the summary, supporting text and money decimals to the API response; no output text is invented. Check a personal balance against Money, cooking today across a UTC/household date boundary and an unsupported write or per-member bill-payment question. Known member names/emails, numbers, links and credential markers must be rejected before Google receives a question; use Money for named balances. Simulate provider failure and a limit response; input must remain and quick questions must still work, with no automatic retries or household writes. A benign live-provider classification passed; authenticated end-to-end and phone acceptance remain pending.

### Previous meal/announcement draft acceptance (retained API/editor only)

These commands are no longer exposed in the question-only web Assistant. The following checklist is retained for API compatibility and any future editor reactivation.

Try “Plan dinner tomorrow at 7pm” without Gemini consent, including when provider setup is disabled. Verify the draft uses the selected household timezone, requires a response deadline and shows editable participants. Try a bare “7”, a relative “next Friday”, multiple commands and a named/limited audience: no guessing or provider fallback. Send “Announce that dinner is ready”, change title/message, priority, acknowledgement, expiry and recipients. Review and Edit/Cancel must create no record. Confirm once: verify the actual House record, author/time, audience, response/acknowledgement behavior and normal feed/popups for eligible recipients; web push depends on configured transport/devices.

Interrupt the confirmation response. The result stays Not yet confirmed; editing/cancelling that attempt is locked and manual retry uses the exact original payload/key. Verify one actual record/notification only. Simulate definitive validation errors to correct fields, lost membership to clear private drafts, and household/account changes during preparation/publication to ignore old private responses. Open drafts must block app-update/account-switch reloads. Check keyboard labels/focus after review/cancel, dark mode and phone layouts. Automated tests use mocks and do not establish real publication/notification delivery; signed-in rendered and phone checks remain pending.

## Household menu acceptance (rendered phone checks pending)

Home must have no household picker beside its heading. Desktop: click anywhere on the sidebar household card, or use Enter/Space; verify current household check, Arrow-key navigation, Escape/dismissal and focus return. Switch to another accessible household from each main tab and verify selected-household links/content update with no retained private records. Create another household and verify the old memberships stay available. Paste a valid invitation link/code to open the normal invitation review; opening the form or checking invalid input must not accept membership. Open settings and verify the selected household anchor and normal role restrictions.

An unfinished expense, bill, Assistant draft or settings change must block switching, create/join and settings navigation with a clear message, preserving the draft. On Android Chrome/iPhone Safari, verify the shared global header control opens a modal bottom sheet, traps/restores focus, has a usable close action, fits long household names and many memberships, respects keyboard/safe areas and light/dark themes. Pending invitation input must protect update/reload; cancelling may discard that input. Automated tests cover menu/sheet semantics, draft guards and invitation routing; jsdom does not establish rendered layout.

## Automated verification commands

Run from this independent `app/` package:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run measure:bundle
```

Coverage includes a simulated lost expense-confirmation reply followed by the same-key retry, lost void confirmation after preview expiry, connection notices, update protection for drafts (including a draft opened during activation), keyboard installation, structural axe checks for sign-in and main household/money/settings forms, 1,000-record overlapping-page merging, request sharing/timeouts, palette contrast, and the actual service-worker script's public-only cache/update/fallback behavior. Tests use fixtures and mocked API replies; they do not create live household records. jsdom has no rendered layout, so axe color-contrast is disabled and the palette check does not substitute for rendered acceptance.

`measure:bundle` sums production HTML script bytes and individual gzip sizes for Home, Money, House, Notifications, and Profile. It measures the signed-out/session-restoration shell. Lazy workspace code, browser execution time, CSS/fonts, HTTP transfer overhead, and device Core Web Vitals are excluded.

## Production test setup

Use a reachable HTTPS production build with the normal API, migrations, API CORS origin, and Supabase Auth redirects configured. The worker does not register under `npm run dev`. For local desktop checking, stop the dev server, then use `npm run build` and `npm run start`. A phone's `localhost` is not the development computer. Use a test household and clearly identified test records for confirmation checks; HouseMate records reported transfers rather than processing payments.

Record device model, OS/browser version, date, viewport/text scaling, connection, and build for each run. Android Chrome and iPhone Safari should each be checked in the browser and installed from the home screen.

## Installation, offline, and updates

1. Open sign-in and Profile. Verify readable installation help and keyboard access. Install via Chrome's offered prompt/menu or Safari Share → Add to Home Screen. Installation must not request notification permission.
2. Launch from the home screen, restore the account, and navigate every section. Check icon shape, Apple icon, top/bottom safe areas, and the five mobile navigation items in portrait and landscape.
3. Open a money draft and disable networking. Verify the offline notice, unchanged entered values, no queued save, and a **Not yet confirmed / not sent** message for an explicit confirmation attempted offline.
4. Simulate a confirmation reaching the API with its reply lost. Verify the form stays open and shows uncertainty; reconnect and retry that same review. Verify exactly one saved record and matching API-calculated shares/history. Repeat for a bill, settlement, edit, mistaken-record removal, and shopping purchase with expense. For bill status or purchase without expense, refresh the record before a second action.
5. While offline, directly reload a protected route. Verify the public offline screen, readable retry control, and reconnection notice. Private records/API replies must not appear in worker Cache Storage. No mutation should run merely because the connection returns.
6. Deploy an updated worker while an old tab is open. Verify the update offer; a draft or unsaved vote/settings must disable reload. Finish or discard the work, then explicitly update. Activate from another tab: the tab containing a draft must stay open. Check a draft opened during worker activation is also preserved.
7. Deliberately reload/leave an open form and check the browser warning where supported. For supported new-record/Assistant drafts, return and choose Resume draft; verify typed fields and selections survive without an automatic write. Money must require a fresh API preview; retry an interrupted create with the original key. Repeat after fully closing/restarting the installed Android Chrome and iPhone Safari app, including reconnection. Check account/household isolation, cancel/success removal, expiry, blocked storage and two-tab conflicts. Local recovery does not provide offline writes or cross-device sync. Existing-record edits, purchases, transfers/removals, settings and votes remain in memory.

## Accessibility and responsive layouts

### Public landing and sign-in acceptance

On Android Chrome, iPhone Safari and desktop, open `/` while signed out. Check
the hero, feature cards, setup steps, fictional product previews and FAQ at
320px, large text, light/dark mode and reduced motion. Switch Home/Money/House
previews using the keyboard; open FAQs with Enter/Space and check visible focus.
All Get started/Create your household/Sign in links must open `/sign-in`.
Scroll naturally through all six sections: upcoming sections should fade in as
they enter view and remain visible when scrolling back. Check wheel, touch and
keyboard scrolling, with no scroll snapping, progress counter or page controls.
Open a `/#tour` or `/#privacy` link; check reload and browser Back/Forward. Check
the fade with normal motion and its absence with reduced motion, including a
device preference change while the page is open. Tab into an upcoming section;
its focused content must become visible. At large text and on phones, sections
must grow without clipping, with header links reachable. Disable JavaScript or
IntersectionObserver and verify all content remains readable.

Restore a signed-in account at `/` and verify the live dashboard replaces the
public page. Follow a household invitation and a real Google/email callback,
including a cancelled callback: these must reach the existing authentication or
household flow. Open `/sign-in` while signed in and check the redirect to `/`.
No fictional preview records may appear as live household records. Automated
tests cover routing states, tour selection and DOM structure; rendered phone,
native FAQ keyboard activation and actual-provider acceptance remain pending.

### Theme and account switching acceptance

On both target phones and desktop, check light and dark modes in every section,
forms, error states, notification popups and the profile menu. Toggle beside the
profile icon, reload and navigate; the choice should persist. With no saved choice,
check device theme changes. Check blocked storage, cross-tab changes, keyboard
activation, text contrast and 320px/large-text layout.

Open the profile menu, verify the current name/email and Profile link, then use
Switch Google account with two test accounts belonging to different households.
Google must offer account selection; after returning, only the new account's API
data may appear. Verify cancel/error retains the previous session, open drafts
block switching/sign-out, and a delayed previous-account read cannot overwrite
the new view. Other tabs share the new session. Re-enable device push after
switching if it was previously enabled. These actual-provider/device checks remain
pending; automated tests simulate provider and API replies.

### General acceptance

1. Use Tab/Shift+Tab/Enter/Space without a mouse for sign-in, household switching, all navigation, Profile/invites, Notifications, money previews/confirmation/removal, and each House flow. Check the skip link, visible unobscured focus, logical order, named controls, selected filters, and focus after opening details/errors.
2. Use VoiceOver on iPhone and TalkBack on Android; also use a desktop screen reader with keyboard controls. Check headings, labels, amounts/currency, selected responses, validation, live status, pagination, and draft/confirmed distinctions. No accessibility conformance is inferred from axe alone.
3. At 200% browser zoom and a 320 CSS-pixel viewport, check forms, long names/titles, bill adjustments, previews, history rows, and mobile navigation. Content and controls must remain reachable without clipping. Check large phone text settings, landscape, and software keyboard visibility.
4. Check actual text/background pairs and focus visibility in normal, hover, selected, error, and disabled states. Enable reduced motion and verify scrolling/transitions respect it.

## Phone performance and history

1. On representative mid-range hardware, record cold and warm loads under a consistent network profile. Capture LCP, INP, CLS where the browser supports them, plus task completion and scrolling responsiveness. Separately record authenticated first-workspace loading and later section switching; shell byte savings alone do not prove phone speed.
2. Use a test household with long expense/bill and notification histories. Confirm the initial API page limit, explicit older-page requests, correct order, no duplicates or missing older pages, and no repeated request from rapid Load more clicks. Open records beyond the first page.
3. Background the app and disconnect/reconnect. Verify background polling pauses while hidden/offline and read refresh resumes on return without losing a draft or replaying writes. Compare before/after under the same conditions before making runtime performance claims.

Live web push acceptance remains separate and blocked on a real public server contact; do not fabricate one for these checks.

### Mascot branding acceptance

On the production HTTPS origin, check the smiling house logo on landing, sign-in and desktop/phone navigation in light and dark themes. Check the browser icon and a fresh Android Chrome/iPhone Safari installation: Android circle/squircle crops must retain the face and gold sparkle; iPhone must show the same character. Compare existing installations after their platform icon refresh. Real-device acceptance remains pending; PNG dimensions and maskable padding checks do not verify OS rendering.

### Compact Home and Money acceptance

Check that the entire bottom sidebar profile block (divider, avatar and name) is absent and Home has no Quick actions button group. In Money, load at least four source entries and recorded transfers: each card starts with the three newest by source/transfer date; its Show more/Show less button has an accurate expanded state and works by keyboard. Expand/collapse each independently, select a different member and check the source preview resets, then load older pages after expanding a list with at least 50 records. Collapsing must not change the API-calculated balance or discard loaded history. A newly recorded backdated transfer must retain date order. Check 320px width and dark mode. Signed-in browser/device acceptance remains pending.

### Attention cards and suggested transfers

On desktop, check Bills to watch, Next chore and Next meal form a three-column row with equal heights and bottom-aligned action links; bill records must wrap rather than overflow. Check empty and three-bill results, long titles, 320px width, dark mode and zoom. On phones the cards must stack and grow with content. In Money, with at least three current suggestions, check only two show initially and its independent Show more/Show less button exposes the remaining suggestions without a new API read. Suggestions retain API calculation order (they have no date); Record after paying still opens the normal manual transfer preview/confirmation. Actual signed-in browser/device acceptance remains pending.


## Profile settings hub acceptance

Check My profile, Household and Preferences at 320px width and in both themes. Tabs must show one panel and support keyboard arrows plus Enter/Space, visible focus and screen-reader names. Email stays inside expandable account details; member list rows show names/roles without emails. Edit focuses the first field; unchanged Save is disabled, Cancel writes nothing and restores the saved summary/focus, failed saves keep the draft, and saving disables repeat submissions. Open drafts/reviews block section, ordinary navigation links, household/account changes and update/reload prompts. Browser history navigation and forced termination are not persistent draft recovery.

Follow Household settings from a different tab and from My profile/Preferences on the same route. Check member/admin/owner controls, timezone search including no results, currency locking after financial activity, and role review Cancel versus explicit Confirm. Verify active invitations first, history disclosure, create/copy/revoke, and seven-day/single-use guidance. Preferences must open the selected household's existing notification Settings view, show truthful push availability there, and keep installation separate from notification consent. Preview must perform no household API reads/writes. Signed-in rendering and Android Chrome/iPhone Safari acceptance remain manual checks.


## Household search acceptance

On Android Chrome and iPhone Safari at 320px and larger, check header fit, safe areas, keyboard/viewport resize, both themes and dialog dismissal/focus restoration. Open via Search and Ctrl/Command + K; do not stack over another dialog. Type a two-character query, change filters, use IME composition, ArrowDown/Up through results and Enter to open the exact record. Verify nine types, newest-added ordering, visible closed/voided labels, empty/error/retry states and Load more without overlap. Existing draft state must survive blocked result navigation. Open the resulting detail with normal API authorization; searching itself never writes records.

With two accounts and multiple households, check targeted announcements/polls are visible only to authors/selected audience/moderators. Clear queries/results on close, household/account change and offline; simulate delayed old requests, permission loss and reconnect without old/private data reappearing. No query/history goes into the page URL or browser storage. The API must be published before web search uses it. Automated API/DB and jsdom checks do not establish actual signed-in/device rendering.

### Previous shopping/chore/money draft acceptance (retained API/editor only)

The question-only Assistant does not expose these editors; retain this checklist for compatibility or future reactivation.

After the additive action-create migration and API-before-web release, test local commands without Gemini consent: shopping with quantity/unit/optional buyer/price, a chore with ambiguous named assignee/time, an expense with missing payer/participants/date and a hybrid bill with an unclear additional amount. Missing required fields must stay visible; select people explicitly and check the original request. Cancel and Review must save nothing. For expenses check all four split methods and cent remainders; for bills enter each individual/shared charge or credit, then compare the API preview's base, totals, per-member shares and adjustment breakdown with Money. Editing must require a new preview. Confirm once and verify the exact record/actor/time and eligible feed/popups; no payment is processed.

Interrupt each create response, retain the original locked review, and explicitly retry with the same payload/key: exactly one record and creation notification should exist. A later validation rejection after an uncertain save must keep that confirmation locked. Definitive first rejection permits correction. Lose membership or switch account/household/timezone while reading/confirming: old private draft/response must disappear. Open drafts must protect app updates and account switching. Check keyboard focus after edit/review/cancel, 320px/200% zoom, light/dark mode and Android Chrome/iPhone Safari input keyboard/safe areas. Automated DOM/API and isolated rollback database checks do not establish real rendering, production notifications or parallel-request/device acceptance.
