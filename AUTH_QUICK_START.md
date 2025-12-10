# Quick Start Guide - Bearer Token Authentication

This guide will help you quickly integrate bearer token authentication into your components.

## 🚀 Quick Start in 3 Steps

### Step 1: Import the Hook

```tsx
import { useAuth } from '@/hooks/useAuth';
```

### Step 2: Use in Your Component

```tsx
function MyComponent() {
  const { isAuthenticated, ensureSession } = useAuth();
  
  useEffect(() => {
    ensureSession();
  }, [ensureSession]);
  
  // Your component code...
}
```

### Step 3: Make Authenticated Requests

```tsx
import { authenticatedPost } from '@/lib/api';

async function submitData(data: any) {
  const response = await authenticatedPost('/api/endpoint', data);
  return response.json();
}
```

## 📝 Common Use Cases

### Use Case 1: Protect a Page/Component

```tsx
import { useAuth } from '@/hooks/useAuth';

function ProtectedPage() {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Please log in</div>;
  
  return <div>Protected content</div>;
}
```

### Use Case 2: Make an API Call

```tsx
import { authenticatedPost } from '@/lib/api';

async function saveData(data: any) {
  try {
    const response = await authenticatedPost('/api/save', data);
    const result = await response.json();
    console.log('Saved:', result);
  } catch (error) {
    console.error('Failed:', error);
  }
}
```

### Use Case 3: Form Submission

```tsx
import { useAuth } from '@/hooks/useAuth';
import { submitForm } from '@/lib/api';

function MyForm() {
  const { ensureSession } = useAuth();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await ensureSession(); // Ensure token is valid
    
    const response = await submitForm({
      name: 'John',
      email: 'john@example.com'
    });
    
    if (response.ok) {
      alert('Success!');
    }
  };
  
  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Use Case 4: Display User Info

```tsx
import { useAuth } from '@/hooks/useAuth';

function UserInfo() {
  const { user, accessToken, session } = useAuth();
  
  return (
    <div>
      <p>User ID: {user?.id}</p>
      <p>Email: {user?.email || 'Anonymous'}</p>
      <p>Token: {accessToken?.substring(0, 20)}...</p>
      <p>Expires: {new Date(session!.expires_at! * 1000).toLocaleString()}</p>
    </div>
  );
}
```

### Use Case 5: Refresh Token Manually

```tsx
import { useAuth } from '@/hooks/useAuth';

function RefreshButton() {
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const handleRefresh = async () => {
    setLoading(true);
    await refresh();
    setLoading(false);
    alert('Token refreshed!');
  };
  
  return (
    <button onClick={handleRefresh} disabled={loading}>
      {loading ? 'Refreshing...' : 'Refresh Token'}
    </button>
  );
}
```

## 🔧 Advanced Patterns

### Pattern 1: Retry on Failure

```tsx
import { authenticatedFetch } from '@/lib/api';

async function robustFetch(url: string, maxRetries = 3) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await authenticatedFetch(url);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  
  throw lastError;
}
```

### Pattern 2: Parallel Requests

```tsx
import { authenticatedGet } from '@/lib/api';

async function fetchMultiple() {
  const [users, posts, comments] = await Promise.all([
    authenticatedGet('/api/users').then(r => r.json()),
    authenticatedGet('/api/posts').then(r => r.json()),
    authenticatedGet('/api/comments').then(r => r.json()),
  ]);
  
  return { users, posts, comments };
}
```

### Pattern 3: Conditional Authentication

```tsx
import { authenticatedFetch } from '@/lib/api';

async function fetchData(url: string, requireAuth = true) {
  if (requireAuth) {
    return authenticatedFetch(url);
  } else {
    return fetch(url);
  }
}
```

## 🛠️ Utility Functions

### Get Just the Token

```tsx
import { getAccessToken } from '@/lib/auth';

async function logToken() {
  const token = await getAccessToken();
  console.log('Bearer token:', token);
}
```

### Check Session Validity

```tsx
import { isSessionValid } from '@/lib/auth';

async function checkAuth() {
  const valid = await isSessionValid();
  if (!valid) {
    console.log('Session expired!');
  }
}
```

### Get Auth Headers

```tsx
import { getAuthHeaders } from '@/lib/auth';

async function manualFetch() {
  const headers = await getAuthHeaders();
  
  const response = await fetch('/api/endpoint', {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: 'value' })
  });
}
```

## ⚠️ Common Mistakes to Avoid

### ❌ DON'T: Forget to ensure session

```tsx
// BAD
const response = await authenticatedPost('/api/endpoint', data);
```

### ✅ DO: Ensure session first

```tsx
// GOOD
await ensureSession();
const response = await authenticatedPost('/api/endpoint', data);
```

### ❌ DON'T: Manually construct auth headers

```tsx
// BAD
fetch('/api/endpoint', {
  headers: {
    'Authorization': `Bearer ${someToken}`
  }
});
```

### ✅ DO: Use the helper functions

```tsx
// GOOD
const headers = await getAuthHeaders();
fetch('/api/endpoint', { headers });

// OR BETTER
authenticatedFetch('/api/endpoint');
```

### ❌ DON'T: Ignore errors

```tsx
// BAD
await authenticatedPost('/api/endpoint', data);
```

### ✅ DO: Handle errors

```tsx
// GOOD
try {
  await authenticatedPost('/api/endpoint', data);
} catch (error) {
  console.error('Request failed:', error);
  // Handle error appropriately
}
```

## 🔍 Debugging Tips

### 1. Check Console for Session Info

```tsx
import { getSession } from '@/lib/auth';

async function debugSession() {
  const session = await getSession();
  console.log('Session:', session);
  console.log('Token:', session?.access_token);
  console.log('Expires:', new Date(session!.expires_at! * 1000));
}
```

### 2. Inspect Network Requests

Open DevTools → Network tab → Look for:
- `Authorization: Bearer eyJh...` header
- `apikey: your_anon_key` header

### 3. Monitor Auth State Changes

```tsx
import { onAuthStateChange } from '@/lib/auth';

useEffect(() => {
  const unsubscribe = onAuthStateChange((session) => {
    console.log('Auth state changed:', session);
  });
  
  return unsubscribe;
}, []);
```

## 📚 Next Steps

1. **Read the full documentation**: [BEARER_TOKEN_IMPLEMENTATION.md](./BEARER_TOKEN_IMPLEMENTATION.md)
2. **Check examples**: [authentication-examples.tsx](./src/examples/authentication-examples.tsx)
3. **Review existing usage**: 
   - [checkout.ts](./src/lib/checkout.ts)
   - [Form.tsx](./src/pages/Form.tsx)

## 🆘 Getting Help

If you encounter issues:

1. Check browser console for errors
2. Verify environment variables are set
3. Ensure Supabase project allows anonymous sign-ins
4. Check Edge Function logs in Supabase dashboard

## ✅ Checklist

Before deploying, ensure:

- [ ] Environment variables are configured
- [ ] Anonymous auth is enabled in Supabase
- [ ] Edge Functions have CORS configured
- [ ] All API calls use `authenticatedFetch` or similar
- [ ] Error handling is in place
- [ ] Token refresh is working
- [ ] Production keys are secured

---

**Need more help?** See [BEARER_TOKEN_IMPLEMENTATION.md](./BEARER_TOKEN_IMPLEMENTATION.md) for comprehensive documentation.
