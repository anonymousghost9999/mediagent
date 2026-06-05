// Auth middleware disabled — using custom DB-level auth instead of Supabase Auth.
import { createMiddleware } from '@tanstack/react-start'

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    // Skip all token validation — auth is handled via localStorage session on the client.
    return next({
      context: {
        supabase: null,
        userId: null,
        claims: null,
      },
    })
  },
)
