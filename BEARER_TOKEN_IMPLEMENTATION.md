# Bearer Token Authentication Implementation

This document describes the bearer token and authentication implementation for the amorecorrer.com project.

## Overview

The project now implements a comprehensive bearer token authentication system using Supabase Auth. This ensures secure API calls between the frontend and Supabase Edge Functions.

## Architecture

### Frontend Components

#### 1. Authentication Utilities (`src/lib/auth.ts`)

Core authentication functions for session management:

- `getSession()` - Retrieves current Supabase session
- `getAccessToken()` - Gets the bearer token (access token)
- `getRefreshToken()` - Gets the refresh token
- `ensureAnonymousSession()` - Creates/retrieves anonymous session
- `refreshSession()` - Refreshes expired session
- `signOut()` - Logs out and clears session
- `getAuthHeaders()` - Generates headers with bearer token
- `onAuthStateChange()` - Listens for auth state changes
- `isSessionValid()` - Checks if session is still valid
- `getCurrentUser()` - Gets user information from session

#### 2. React Hook (`src/hooks/useAuth.tsx`)

React hook for component-level auth state management:

```typescript
const { 
  session, 
  accessToken, 
  isLoading, 
  isAuthenticated, 
  user,
  ensureSession,
  refresh,
  logout,
  checkValidity 
} = useAuth();
```

#### 3. API Utilities (`src/lib/api.ts`)

Helper functions for authenticated API calls:

- `authenticatedFetch()` - Makes authenticated requests with automatic token injection
- `authenticatedPost()` - POST with authentication
- `authenticatedGet()` - GET with authentication
- `submitForm()` - Submit form with auth
- `createCheckoutSession()` - Create checkout with auth
- `assertResponseOk()` - Response validation helper

Features:

- Automatic bearer token injection
- Session validation before requests
- Automatic session refresh on 401
- Retry logic for unauthorized responses

#### 4. Updated Checkout (`src/lib/checkout.ts`)

Now uses bearer token authentication:

```typescript
import { getAuthHeaders, ensureAnonymousSession } from './auth';

export async function createCheckout(): Promise<string | null> {
  await ensureAnonymousSession();
  const headers = await getAuthHeaders();
  
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({})
  });
  // ...
}
```

## Usage Examples

### 1. In a React Component

```tsx
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { isAuthenticated, accessToken, ensureSession } = useAuth();
  
  useEffect(() => {
    // Ensure session on mount
    ensureSession();
  }, []);
  
  if (!isAuthenticated) {
    return <div>Loading...</div>;
  }
  
  return <div>Authenticated with token: {accessToken}</div>;
}
```

### 2. Making Authenticated API Calls

```typescript
import { authenticatedPost } from '@/lib/api';

async function submitData(data: any) {
  try {
    const response = await authenticatedPost('/api/endpoint', data);
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('API error:', error);
    throw error;
  }
}
```

### 3. Manual Authentication

```typescript
import { getAuthHeaders, ensureAnonymousSession } from '@/lib/auth';

async function customRequest() {
  // Ensure we have a session
  await ensureAnonymousSession();
  
  // Get headers with bearer token
  const headers = await getAuthHeaders();
  
  // Make request
  const response = await fetch('https://api.example.com', {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: 'value' })
  });
}
```

## Backend Validation (Edge Functions)

### Current Implementation

The Edge Functions already validate bearer tokens in their headers:

#### create-checkout-session

```typescript
// Receives Authorization header with Bearer token
// Validates using Supabase client with service role
```

#### form-submit

```typescript
// CORS headers allow Authorization
"Access-Control-Allow-Headers": "Content-Type, Authorization"

// Can validate bearer token if needed:
const authHeader = req.headers.get('Authorization');
const token = authHeader?.replace('Bearer ', '');
```

### Recommended Enhancement

To strictly validate bearer tokens on the backend:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2.31.0";

async function validateBearerToken(req: Request) {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid Authorization header' };
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return { valid: false, error: 'Invalid token' };
  }
  
  return { valid: true, user };
}

// In your edge function:
Deno.serve(async (req) => {
  const { valid, error, user } = await validateBearerToken(req);
  
  if (!valid) {
    return new Response(JSON.stringify({ error }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  // Continue with authenticated request...
});
```

## Security Features

### 1. Anonymous Sessions

- Users don't need to register
- Automatic anonymous session creation
- Sessions persist across page reloads

### 2. Token Refresh

- Automatic token refresh before expiry
- Retry logic on 401 responses
- Seamless user experience

### 3. Session Validation

- Check session validity before requests
- Automatic refresh of expired sessions
- Fallback to anonymous session creation

### 4. Secure Headers

- Bearer token in Authorization header
- Supabase anon key in apikey header
- CORS protection on Edge Functions

## Environment Variables

Required in `.env`:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_CREATE_CHECKOUT_URL=your_checkout_function_url
VITE_FORM_SUBMIT_URL=your_form_submit_function_url
```

## Token Flow Diagram

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       │ 1. Load App
       ▼
┌─────────────────────┐
│   useAuth Hook      │
│   - Check session   │
│   - Get token       │
└──────┬──────────────┘
       │
       │ 2. No session?
       ▼
┌─────────────────────┐
│ Create Anonymous    │
│ Session             │
└──────┬──────────────┘
       │
       │ 3. Session ready
       ▼
┌─────────────────────┐
│ User Action         │
│ (e.g., checkout)    │
└──────┬──────────────┘
       │
       │ 4. Get auth headers
       ▼
┌─────────────────────┐
│ API Call            │
│ + Bearer Token      │
│ + apikey            │
└──────┬──────────────┘
       │
       │ 5. Request to Edge Function
       ▼
┌─────────────────────┐
│ Supabase Edge       │
│ Function            │
│ - Validate token    │
│ - Process request   │
└──────┬──────────────┘
       │
       │ 6. Response
       ▼
┌─────────────────────┐
│ Handle Response     │
│ - Success           │
│ - Or 401 -> Refresh │
└─────────────────────┘
```

## Testing

### 1. Test Session Creation

```typescript
import { ensureAnonymousSession } from '@/lib/auth';

async function testSession() {
  const session = await ensureAnonymousSession();
  console.log('Session created:', session);
  console.log('Access token:', session?.access_token);
}
```

### 2. Test API Call

```typescript
import { authenticatedPost } from '@/lib/api';

async function testAPI() {
  try {
    const response = await authenticatedPost('/api/test', { test: 'data' });
    console.log('Response:', await response.json());
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### 3. Inspect Headers

Open browser DevTools → Network tab and check request headers:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
apikey: your_anon_key
Content-Type: application/json
```

## Troubleshooting

### Issue: 401 Unauthorized

**Cause:** Expired or invalid token

**Solution:** The system auto-refreshes. If persistent:

1. Check VITE_SUPABASE_ANON_KEY is correct
2. Verify Supabase project is active
3. Check Edge Function environment variables

### Issue: No session created

**Cause:** Supabase client not initialized

**Solution:**

1. Verify environment variables
2. Check browser console for errors
3. Ensure Supabase project allows anonymous sign-ins

### Issue: CORS errors

**Cause:** Edge Function CORS configuration

**Solution:** Ensure Edge Functions include:

```typescript
"Access-Control-Allow-Origin": allowed_origin,
"Access-Control-Allow-Headers": "Content-Type, Authorization"
```

## Best Practices

1. **Always ensure session before API calls**
  ```typescript
   await ensureSession();
   const response = await authenticatedPost(...);
  ```
2. **Use the provided utilities**
  - Don't manually construct auth headers
  - Use `getAuthHeaders()` for consistency
3. **Handle errors gracefully**
  ```typescript
   try {
     await authenticatedPost(...);
   } catch (error) {
     // Handle error
   }
  ```
4. **Monitor token expiry**
  - The system auto-refreshes
  - Use `isSessionValid()` to check manually
5. **Secure environment variables**
  - Never commit `.env` files
  - Use `.env.example` for templates
  - Rotate keys periodically

## Future Enhancements

1. **User Authentication**
  - Add email/password login
  - Social auth (Google, GitHub)
  - User profile management
2. **Token Revocation**
  - Implement logout on all devices
  - Token blacklisting
3. **Rate Limiting**
  - Token-based rate limits
  - User-specific quotas
4. **Audit Logging**
  - Log all authenticated requests
  - Track token usage
  - Security event monitoring

