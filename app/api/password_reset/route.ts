import { createClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const supabase = await createClient()
  const { email } = await request.json()

  // Use the app's own origin so the reset link points here in dev and prod
  // (must be allowlisted in Supabase -> Authentication -> URL Configuration).
  const origin =
    request.headers.get("origin") ||
    process.env.NEXT_PUBLIC_URL ||
    "http://localhost:3000"

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/update_password`,
  }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  return NextResponse.json({ success: true })
}