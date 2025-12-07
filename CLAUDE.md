# HiveSight - Claude Code Notes

## Supabase Admin Access

Use the **secret key** (not the old service_role JWT) for admin operations:

```bash
# Update user credits via REST API
curl -X PATCH "https://xwmpmvtxuubzybmwnswv.supabase.co/rest/v1/profiles?email=eq.USER@EMAIL.COM" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"credit_balance": 10000}'
```

The secret key is in `.env.local` as `SUPABASE_SECRET_KEY` (format: `sb_secret_...`).

Per [Supabase docs](https://supabase.com/docs/guides/api/api-keys), secret keys replace the old `service_role` JWT keys and are easier to rotate.

## Environment

- **Supabase Project**: `xwmpmvtxuubzybmwnswv`
- **URL**: https://xwmpmvtxuubzybmwnswv.supabase.co
- **Dashboard**: https://supabase.com/dashboard/project/xwmpmvtxuubzybmwnswv

## E2E Tests

```bash
pnpm test:e2e          # Public, auth, and API tests
pnpm test:e2e:auth     # Authenticated tests only (requires saved session)
pnpm test:e2e:setup    # Run to save authenticated session (manual login)
```

Auth session stored in `e2e/.auth/user.json` (gitignored).
