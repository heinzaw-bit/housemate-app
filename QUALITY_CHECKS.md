# Web release quality checks

Target platforms: **Android Chrome and iPhone Safari**, selected by the user. Implementation and automated checks are complete; the actual-device and signed-in rendered checks below remain pending as of 2026-09-30.

## Assistant acceptance (questions and first action release)

Check the chat box appears before all suggestions/results, the retained mascot and only three small shortcuts (overview, meals, personal balance). After two questions, the newest answer should be directly below the composer and earlier answers should be collapsed until opened. Verify record expansion makes no extra API call. “Plan a meal” must preserve the selected household and open its normal creation form; “Calculate a split” must open expense creation and require an API preview and explicit confirmation. Neither link saves a record on navigation.

Check cancellation, source links, timestamps/list-limit notices and clearing answers while preserving typed input/focus. Change households/accounts during a pending question; no old answer should appear. Check narrow layouts, keyboard/safe areas, zoom, dark mode, keyboard focus and Ctrl/Command + Enter with and without consent. Enter alone remains a newline. The composer should stay in normal flow without covering content, and there should be no automatic scroll away from the chat box. Consent appears when typing and remains required before general questions reach Gemini; local draft commands do not need it. Rendered phone acceptance remains pending.

Free text requires the API's private Gemini key, free-tier confirmation and migration 016. Verify a general question cannot reach Gemini until the privacy checkbox is selected and consent/input reset on household/account change. Check a personal balance against Money, cooking today across a UTC/household date boundary and an unsupported write or per-member bill-payment question. Known member names/emails, numbers, links and credential markers must be rejected before Google receives a question; use Money for named balances. Simulate provider failure and a limit response; input must remain and quick questions must still work, with no automatic retries or household writes. A benign live-provider classification passed; authenticated end-to-end and phone acceptance remain pending.

### Meal and announcement draft acceptance (manual checks pending)

Try “Plan dinner tomorrow at 7pm” without Gemini consent, including when provider setup is disabled. Verify the draft uses the selected household timezone, requires a response deadline and shows editable participants. Try a bare “7”, a relative “next Friday”, multiple commands and a named/limited audience: no guessing or provider fallback. Send “Announce that dinner is ready”, change title/message, priority, acknowledgement, expiry and recipients. Review and Edit/Cancel must create no record. Confirm once: verify the actual House record, author/time, audience, response/acknowledgement behavior and normal feed/popups for eligible recipients; web push depends on configured transport/devices.

Interrupt the confirmation response. The result stays Not yet confirmed; editing/cancelling that attempt is locked and manual retry uses the exact original payload/key. Verify one actual record/notification only. Simulate definitive validation errors to correct fields, lost membership to clear private drafts, and household/account changes during preparation/publication to ignore old private responses. Open drafts must block app-update/account-switch reloads. Check keyboard labels/focus after review/cancel, dark mode and phone layouts. Automated tests use mocks and do not establish real publication/notification delivery; signed-in rendered and phone checks remain pending.

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
7. Deliberately reload/leave an open form and check the browser warning where supported. Drafts live in memory; browser termination, section changes, or overriding the warning can discard them. No promise of crash recovery or offline editing is made.

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
