import { redirect } from "next/navigation"

// The marketing landing page was removed — route the root straight into the product.
// Logged-in users land on the feed; the auth proxy sends logged-out users to /account.
export default function HomePage() {
  redirect("/gekaixing")
}
