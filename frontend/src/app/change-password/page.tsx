"use client";

import ChangePasswordForm from "@/components/ChangePasswordForm";

// Reached from the login page when /auth/login returns mustChangePassword:true
// (§8.2 — forced password change on first login). Not gated further here —
// the change-password call itself requires a valid session cookie, so an
// unauthenticated visit just gets a 401 from the form's submit.
export default function ForcedChangePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-black tracking-wide text-navy">
            PROMAN <span className="text-orange">EDGE</span>
          </h1>
          <p className="mt-1 text-sm text-muted">Set a new password to continue</p>
        </div>
        <ChangePasswordForm forced />
      </div>
    </div>
  );
}
