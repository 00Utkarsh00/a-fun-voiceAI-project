"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface AccountMenuProps {
  email: string | null;
}

/** Small top-right control showing the signed-in user with a sign-out action. */
const AccountMenu: React.FC<AccountMenuProps> = ({ email }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const signOut = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="account-menu">
      {email && (
        <span className="account-email" title={email}>
          {email}
        </span>
      )}
      <button
        type="button"
        className="account-signout"
        onClick={signOut}
        disabled={loading}
        aria-label="Sign out"
      >
        {loading ? <LoaderCircle className="spin" size={15} /> : <LogOut size={15} />}
        <span>Sign out</span>
      </button>
    </div>
  );
};

export default AccountMenu;
