// Auth middleware disabled — using custom DB-level auth instead of Supabase Auth.
import { createMiddleware } from '@tanstack/react-start'

export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    // No bearer token needed — auth is handled via localStorage session.
    return next({ headers: {} })
  },
)
