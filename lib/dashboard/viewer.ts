import { cache } from "react";

import { withTimeoutOrNull } from "@/lib/with-timeout";
import { createClient } from "@/utils/supabase/server";

export const getDashboardViewer = cache(async (): Promise<{ userId: string | null }> => {
  try {
    const supabase = await createClient();
    const authResult = await withTimeoutOrNull(supabase.auth.getUser(), 8000);
    const user = authResult?.data.user ?? null;

    return { userId: user?.id ?? null };
  } catch (error) {
    console.error("Failed to resolve dashboard viewer:", error);
    return { userId: null };
  }
});
