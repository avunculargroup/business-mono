# Authentication Spec — BTS Internal Platform

**Scope:** `apps/web` auth implementation  
**Read alongside:** `docs/web-app-spec.md` · `docs/design-brief.md`

-----

## Approach

Email + password authentication via Supabase Auth. No OAuth, no SSO, no magic links — just a straightforward login form that gets out of the way.

All authenticated users have identical access to everything. RLS policies in `schema.sql` already enforce this (`auth.role() = 'authenticated'` on all tables). No role-based permissions needed at this stage.

-----

## URL Structure

```
/login          → Login page (only unauthenticated route)
/               → Redirects to /login if not authenticated
```

All routes except `/login` require authentication. Unauthenticated requests to any route redirect to `/login?redirect=[original-path]`. After successful login, redirect to the original path (or `/` if none).

-----

## Implementation

### Supabase Auth setup

Use `@supabase/ssr` for cookie-based session management with Next.js App Router. Sessions persist across browser restarts.

```typescript
// packages/db/src/client.ts — already the right place for this
// Server client (server components, server actions, middleware)
import { createServerClient } from '@supabase/ssr'

// Browser client (client components)
import { createBrowserClient } from '@supabase/ssr'
```

### Middleware

`apps/web/middleware.ts` — runs on every request, handles session refresh and route protection.

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Refresh session cookie on every request (required by @supabase/ssr)
  // Redirect to /login if no valid session on protected routes
  // Redirect to / if authenticated user hits /login
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

### Server Action — login

```typescript
'use server'
// apps/web/app/actions/auth.ts

async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  
  const supabase = createServerClient(...)
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  
  if (error) return { error: 'Invalid email or password' }
  redirect('/')
}

async function logout() {
  const supabase = createServerClient(...)
  await supabase.auth.signOut()
  redirect('/login')
}
```

No client-side auth state management needed — the middleware handles everything via cookies.

-----

## Login Page — `/login`

Standalone page, completely outside the AppShell. No sidebar, no header.

### Layout

Centred card on a `--color-bg` background. Single column, vertically centred on the viewport.

```
┌─────────────────────────────────┐
│                                 │
│   [BTS logo mark]               │
│   Bitcoin Treasury Solutions    │
│                                 │
│   ┌─────────────────────────┐   │
│   │  Internal Platform      │   │ ← card
│   │                         │   │
│   │  Email                  │   │
│   │  [input]                │   │
│   │                         │   │
│   │  Password               │   │
│   │  [input]                │   │
│   │                         │   │
│   │  [Sign in ──────────>]  │   │
│   └─────────────────────────┘   │
│                                 │
└─────────────────────────────────┘
```

### Card

- `--color-surface` background, `1px --color-border` border, `12px` radius, `--shadow-md`
- Padding: `32px`
- Width: `400px` fixed, full-width below `480px`

### Logo mark

Above the card (not inside it):

- “BTS” in Playfair Display, weight 700, 24px, `--color-text-primary`
- “Bitcoin Treasury Solutions” in DM Sans, 13px, `--color-text-secondary`, below
- “Internal Platform” as the card’s own heading — DM Sans, weight 600, 16px, `--color-text-primary`, inside the card at top

### Form fields

Standard input spec from `docs/design-brief.md`:

- Email: `type="email"`, label “Email”, autocomplete `email`
- Password: `type="password"`, label “Password”, autocomplete `current-password`
- Both: `36px` height, `--color-border` border, `6px` radius
- Focus: `--color-accent` border + glow

### Submit button

Full width, primary style, height `40px` (large variant), label “Sign in”.

Loading state: button disabled, label changes to “Signing in…” with a small spinner inline.

### Error state

If login fails, show an inline error message between the password field and the submit button:

- DM Sans, 13px, `--color-destructive`
- “Invalid email or password” — do not distinguish between wrong email vs wrong password (security)
- No toast — keep the error in context

### No self-registration

There is no “Sign up” link, “Forgot password” link, or any other flow on this page. Accounts are created directly in the Supabase dashboard. If a founder needs a password reset, they do it via the Supabase dashboard.

This is intentional for a two-person internal tool — no need to build what Supabase already provides in its UI.

-----

## Session & Sign Out

- Sessions are long-lived (Supabase default: 1 hour access token, 1 week refresh token). Founders should not be logged out mid-session.
- “Sign out” link in the sidebar, bottom area, next to the user’s name — ghost style, small. Clicking calls the `logout` server action.
- No “Are you sure?” confirmation on sign out — it’s not destructive.

-----

## Current User in UI

After login, `auth.users` is linked to `team_members` via the same `id`. Load the current user’s `team_members` row once in the root layout and pass it down via context.

```typescript
// apps/web/app/layout.tsx (server component)
const { data: { user } } = await supabase.auth.getUser()
const { data: member } = await supabase
  .from('team_members')
  .select('*')
  .eq('id', user.id)
  .single()
```

Use this `member` record for:

- Displaying name + initials avatar in the sidebar footer
- Defaulting “Assigned to” and “Owner” fields to current user in create forms
- Filtering “My tasks” on the Dashboard

-----

## Notes for Claude Code

- Use `@supabase/ssr` — not the older `@supabase/auth-helpers-nextjs`
- Session refresh must happen in middleware on every request — this is a `@supabase/ssr` requirement, not optional
- Never use `supabase.auth.getSession()` in server code — use `supabase.auth.getUser()` which validates the token with the Supabase server (more secure)
- The `team_members` row must exist for a user before they can use the platform — create it in Supabase dashboard alongside the auth user