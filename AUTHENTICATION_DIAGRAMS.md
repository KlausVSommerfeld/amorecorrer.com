# Bearer Token Authentication - Visual Flow Diagrams

## 🔄 Complete Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USER VISITS WEBSITE                            │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   React App Loads      │
                    │   useAuth() Hook       │
                    └────────────┬───────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   Check Session        │
                    │   localStorage         │
                    └────────┬───────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
    ┌───────────────────┐    ┌───────────────────┐
    │  Session Found    │    │  No Session       │
    │  & Valid          │    │                   │
    └────────┬──────────┘    └────────┬──────────┘
             │                         │
             │                         ▼
             │              ┌──────────────────────┐
             │              │  Create Anonymous    │
             │              │  Session (Supabase)  │
             │              └──────────┬───────────┘
             │                         │
             │                         ▼
             │              ┌──────────────────────┐
             │              │  Generate JWT Token  │
             │              └──────────┬───────────┘
             │                         │
             └─────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  Session Ready         │
                    │  Token Available       │
                    └────────────┬───────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
        ┌───────────────────┐    ┌───────────────────┐
        │  User Action      │    │  Background       │
        │  (Checkout, Form) │    │  Auto-Refresh     │
        └────────┬──────────┘    └───────────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │  getAuthHeaders()          │
    │  - Authorization: Bearer   │
    │  - apikey: anon_key        │
    └────────────┬───────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │  authenticatedFetch()      │
    │  - Inject headers          │
    │  - Make API call           │
    └────────────┬───────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │  Edge Function             │
    │  (create-checkout-session  │
    │   or form-submit)          │
    └────────────┬───────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    ▼                         ▼
┌───────────┐        ┌────────────────┐
│ Success   │        │ 401 Error      │
│ 200 OK    │        │ (Unauthorized) │
└─────┬─────┘        └────────┬───────┘
      │                       │
      │                       ▼
      │            ┌──────────────────┐
      │            │ Auto Refresh     │
      │            │ Session          │
      │            └────────┬─────────┘
      │                     │
      │                     ▼
      │            ┌──────────────────┐
      │            │ Retry Request    │
      │            └────────┬─────────┘
      │                     │
      └─────────────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │  Response Handled          │
    │  UI Updated                │
    └────────────────────────────┘
```

---

## 🔑 Token Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│                     TOKEN LIFECYCLE                          │
└──────────────────────────────────────────────────────────────┘

    ┌───────────────┐
    │  Session      │
    │  Created      │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │  JWT Token    │
    │  Generated    │
    │  Expires: 1h  │
    └───────┬───────┘
            │
            │  Time: 0 min
            │
            ▼
    ┌───────────────────────┐
    │  Token Active         │
    │  Valid for requests   │
    │  ✓ Authorization OK   │
    └───────┬───────────────┘
            │
            │  Time: 30 min
            │
            ▼
    ┌───────────────────────┐
    │  Token Still Valid    │
    │  Continue using       │
    │  ✓ No action needed   │
    └───────┬───────────────┘
            │
            │  Time: 55 min
            │
            ▼
    ┌───────────────────────┐
    │  Token Near Expiry    │
    │  Automatic refresh    │
    │  triggered            │
    └───────┬───────────────┘
            │
            ▼
    ┌───────────────────────┐
    │  refreshSession()     │
    │  called               │
    └───────┬───────────────┘
            │
            ▼
    ┌───────────────────────┐
    │  New Token Generated  │
    │  Fresh 1h validity    │
    │  ✓ Seamless           │
    └───────┬───────────────┘
            │
            │  Cycle repeats
            │
            └─────────┐
                      │
                      ▼
            ┌─────────────────┐
            │  Continuous     │
            │  Operation      │
            └─────────────────┘
```

---

## 🌐 API Request Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   API REQUEST FLOW                          │
└─────────────────────────────────────────────────────────────┘

Component
    │
    │ calls
    ▼
authenticatedPost('/api/endpoint', data)
    │
    │ 1. Check session validity
    ▼
isSessionValid()
    │
    ├──► Valid? ──► Continue
    │
    └──► Invalid? ──► refreshSession() ──► Continue
                      │
                      └──► Failed? ──► ensureAnonymousSession()
    │
    │ 2. Get headers with token
    ▼
getAuthHeaders()
    │
    ├──► Authorization: Bearer eyJhbGc...
    ├──► apikey: your_anon_key
    └──► Content-Type: application/json
    │
    │ 3. Make request
    ▼
fetch(url, { method: 'POST', headers, body })
    │
    │ 4. Wait for response
    ▼
Response
    │
    ├──► 200 OK ──────────────► Return response
    │
    ├──► 401 Unauthorized ────► Retry once
    │                            │
    │                            ├──► refreshSession()
    │                            │
    │                            └──► fetch(url) again
    │
    └──► Other Error ─────────► Throw error
    │
    │ 5. Handle result
    ▼
Component receives response
    │
    └──► Update UI
```

---

## 🔐 Session State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                   SESSION STATE MACHINE                     │
└─────────────────────────────────────────────────────────────┘

                    ┌──────────────┐
                    │   NO SESSION │
                    │   (Initial)  │
                    └──────┬───────┘
                           │
                           │ ensureAnonymousSession()
                           ▼
                    ┌──────────────┐
                    │   CREATING   │
                    │   SESSION    │
                    └──────┬───────┘
                           │
                           │ Success
                           ▼
                    ┌──────────────┐
                    │    ACTIVE    │
                    │   (Valid)    │
                    └──┬─────────┬─┘
                       │         │
            refreshSession()     │ logout()
                       │         │
                       ▼         ▼
                ┌──────────┐  ┌──────────┐
                │REFRESHING│  │ LOGGING  │
                │          │  │   OUT    │
                └────┬─────┘  └────┬─────┘
                     │             │
                     │ Success     │
                     ▼             ▼
                ┌──────────┐  ┌──────────┐
                │  ACTIVE  │  │NO SESSION│
                │ (Renewed)│  │  (End)   │
                └──────────┘  └──────────┘
                     │
                     │ Timeout (1 hour)
                     ▼
                ┌──────────┐
                │ EXPIRED  │
                └────┬─────┘
                     │
                     │ Auto-refresh
                     │ or
                     │ Next request triggers refresh
                     │
                     └──────► Back to REFRESHING
```

---

## 🎯 Component Integration Pattern

```
┌─────────────────────────────────────────────────────────────┐
│            COMPONENT INTEGRATION PATTERN                    │
└─────────────────────────────────────────────────────────────┘

React Component
    │
    │ import { useAuth } from '@/hooks/useAuth'
    │
    ▼
┌───────────────────────────────────────────────────────────┐
│ function MyComponent() {                                  │
│   const {                                                 │
│     isAuthenticated,  ◄── Boolean: is user authenticated │
│     isLoading,        ◄── Boolean: loading state         │
│     session,          ◄── Session object                 │
│     accessToken,      ◄── JWT Bearer token               │
│     user,             ◄── User info                      │
│     ensureSession,    ◄── Function: ensure valid session │
│     refresh,          ◄── Function: manual refresh       │
│     logout            ◄── Function: sign out             │
│   } = useAuth();                                          │
│                                                           │
│   useEffect(() => {                                       │
│     ensureSession(); ◄── Initialize on mount             │
│   }, [ensureSession]);                                    │
│                                                           │
│   if (isLoading) return <Loading />;                      │
│   if (!isAuthenticated) return <NotAuth />;              │
│                                                           │
│   return <div>...</div>;                                  │
│ }                                                         │
└───────────────────────────────────────────────────────────┘
```

---

## 📡 HTTP Request Headers

```
┌─────────────────────────────────────────────────────────────┐
│                 HTTP REQUEST HEADERS                        │
└─────────────────────────────────────────────────────────────┘

Without Authentication:
┌─────────────────────────────────────┐
│ POST /api/endpoint HTTP/1.1         │
│ Host: example.com                   │
│ Content-Type: application/json      │
│                                     │
│ { "data": "value" }                 │
└─────────────────────────────────────┘

With Bearer Token Authentication:
┌─────────────────────────────────────────────────────────┐
│ POST /api/endpoint HTTP/1.1                             │
│ Host: example.supabase.co                               │
│ Content-Type: application/json                          │
│ apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...       │ ◄─ Anon key
│ Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6... │ ◄─ JWT token
│                                                         │
│ { "data": "value" }                                     │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 Error Handling Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   ERROR HANDLING FLOW                       │
└─────────────────────────────────────────────────────────────┘

API Request
    │
    ▼
┌───────────────┐
│ Try Request   │
└───────┬───────┘
        │
        ▼
   Response?
        │
    ├───┴───┬─────────┬─────────┬─────────┐
    │       │         │         │         │
    ▼       ▼         ▼         ▼         ▼
  200 OK  401 Auth  403 Forb  429 Rate  500 Srv
    │       │         │         │         │
    │       │         │         │         │
    │       ▼         │         │         │
    │   ┌──────────┐  │         │         │
    │   │ Refresh  │  │         │         │
    │   │ Session  │  │         │         │
    │   └────┬─────┘  │         │         │
    │        │        │         │         │
    │        ▼        │         │         │
    │   ┌──────────┐  │         │         │
    │   │  Retry   │  │         │         │
    │   │ Request  │  │         │         │
    │   └────┬─────┘  │         │         │
    │        │        │         │         │
    │    ┌───┴───┐    │         │         │
    │    │Success│    │         │         │
    │    │  or   │    │         │         │
    │    │ Fail  │    │         │         │
    │    └───┬───┘    │         │         │
    │        │        │         │         │
    └────────┴────────┴─────────┴─────────┘
             │
             ▼
    ┌────────────────┐
    │ Return Result  │
    │ or Throw Error │
    └────────────────┘
```

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     ARCHITECTURE OVERVIEW                       │
└─────────────────────────────────────────────────────────────────┘

┌────────────────── FRONTEND (React) ─────────────────────┐
│                                                          │
│  ┌──────────────────────────────────────────┐          │
│  │           React Components                │          │
│  │  (Home, Form, Checkout, etc.)            │          │
│  └──────────────────┬───────────────────────┘          │
│                     │ uses                              │
│                     ▼                                   │
│  ┌──────────────────────────────────────────┐          │
│  │         useAuth() Hook                    │          │
│  │  - State management                       │          │
│  │  - Session tracking                       │          │
│  └──────────────────┬───────────────────────┘          │
│                     │ calls                             │
│                     ▼                                   │
│  ┌──────────────────────────────────────────┐          │
│  │      Authentication Utilities             │          │
│  │  (src/lib/auth.ts)                        │          │
│  │  - getSession()                           │          │
│  │  - ensureAnonymousSession()               │          │
│  │  - getAuthHeaders()                       │          │
│  └──────────────────┬───────────────────────┘          │
│                     │ uses                              │
│                     ▼                                   │
│  ┌──────────────────────────────────────────┐          │
│  │       Supabase Client                     │          │
│  │  (@supabase/supabase-js)                  │          │
│  └──────────────────┬───────────────────────┘          │
│                     │                                   │
└─────────────────────┼───────────────────────────────────┘
                      │
                      │ HTTPS + Bearer Token
                      │
                      ▼
┌────────────────── BACKEND (Supabase) ───────────────────┐
│                                                          │
│  ┌──────────────────────────────────────────┐          │
│  │         Edge Functions                    │          │
│  │  - create-checkout-session                │          │
│  │  - form-submit                            │          │
│  └──────────────────┬───────────────────────┘          │
│                     │ validates                         │
│                     ▼                                   │
│  ┌──────────────────────────────────────────┐          │
│  │       Bearer Token Validation             │          │
│  │  (Optional - commented in code)           │          │
│  └──────────────────┬───────────────────────┘          │
│                     │ accesses                          │
│                     ▼                                   │
│  ┌──────────────────────────────────────────┐          │
│  │        Supabase Database                  │          │
│  │  - stripe_sessions                        │          │
│  │  - form_submissions                       │          │
│  └──────────────────────────────────────────┘          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 📊 Data Flow Example: Checkout

```
┌─────────────────────────────────────────────────────────────┐
│              CHECKOUT FLOW WITH AUTHENTICATION              │
└─────────────────────────────────────────────────────────────┘

User clicks "Pay R$ 19,99"
         │
         ▼
┌─────────────────────┐
│ handlePaymentClick()│
│ (Home.tsx)          │
└─────────┬───────────┘
          │ calls
          ▼
┌─────────────────────┐
│ createCheckout()    │
│ (checkout.ts)       │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────────┐
│ ensureAnonymousSession()    │
│ - Check existing session    │
│ - Create if needed          │
│ - Return session with token │
└─────────┬───────────────────┘
          │
          ▼
┌─────────────────────────────┐
│ getAuthHeaders()            │
│ Returns:                    │
│ {                           │
│   "Authorization":          │
│     "Bearer eyJhbGc...",    │
│   "apikey": "eyJhbGc...",   │
│   "Content-Type":           │
│     "application/json"      │
│ }                           │
└─────────┬───────────────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│ fetch(VITE_CREATE_CHECKOUT_URL, {       │
│   method: 'POST',                       │
│   headers: authHeaders,                 │
│   body: JSON.stringify({})              │
│ })                                      │
└─────────┬───────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────┐
│ Edge Function: create-checkout-session   │
│ - Validates request                      │
│ - Creates Stripe session                 │
│ - Generates case_id                      │
│ - Stores in stripe_sessions table        │
│ - Returns checkout URL                   │
└─────────┬────────────────────────────────┘
          │
          ▼
┌─────────────────────────────┐
│ Response:                   │
│ {                           │
│   "url": "https://...",     │
│   "id": "cs_...",           │
│   "case_id": "uuid..."      │
│ }                           │
└─────────┬───────────────────┘
          │
          ▼
┌─────────────────────────────┐
│ window.location.href = url  │
│ Redirect to Stripe          │
└─────────────────────────────┘
```

---

*These diagrams illustrate the complete authentication system implementation.*
*For code examples, see: authentication-examples.tsx*
*For detailed docs, see: BEARER_TOKEN_IMPLEMENTATION.md*
