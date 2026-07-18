"use client";

import { useEffect, useState } from "react";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import { AuthUser, getCurrentUser } from "@/lib/auth";

// §10.1 W-28 "My Account" — password change only for now. Active-sessions
// list and MFA setup are deferred (they need the session-list/MFA backend
// work from Days 17-19, which doesn't exist yet).
export default function AccountPage() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <h1 className="mb-1 text-xl font-bold text-navy">My Account</h1>
      {user && (
        <p className="mb-6 text-sm text-muted">
          {user.fullName} · {user.email}
        </p>
      )}

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy">Change password</h2>
      <ChangePasswordForm />
    </div>
  );
}
