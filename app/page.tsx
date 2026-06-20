import { redirect } from "next/navigation";
import App from "@/components/app";
import AccountMenu from "@/components/account-menu";
import { createClient } from "@/lib/supabase/server";

export default async function Main() {
  // Middleware already gates this, but verify here too (defense in depth).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="relative size-full">
      <AccountMenu email={user.email ?? null} />
      <App />
    </div>
  );
}
