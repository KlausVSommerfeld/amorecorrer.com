/**
 * Example implementations demonstrating bearer token authentication
 * These examples show various ways to use the authentication system
 */

import { useAuth } from '@/hooks/useAuth';
import { 
  getSession, 
  getAccessToken, 
  ensureAnonymousSession,
  getAuthHeaders,
  isSessionValid,
  refreshSession 
} from '@/lib/auth';
import { 
  authenticatedFetch, 
  authenticatedPost, 
  authenticatedGet 
} from '@/lib/api';
import { useEffect, useState } from 'react';

// =============================================================================
// EXAMPLE 1: Basic Component with Authentication
// =============================================================================

export function BasicAuthComponent() {
  const { isAuthenticated, isLoading, session, ensureSession } = useAuth();
  
  useEffect(() => {
    // Ensure we have a session when component mounts
    ensureSession();
  }, [ensureSession]);
  
  if (isLoading) {
    return <div>Loading authentication...</div>;
  }
  
  if (!isAuthenticated) {
    return <div>Not authenticated</div>;
  }
  
  return (
    <div>
      <h1>Authenticated!</h1>
      <p>Session ID: {session?.user?.id}</p>
      <p>Token expires: {new Date(session!.expires_at! * 1000).toLocaleString()}</p>
    </div>
  );
}

// =============================================================================
// EXAMPLE 2: Making an Authenticated API Call
// =============================================================================

export function DataFetchComponent() {
  const [data, setData] = useState(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { ensureSession } = useAuth();
  
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Ensure session before making request
      await ensureSession();
      
      // Make authenticated request
      const response = await authenticatedGet('/api/data');
      
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      <button onClick={fetchData} disabled={loading}>
        {loading ? 'Loading...' : 'Fetch Data'}
      </button>
      
      {error && <div className="error">{error}</div>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

// =============================================================================
// EXAMPLE 3: Form Submission with Authentication
// =============================================================================

export function AuthenticatedFormComponent() {
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { ensureSession } = useAuth();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    
    try {
      // Ensure session is valid
      await ensureSession();
      
      // Submit form with authentication
      const response = await authenticatedPost('/api/submit', formData);
      
      if (!response.ok) {
        throw new Error('Submission failed');
      }
      
      const data = await response.json();
      setResult('Success: ' + JSON.stringify(data));
    } catch (error) {
      setResult('Error: ' + (error instanceof Error ? error.message : 'Unknown'));
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={formData.name}
        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
        placeholder="Name"
      />
      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
        placeholder="Email"
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
      
      {result && <div>{result}</div>}
    </form>
  );
}

// =============================================================================
// EXAMPLE 4: Manual Token Handling
// =============================================================================

export async function manualTokenExample() {
  // Get the current session
  const session = await getSession();
  console.log('Current session:', session);
  
  // Get just the access token
  const token = await getAccessToken();
  console.log('Access token:', token);
  
  // Check if session is valid
  const valid = await isSessionValid();
  console.log('Session valid:', valid);
  
  // If not valid, refresh it
  if (!valid) {
    const newSession = await refreshSession();
    console.log('Refreshed session:', newSession);
  }
  
  // Get auth headers ready to use
  const headers = await getAuthHeaders();
  console.log('Auth headers:', headers);
  
  // Use the headers in a fetch call
  const response = await fetch('https://api.example.com/endpoint', {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: 'value' })
  });
  
  return response.json();
}

// =============================================================================
// EXAMPLE 5: Protected Route Component
// =============================================================================

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, ensureSession } = useAuth();
  const [checking, setChecking] = useState(true);
  
  useEffect(() => {
    const check = async () => {
      await ensureSession();
      setChecking(false);
    };
    
    check();
  }, [ensureSession]);
  
  if (isLoading || checking) {
    return <div>Verifying authentication...</div>;
  }
  
  if (!isAuthenticated) {
    return <div>Access denied. Please authenticate.</div>;
  }
  
  return <>{children}</>;
}

// Usage:
// <ProtectedRoute>
//   <MySecretComponent />
// </ProtectedRoute>

// =============================================================================
// EXAMPLE 6: Displaying Token Information
// =============================================================================

export function TokenInfoComponent() {
  const { session, accessToken, user, refresh } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  
  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };
  
  if (!session) {
    return <div>No active session</div>;
  }
  
  const expiresAt = new Date(session.expires_at! * 1000);
  const now = new Date();
  const timeLeft = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
  
  return (
    <div className="token-info">
      <h3>Session Information</h3>
      
      <div className="info-item">
        <strong>User ID:</strong>
        <code>{user?.id}</code>
      </div>
      
      <div className="info-item">
        <strong>Email:</strong>
        <code>{user?.email || 'Anonymous'}</code>
      </div>
      
      <div className="info-item">
        <strong>Token (first 20 chars):</strong>
        <code>{accessToken?.substring(0, 20)}...</code>
      </div>
      
      <div className="info-item">
        <strong>Expires At:</strong>
        <code>{expiresAt.toLocaleString()}</code>
      </div>
      
      <div className="info-item">
        <strong>Time Remaining:</strong>
        <code>
          {Math.floor(timeLeft / 60)} minutes {timeLeft % 60} seconds
        </code>
      </div>
      
      <button onClick={handleRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing...' : 'Refresh Token'}
      </button>
    </div>
  );
}

// =============================================================================
// EXAMPLE 7: Custom Fetch with Retry Logic
// =============================================================================

export async function customAuthenticatedFetch(
  url: string,
  options: RequestInit = {},
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Ensure session is valid
      await ensureAnonymousSession();
      
      // Get auth headers
      const headers = await getAuthHeaders();
      
      // Make request
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      });
      
      // If 401, refresh and retry
      if (response.status === 401 && attempt < maxRetries - 1) {
        console.log(`Attempt ${attempt + 1}: Got 401, refreshing session...`);
        await refreshSession();
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (attempt < maxRetries - 1) {
        console.log(`Attempt ${attempt + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

// =============================================================================
// EXAMPLE 8: Webhook-style Background Request
// =============================================================================

export async function sendBackgroundRequest(data: Record<string, unknown>) {
  try {
    // Ensure we have authentication
    await ensureAnonymousSession();
    
    // Get headers
    const headers = await getAuthHeaders();
    
    // Send request without waiting for response
    // (useful for fire-and-forget scenarios)
    fetch('https://api.example.com/webhook', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      keepalive: true, // Ensures request completes even if page is closed
    }).catch(error => {
      console.error('Background request failed:', error);
    });
    
    return true;
  } catch (error) {
    console.error('Failed to send background request:', error);
    return false;
  }
}

// =============================================================================
// EXAMPLE 9: Polling with Authentication
// =============================================================================

export function PollingComponent() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [polling, setPolling] = useState(false);
  const { ensureSession } = useAuth();
  
  useEffect(() => {
    if (!polling) return;
    
    const poll = async () => {
      try {
        await ensureSession();
        const response = await authenticatedGet('/api/status');
        
        if (response.ok) {
          const result = await response.json();
          setData(result);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };
    
    // Initial poll
    poll();
    
    // Poll every 5 seconds
    const interval = setInterval(poll, 5000);
    
    return () => clearInterval(interval);
  }, [polling, ensureSession]);
  
  return (
    <div>
      <button onClick={() => setPolling(!polling)}>
        {polling ? 'Stop Polling' : 'Start Polling'}
      </button>
      
      {data && (
        <div>
          <h3>Latest Status:</h3>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// EXAMPLE 10: File Upload with Authentication
// =============================================================================

export function FileUploadComponent() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { ensureSession } = useAuth();
  
  const handleUpload = async () => {
    if (!file) return;
    
    setUploading(true);
    setProgress(0);
    
    try {
      await ensureSession();
      const token = await getAccessToken();
      
      const formData = new FormData();
      formData.append('file', file);
      
      const xhr = new XMLHttpRequest();
      
      // Track progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setProgress((e.loaded / e.total) * 100);
        }
      });
      
      // Handle completion
      await new Promise((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve(xhr.response);
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });
        
        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });
        
        xhr.open('POST', '/api/upload');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });
      
      alert('Upload complete!');
    } catch (error) {
      alert('Upload failed: ' + (error instanceof Error ? error.message : 'Unknown'));
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div>
      <input
        title="Selecione o arquivo:" 
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      
      <button onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? 'Uploading...' : 'Upload'}
      </button>
      
      {uploading && (
        <div>
          <div>Progress: {progress.toFixed(0)}%</div>
          <div className="progress-bar">
            <div style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
