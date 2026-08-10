import { createClient } from "@/utils/supabase/server";
import PiDemoClient from "@/components/gekaixing/PiDemoClient";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return <PiDemoClient />;
}
