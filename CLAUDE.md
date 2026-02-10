# HiveSight - Claude Code Notes

## Supabase Admin Access

Use the **service_role key** for admin operations:

```bash
# Update user credits via REST API
curl -X PATCH "https://nbtaqmnxvwftbooxjhnd.supabase.co/rest/v1/profiles?email=eq.USER@EMAIL.COM" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"credit_balance": 10000}'
```

The service_role key is in `.env.local` as `SUPABASE_SECRET_KEY`.

## Environment

- **Supabase Project**: `nbtaqmnxvwftbooxjhnd`
- **URL**: https://nbtaqmnxvwftbooxjhnd.supabase.co
- **Dashboard**: https://supabase.com/dashboard/project/nbtaqmnxvwftbooxjhnd
- **DB Password**: stored locally (check session notes)

## E2E Tests

```bash
pnpm test:e2e          # Public, auth, and API tests
pnpm test:e2e:auth     # Authenticated tests only (requires saved session)
pnpm test:e2e:setup    # Run to save authenticated session (manual login)
```

Auth session stored in `e2e/.auth/user.json` (gitignored).
