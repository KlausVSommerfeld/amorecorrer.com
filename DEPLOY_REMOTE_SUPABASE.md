# 🚀 Deploy to Remote Supabase - Complete Guide

## 📋 Prerequisites

1. **Supabase Account**: Create account at https://supabase.com
2. **Supabase CLI**: Already installed (supabase v2.65.8)
3. **Remote Project**: Create a project in Supabase Dashboard

---

## 🔗 Step 1: Link Your Local Project to Remote

### 1.1 Login to Supabase CLI
```powershell
npx supabase login
```
This will open a browser for authentication.

### 1.2 Get Your Project Reference
Go to your Supabase Dashboard → Project Settings → General and copy your **Project Reference ID** (looks like: `abcdefghijklmnop`)

### 1.3 Link the Project
```powershell
npx supabase link --project-ref YOUR_PROJECT_REF
```

You'll be prompted for:
- Database password (from your Supabase project)
- Confirmation

This creates a `.supabase/` directory with your project config.

---

## 💾 Step 2: Deploy Database Migrations

Your migrations are already in `supabase/migrations/`:
- ✅ 20251130_create_stripe_sessions.sql
- ✅ 20251202_create_trigger_functions.sql
- ✅ 20251209_create_form_submissions.sql
- ✅ 20251210_create_dispatches.sql
- ✅ 20251211_create_dispatch_rpc_functions.sql
- ✅ 20251212_add_dup_guard_trigger.sql
- ✅ 20251213_fix_dup_guard_nullable.sql

### Deploy All Migrations
```powershell
npx supabase db push
```

This will:
- ✅ Apply all migrations in order
- ✅ Create tables, triggers, and functions
- ✅ Show you what was executed

### Verify Migrations (Optional)
```powershell
npx supabase migration list
```

---

## ⚡ Step 3: Deploy Edge Functions

You have 3 edge functions:
- `create-checkout-session/`
- `form-submit/`
- `stripe-webhook/`

### 3.1 Set Environment Variables (Secrets)

**Important**: Edge functions need secrets in remote environment.

```powershell
# Stripe Secret Key
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_51RrARwPyoFJoyBNVJvg5YFp3OVny2JCYJX3cSLYizdyYtU9no8bAHLZiNZw3dNPAmB68S69WEoGSZBlA8gZMlVmm00GsTvODMB

# Pipeline FastAPI URL (HTTPS público — não use localhost das Edge remotas)
npx supabase secrets set DISPATCH_PIPELINE_URL=https://YOUR_PUBLIC_HOST/hooks/dispatch

# HMAC igual ao servidor Express (PIPELINE_HMAC_SECRET) e ao pipeline (.env PYTHON)
npx supabase secrets set DISPATCH_PIPELINE_HMAC_SECRET=YOUR_SHARED_HMAC_HEX_SECRET

# Supabase Service Role Key (from Dashboard → Project Settings → API)
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

**Get Service Role Key**:
1. Go to: Dashboard → Project Settings → API
2. Copy `service_role` key (not the `anon` key)

### 3.2 Deploy Individual Functions
```powershell
# Deploy create-checkout-session
npx supabase functions deploy create-checkout-session

# Deploy form-submit
npx supabase functions deploy form-submit

# Deploy stripe-webhook
npx supabase functions deploy stripe-webhook
```

### 3.3 Deploy All Functions at Once
```powershell
npx supabase functions deploy
```

### 3.4 Verify Deployment
```powershell
npx supabase functions list
```

You should see:
- ✅ create-checkout-session (deployed)
- ✅ form-submit (deployed)
- ✅ stripe-webhook (deployed)

---

## 🔑 Step 4: Configure Frontend Environment Variables

### 4.1 Get Your Remote URLs

From Supabase Dashboard → Project Settings → API:
- **Project URL**: `https://YOUR_PROJECT_REF.supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### 4.2 Update `.env.local` (Root Directory)

```env
# Supabase Remote Configuration
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY

# Edge Function URLs
VITE_CREATE_CHECKOUT_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-checkout-session
VITE_FORM_SUBMIT_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/form-submit
VITE_STRIPE_WEBHOOK_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook

# Stripe Publishable Key (frontend)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
```

### 4.3 Update `.env.production` (For Production Build)

Create `.env.production` with the same values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_CREATE_CHECKOUT_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-checkout-session
VITE_FORM_SUBMIT_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/form-submit
VITE_STRIPE_WEBHOOK_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
```

---

## 🎯 Step 5: Configure CORS (If Needed)

If your frontend is hosted on a different domain, you may need to configure CORS in your edge functions.

### 5.1 Check Edge Function Headers

Your functions should already have CORS headers. Example in `create-checkout-session/index.ts`:

```typescript
return new Response(
  JSON.stringify({ sessionId: session.id }),
  {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
  }
)
```

---

## 🧪 Step 6: Test Your Deployment

### 6.1 Test Edge Functions Directly

```powershell
# Test create-checkout-session
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-checkout-session \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"priceId": "price_YOUR_STRIPE_PRICE_ID"}'
```

### 6.2 Test from Local Frontend

```powershell
# Build with remote env
npm run build

# Preview the build
npm run preview
```

Then:
1. Open http://localhost:4173
2. Click "Pagar R$ 19.99"
3. Should redirect to Stripe Checkout

---

## 📊 Step 7: Monitor & View Logs

### View Edge Function Logs
```powershell
# All logs
npx supabase functions logs

# Specific function
npx supabase functions logs create-checkout-session
```

### Or Via Dashboard
Go to: **Edge Functions** → Select function → **Logs** tab

---

## 🔄 Step 8: Update Workflow

### When You Make Changes:

#### Update Database
```powershell
# Create new migration
npx supabase db diff -f new_migration_name

# Push to remote
npx supabase db push
```

#### Update Edge Functions
```powershell
# Deploy single function
npx supabase functions deploy create-checkout-session

# Or deploy all
npx supabase functions deploy
```

#### Update Secrets
```powershell
npx supabase secrets set SECRET_NAME=new_value
```

---

## 🛡️ Step 9: Security Checklist

### Enable RLS (Row Level Security)

Check your tables in Supabase Dashboard:
1. Go to **Table Editor**
2. Click on each table
3. **Enable RLS** if not already enabled
4. Add policies:

```sql
-- Example: Allow authenticated users to read their own data
CREATE POLICY "Users can view their own submissions" 
ON form_submissions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
```

### Verify API Keys
- ✅ Use `anon` key in frontend
- ✅ Use `service_role` key only in edge functions (server-side)
- ❌ Never expose `service_role` key in frontend

---

## 📝 Quick Reference Commands

```powershell
# Link project
npx supabase link --project-ref YOUR_PROJECT_REF

# Deploy database
npx supabase db push

# List migrations
npx supabase migration list

# Set secrets
npx supabase secrets set KEY=value

# List secrets
npx supabase secrets list

# Deploy functions
npx supabase functions deploy

# View logs
npx supabase functions logs

# List functions
npx supabase functions list

# Unlink (if needed)
npx supabase unlink
```

---

## 🔍 Troubleshooting

### Issue: "Project not linked"
**Solution**: Run `npx supabase link --project-ref YOUR_REF`

### Issue: "Function deploy failed"
**Solution**: Check your secrets are set: `npx supabase secrets list`

### Issue: "Database push failed"
**Solution**: Check your database password or run `npx supabase db reset --remote`

### Issue: "CORS errors in browser"
**Solution**: Verify CORS headers in edge functions and check your domain in `site_url`

---

## 🎉 Success Checklist

- [ ] Project linked: `npx supabase link --project-ref YOUR_REF`
- [ ] Migrations deployed: `npx supabase db push`
- [ ] Secrets set: STRIPE_SECRET_KEY, DISPATCH_PIPELINE_URL, DISPATCH_PIPELINE_HMAC_SECRET, SUPABASE_SERVICE_ROLE_KEY
- [ ] Edge functions deployed: `npx supabase functions deploy`
- [ ] Frontend `.env.local` updated with remote URLs
- [ ] RLS policies enabled on tables
- [ ] Test payment flow works
- [ ] Test form submission works
- [ ] Logs show successful operations

---

## 📚 Additional Resources

- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Database Migrations](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

**Ready to deploy? Start with Step 1!** 🚀
