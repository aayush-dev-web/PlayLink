# PlayLink

PlayLink is a responsive sports-community application built with React, Vite, and Supabase. Players can discover owner-published venues, events, teams, and player listings; venue owners can manage listings, bookings, schedules, and messages.

## Run locally

```sh
npm install
npm run dev
```

## Venue finder and maps

The player-facing venue finder loads active listings published by venue owners and links out to Google Maps for directions. Venue cards use the owner's uploaded photo when available; otherwise, futsal (and dual-sport) listings use `public/sports/default-futsal.jpg`, and cricket listings use `public/sports/default-cricket.jpg`. The **Nearby Venues** page also includes the suggested Kathmandu Valley futsal/cricket directory in `src/data/venueDirectory.js`; these are directory suggestions, not verified owner listings, and have no live prices, availability, or distance until a map/geocoding service supplies coordinates. Selecting a suggestion centers the embedded map on its name and address, and its name or directions action opens Google Maps routing. No Google Maps API key is required for the current embed/link integration.

## Supabase authentication

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` to your Supabase project URL and **publishable** (or legacy anon) key. These are intended for browser use; never put a Supabase secret/service-role key in a `VITE_` variable. Restart the dev server after changing environment variables.

Enable Email/Password in Supabase Authentication and require email confirmation. Add `http://localhost:5173/dashboard`, `http://localhost:5173/reset-password`, and the corresponding deployed URLs to the Auth redirect allow list. Registration verifies the email with an OTP; login uses email address and password; password recovery sends a link that redirects to `/reset-password`.

For signup OTP emails, update the Supabase **Confirm signup** template to include `{{ .Token }}` and set the email OTP length to 6. If that template instead uses `{{ .ConfirmationURL }}`, Supabase sends a confirmation link; opening it verifies the account and returns the user to `/dashboard` rather than providing a code. The signup screen accepts either verification path and explains the difference. The **Reset password** email template should retain a clickable `{{ .ConfirmationURL }}` link; PlayLink requests that Supabase redirect it to `/reset-password`. Configure production SMTP before using real accounts; Supabase's default mail service is rate-limited.

### Apply the profile schema

Apply the checked-in profile migration and deploy the Edge Function before using account creation with unique usernames or username-based login:

```sh
npx supabase login
npx supabase link --project-ref <project-ref-from-your-supabase-url>
npx supabase db push
```

Alternatively, paste `supabase/migrations/20261003000000_profiles.sql` into the Supabase SQL Editor and run it.

Registration currently offers **Player** and **Venue owner** account types. The app supports email-address/password sign-in, OTP-verified registration, email-link password recovery, Google sign-in, and a session-protected `/dashboard`. The Google sign-in button is always shown; enable the Google provider and configure its client ID and secret in Supabase Authentication before using it. Add the deployed and local `/dashboard` callback URLs to Supabase's redirect allow list. There are no demo accounts or seeded demo listings.

To configure Google sign-in, create a Web OAuth client in Google Cloud Console. Add Supabase's callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI in Google Cloud, then enter the OAuth client ID and secret under **Supabase → Authentication → Providers → Google** and enable the provider. Set the Supabase Site URL and add both `http://localhost:5173/dashboard` and your deployed `/dashboard` URL under **Authentication → URL Configuration → Redirect URLs**. New Google accounts are sent to PlayLink profile completion to choose Player or Venue owner and enter their details. Google verifies the email, and the user sets a password for future email/password sign-ins without an additional OTP step. Apply `supabase/migrations/20261003094000_oauth_profile_username.sql`, `supabase/migrations/20261003095000_optional_oauth_owner_venue.sql`, and `supabase/migrations/20261003100000_google_onboarding.sql` in timestamp order.

Apply `supabase/migrations/20261003095000_optional_oauth_owner_venue.sql` if a Google-created account has owner account metadata but does not include the venue details required by the email registration form. The account can then complete sign-in and add the venue later from its owner dashboard.

### Phase 3: persistent events and match requests

The Events page reads and writes event data through Supabase. Before using it, apply the existing profile migration and then the additive Phase 3 migration:

```sh
npx supabase db push
```

The migration is `supabase/migrations/20261003010000_events_and_match_organization.sql`. It creates `events`, `event_teams`, and `event_join_requests`, with read-only client table grants, RLS, and security-definer RPCs for event creation, requests, approval/rejection, edits, cancellation, completion, and withdrawal. Request approval locks the event row, checks capacity, then updates the request and inserts the team participation within the same database transaction. Capacity status is recalculated by a database trigger.

Only profiles whose database `account_type` is `team_organizer` or `venue_owner` may create events or submit a team request. The migration also removes direct authenticated updates to `profiles.account_type`; users retain update permission for username, display name, and phone. Signup creates the profile role from account metadata through the existing trusted auth-user trigger. Local demo sessions cannot publish events or request to join.

This checkout does not contain a verified venue table or active-venue schema, and the remote REST schema could not be inspected. Phase 3 therefore stores an organizer-entered `location_text`; it does not invent a `venues` foreign key or suggest that event locations are booked. Team participation uses a team name and its organizer's account because this project has no persistent teams or membership model. Membership is not independently verified.

The migration is additive and does not replace unrelated tables. Back up/export event records before any rollback. Prefer a forward-only corrective migration in production; only remove the three new tables after confirming their records are no longer needed and dropping their dependent triggers, policies, and RPC functions. Do not use `CASCADE` against the shared schema.

#### Applying every SQL migration in the Supabase SQL Editor

If you are setting up a new Supabase project manually instead of using `npx supabase db push`, run every checked-in migration below in a separate SQL Editor query, in timestamp order. This installs the profile schema, event discovery and requests, profile enhancements, username/location helpers, saved venue favorites, the venue-owner workspace, and player booking/review workflows:

1. `supabase/migrations/20261003000000_profiles.sql`
2. `supabase/migrations/20261003010000_events_and_match_organization.sql`
3. `supabase/migrations/20261003020000_dashboard_profile_enhancements.sql`
4. `supabase/migrations/20261003030000_profile_username_and_location.sql`
5. `supabase/migrations/20261003040000_venue_favorites.sql`
6. `supabase/migrations/20261003050000_venue_owner_workspace.sql`
7. `supabase/migrations/20261003060000_venue_booking_requests_and_reviews.sql`
8. `supabase/migrations/20261003070000_venue_owner_messaging.sql`
9. `supabase/migrations/20261003080000_owner_venue_signup_profile.sql`
10. `supabase/migrations/20261003090000_admin_dashboard_access.sql`
11. `supabase/migrations/20261003091000_venue_message_reactions.sql`
12. `supabase/migrations/20261003092000_expand_venue_message_reactions.sql`
13. `supabase/migrations/20261003093000_community_listings.sql`
14. `supabase/migrations/20261003094000_oauth_profile_username.sql`
15. `supabase/migrations/20261003095000_optional_oauth_owner_venue.sql`
16. `supabase/migrations/20261003100000_google_onboarding.sql`
17. `supabase/migrations/20261003101000_venue_photo_storage.sql`
18. `supabase/migrations/20261004100000_public_player_avatars.sql`
19. `supabase/migrations/20261004102000_player_direct_messaging.sql`
20. `supabase/migrations/20261004103000_team_invitations_and_group_chat.sql`
21. `supabase/migrations/20261004104000_public_team_requests.sql`
22. `supabase/migrations/20261004105000_team_days_and_invite_player_search.sql`
23. `supabase/migrations/20261004106000_team_join_without_player_listing.sql`
24. `supabase/migrations/20261004107000_team_request_player_profiles.sql`

Open each file in the project, copy its full contents into a new Supabase SQL Editor query, and run it before moving to the next file. Do not run a later migration before its prerequisites, and do not rerun a migration that already succeeded.

### Venue owner workspace

Account creation offers **Player** and **Venue owner**. Venue owners enter their venue profile during signup; `20261003080000_owner_venue_signup_profile.sql` installs the auth trigger that creates the initial venue with the account, including when email confirmation is enabled. On login, PlayLink reads the signed-in user's account type from their profile and sends venue owners to `/owner`; `/dashboard` is role-aware. Sign-in uses the account email address and password. Apply `supabase/migrations/20261003050000_venue_owner_workspace.sql`, `supabase/migrations/20261003060000_venue_booking_requests_and_reviews.sql`, `supabase/migrations/20261003070000_venue_owner_messaging.sql`, and `supabase/migrations/20261003080000_owner_venue_signup_profile.sql` after the earlier migrations. Active owner listings appear on the player Venues page; players can request a date and time range, then view whether the owner accepts or rejects it. Requests are private to the player and venue owner under row-level security. Owners can create/edit venue details, add weekly time slots, manually record bookings, accept/reject player requests, mark an accepted booking completed after play, and set hourly prices. When the owner workspace is open, its bell notification panel checks for new player requests every 15 seconds and links directly to bookings. This is an in-app notification; email and browser push notifications are not configured.

For player-to-owner chat, apply `supabase/migrations/20261003070000_venue_owner_messaging.sql`, `supabase/migrations/20261003091000_venue_message_reactions.sql`, and `supabase/migrations/20261003092000_expand_venue_message_reactions.sql` in order. Players open **Message owner** from an active owner-listed venue to start a private conversation. Venue owners can read and reply to all their player conversations from the **Inbox** in the owner sidebar. Conversation, message, and reaction access is limited to participants by row-level security; the inbox refreshes messages every six seconds while open. The composer grows with the message automatically, includes an emoji picker, and supports emoji reactions. Each message has a reaction icon that opens a picker with a wider set of general and sports emojis. Browser-local player and owner demos share demo conversations and reactions only in the same browser.

While signed in to a player or owner dashboard, PlayLink checks for new messages and booking activity every ten seconds and shows an in-app toast when new activity arrives. Red numbered badges (capped at `9+`) remain on Notifications, Messages/Inbox, and Bookings until the relevant panel or page is opened. Player booking status changes are detected on the next dashboard check; opening Messages or the Inbox marks incoming chat notifications as read.

The owner venue form offers the supplied Kathmandu, Lalitpur, and Bhaktapur futsal/cricket directory in `src/data/venueDirectory.js`; choosing an entry fills its sport, district, address, and Google Maps search link. Owners may also enter a venue not in that directory. The directory does not supply booking availability or prices, so owners must provide those. A local-development-only `venueowner` demo previews owner screens with browser-local sample data; it is not a real account. Real owner workspace records are stored in Supabase. Players can submit one star rating and written review per booking only after its accepted booking is marked completed; reviews then appear on the venue listing and in its owner's Reviews page. The local player and owner demos share a browser-local sample venue and booking workspace.

Venue photos are selected directly from the device during venue-owner signup or from **Your Venue** in the owner workspace; no photo URL is needed. JPEG, PNG, and WebP files up to 5 MB are supported, with a local preview before saving. Supabase accounts store photos in the public `playlink-venue-photos` bucket; uploads and changes are restricted to the signed-in venue owner's own storage folder. Existing projects that already applied the earlier migrations should run only the new `supabase/migrations/20261003101000_venue_photo_storage.sql` migration to enable these uploads.

### Admin dashboard

The protected `/admin` dashboard shows profile accounts, owner-listed venues, booking requests, and venue reviews. Admin authorization is held in `public.playlink_admins` and checked by the `is_playlink_admin()` database function and row-level security policies; admin access is never granted from signup metadata or a client-selected role. Apply `supabase/migrations/20261003090000_admin_dashboard_access.sql` after the other migrations. Then create or confirm the intended account in Supabase Auth, find its UUID in **Authentication → Users** (or query `select id, email from auth.users where email = 'your-admin-email';` in the SQL Editor), and explicitly allowlist it from the SQL Editor:

```sql
insert into public.playlink_admins (user_id)
values ('<the-auth-user-uuid>')
on conflict (user_id) do nothing;
```

Sign in with that account and open `/admin`. The dashboard can pause or reactivate venue listings; the other directories are view-only. To revoke admin access, delete only that account's row from `public.playlink_admins`.

### Dashboard profile, location, and avatar setup

Apply `supabase/migrations/20261003020000_dashboard_profile_enhancements.sql` and then `supabase/migrations/20261003030000_profile_username_and_location.sql` after the original profile migration (and after the Phase 3 migration if event notifications should be available). These add editable player details, social profile URLs, private saved coordinates, username availability/suggestion RPCs, the required profile update grants, and the public `playlink-avatars` image bucket. Use `npx supabase db push` for a linked project, or run the migrations in timestamp order in the Supabase SQL Editor.

`/profile` lets a signed-in player update their display name, unique username, profile photo, home area, player bio, sport, position, experience level, and any combination of Instagram/Facebook/TikTok profile URLs. Username checks exclude the current user, while a case-insensitive unique index prevents duplicate usernames including concurrent changes; available alternatives are suggested on conflicts. Usernames identify public PlayLink profiles; sign-in uses the account email. Avatar uploads are limited to JPG, PNG, or WebP and 5 MB for Supabase accounts (2 MB in local demo mode). Only supplied social links are shown as icons. Public avatar files are served from the avatar bucket; profile text and precise saved coordinates remain protected by the existing own-profile RLS policy. The local demo profile is browser-only and cannot check username availability against real PlayLink accounts. If RLS or storage denies changes, check the migration before retrying.

Player-list cards show each listed player's profile avatar. Since profile rows are private, apply the additive `supabase/migrations/20261004100000_public_player_avatars.sql` migration to expose only avatar URLs for active player listings through a restricted RPC; it does not make other profile fields public.

Player profile details have a **Message player** action that opens a private, persistent conversation in the dashboard inbox. Both participants can continue the conversation from **Messages**; row-level security limits access to the two participants. Apply the additive `supabase/migrations/20261004102000_player_direct_messaging.sql` migration to enable player-to-player chats.

Any signed-in player can create a team, optionally search active player listings by username or display name to invite a player during creation, and choose whether the team is public. Any signed-in user can request to join a public recruiting team with open spots; a published player listing is not required. Team owners can edit or delete their teams from the team details view, invite players later from a player profile, make a team public or private, and review public join requests under **Teams → Invitations** or dashboard notifications. Owners can view a restricted profile summary for a pending requester; contact information and private account data are not exposed. Deleting a team also removes its invitations, join requests, memberships, and group chat. Invited players accept or reject invitations there; team owners accept or reject join requests there. Acceptance creates membership and grants group chat access to the team owner and accepted members only. Apply `supabase/migrations/20261004103000_team_invitations_and_group_chat.sql`, then `supabase/migrations/20261004104000_public_team_requests.sql`, followed by `supabase/migrations/20261004105000_team_days_and_invite_player_search.sql`, `supabase/migrations/20261004106000_team_join_without_player_listing.sql`, and `supabase/migrations/20261004107000_team_request_player_profiles.sql`, after the community listings migration. These later migrations add team available-day storage, a restricted username-search RPC, requests without requiring a published player listing, and owner-only profile summaries for pending requesters. If earlier team migrations have already succeeded, run only migrations not yet applied, in timestamp order. In the Supabase SQL Editor, run the full contents of each missing migration as one query.

The dashboard location control requests browser geolocation only after the player selects **Use live location**. The map centers on those coordinates, which are sent to Google Maps for display. Coordinates are reverse-geocoded to a readable place name through OpenStreetMap's Nominatim service; this also sends the opted-in coordinates to that service. **Save location** stores both the place name and coordinates on the player's profile (or in local storage for the demo account). The saved place name appears in the dashboard header and profile basic information, where the player can edit it. Raw coordinates are retained only for map display and directions, not shown as the location label. The notification popover displays persisted event join requests and status changes for events the player requested to join or organizes. It requires the Phase 3 migration and is not a general-purpose notification service.

### Favorite venues

Players can favorite venue cards with the heart control and manage saved places at `/favorite-venues` or from the sidebar link. Favorite changes are stored in local storage for guest and local demo sessions. For Supabase accounts, apply `supabase/migrations/20261003040000_venue_favorites.sql` with `npx supabase db push`; the table stores venue IDs and uses row-level security so each account can only read or change its own favorites. Until venues are backed by a verified database table, these saved IDs refer only to the current sample venue listings.

For a development-only rollback, first export any favorite rows you need, then remove the four policies and drop only `public.venue_favorites`. Do not drop or reset any other shared tables.

## Routes

- `/` — sends signed-in users to their dashboard and signed-out users to sign-in
- `/dashboard` — account dashboard, routed by account type
- `/get-started` — account creation
- `/sign-in` — login
- `/forgot-password` and `/reset-password` — Supabase password recovery
- `/dashboard` — protected, role-aware account dashboard
- `/owner` and `/owner/*` — protected venue-owner dashboard, bookings, weekly schedule, venue details, reviews, and settings (apply the owner workspace migration)
- `/admin` — allowlist-protected platform dashboard (apply the admin access migration and explicitly allowlist the account)
- `/profile` — protected, editable player profile
- `/notifications` — opens the dashboard notification popover
- `/venues` — searchable owner-published venues
- `/favorite-venues` — saved venues and favorite management
- `/events` — database-backed event discovery, creation, and team requests (apply the Phase 3 migration first)
- `/events/:id` — event detail, participation requests, and organizer management
- `/teams` — team discovery and persistent team listings
- `/players` — player discovery and persistent player listings

Venue, event, and community listings load from Supabase after their migrations are applied; until then, the pages show setup errors or empty states rather than fabricated records.

PlayLink brand logos link to `/dashboard`; dashboard sidebar and top-bar notification controls both open the same in-place notification popover.
