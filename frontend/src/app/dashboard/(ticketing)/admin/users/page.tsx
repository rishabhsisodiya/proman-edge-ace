"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { Role, unlockUser } from "@/lib/auth";
import {
  CompanyRef,
  CREATABLE_ROLES,
  createUser,
  listCompanies,
  listUnimportedErpEmployees,
  listUsers,
  ManagedUser,
  resetUserPassword,
  ROLE_LABEL,
  UnimportedErpEmployee,
  updateUser,
} from "@/lib/ticketing/users";
import { Region } from "@/lib/ticketing/types";

const REGIONS: Region[] = ["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL", "BANGLADESH"];

// User Management (2026-07-28) — the first real way to create a User for any
// role other than Admin; previously the only path was the seed script. Admin
// accounts are deliberately out of scope for this screen (client decision).
export default function UserManagementPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [companies, setCompanies] = useState<CompanyRef[]>([]);
  const [unimportedEmployees, setUnimportedEmployees] = useState<UnimportedErpEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);

  function isLocked(u: ManagedUser) {
    return !!u.lockedUntil && new Date(u.lockedUntil) > new Date();
  }

  async function onUnlock(id: string) {
    setUnlockingId(id);
    try {
      await unlockUser(id);
      load();
    } catch {
      setError("Could not unlock this account.");
    } finally {
      setUnlockingId(null);
    }
  }

  function load() {
    setLoading(true);
    setError(null);
    listUsers({
      role: (roleFilter || undefined) as Role | undefined,
      isActive: activeFilter === "" ? undefined : activeFilter === "true",
    })
      .then(setUsers)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load users.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    listCompanies().then(setCompanies).catch(() => {});
    listUnimportedErpEmployees().then(setUnimportedEmployees).catch(() => {});
  }, []);

  useEffect(load, [roleFilter, activeFilter]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  return (
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">User Management</h1>
        <button onClick={() => setShowCreate(true)} className="h-9 rounded-md bg-orange px-4 text-sm font-bold text-navy">
          + Create User
        </button>
      </div>
      <p className="mb-6 text-sm text-muted">
        Create and manage logins for any role except Admin. Deactivating a user or changing their role is blocked
        while they still have open tickets assigned to them as ASM/Engineer — reassign those first.
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="h-9 w-56 rounded-md border border-line px-2 text-sm text-navy placeholder:text-text-disabled"
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-9 rounded-md border border-line px-2 text-sm text-navy">
          <option value="">All roles</option>
          {CREATABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className="h-9 rounded-md border border-line px-2 text-sm text-navy">
          <option value="">Active + Inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <table className="w-full rounded-lg border border-line bg-white text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-center text-muted">
                  No users match these filters.
                </td>
              </tr>
            )}
            {filteredUsers.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-navy">{u.fullName}</td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3 text-navy">{ROLE_LABEL[u.role]}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${u.isActive ? "bg-brand-green-bg text-brand-green" : "bg-navy-soft text-muted"}`}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                    {isLocked(u) && (
                      <span className="rounded-full bg-brand-red-bg px-2.5 py-0.5 text-[10px] font-bold text-brand-red">Locked</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditing(u)} className="mr-3 text-xs font-bold text-navy hover:underline">
                    Edit
                  </button>
                  <button onClick={() => setResetTarget(u)} className="mr-3 text-xs font-bold text-navy hover:underline">
                    Reset Password
                  </button>
                  {isLocked(u) && (
                    <button
                      onClick={() => onUnlock(u.id)}
                      disabled={unlockingId === u.id}
                      className="text-xs font-bold text-brand-red hover:underline disabled:opacity-50"
                    >
                      {unlockingId === u.id ? "Unlocking…" : "Unlock"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <CreateUserModal
          companies={companies}
          unimportedEmployees={unimportedEmployees}
          onClose={() => setShowCreate(false)}
          onDone={() => {
            setShowCreate(false);
            load();
            listUnimportedErpEmployees().then(setUnimportedEmployees).catch(() => {});
          }}
        />
      )}
      {editing && <EditUserModal user={editing} companies={companies} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} onDone={() => setResetTarget(null)} />}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-navy">{title}</h2>
          <button onClick={onClose} className="text-xs text-muted">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Mirrors backend PASSWORD_POLICY_REGEX (auth.service.ts) — client-side
// feedback only, the server still enforces the real rule.
function PasswordChecklist({ password }: { password: string }) {
  const rules = [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter", met: /[a-z]/.test(password) },
    { label: "Number", met: /\d/.test(password) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
  return (
    <ul className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {rules.map((r) => (
        <li key={r.label} className={r.met ? "text-brand-green" : "text-muted"}>
          {r.met ? "✓" : "○"} {r.label}
        </li>
      ))}
    </ul>
  );
}

function RegionPicker({ value, onChange }: { value: Region[]; onChange: (r: Region[]) => void }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {REGIONS.map((r) => (
        <button
          type="button"
          key={r}
          onClick={() => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r])}
          className={`rounded-md px-2.5 py-1 text-xs font-bold ${value.includes(r) ? "bg-orange text-navy" : "border border-line text-muted"}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function CompanyPicker({ companies, value, onChange }: { companies: CompanyRef[]; value: string[]; onChange: (c: string[]) => void }) {
  if (companies.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {companies.map((c) => (
        <button
          type="button"
          key={c.id}
          onClick={() => onChange(value.includes(c.id) ? value.filter((x) => x !== c.id) : [...value, c.id])}
          className={`rounded-md px-2.5 py-1 text-xs font-bold ${value.includes(c.id) ? "bg-orange text-navy" : "border border-line text-muted"}`}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

function CreateUserModal({
  companies,
  unimportedEmployees,
  onClose,
  onDone,
}: {
  companies: CompanyRef[];
  unimportedEmployees: UnimportedErpEmployee[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("CALL_CENTER");
  const [regions, setRegions] = useState<Region[]>([]);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [skillTagsText, setSkillTagsText] = useState("");
  const [engineerLevel, setEngineerLevel] = useState("");
  const [erpEmployeeId, setErpEmployeeId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selecting an ERP Employee prefills name/mobile/email (email only when the
  // ERP record has a login on file) — every field stays editable, this is a
  // suggestion, not a lock (client decision, 2026-07-28).
  function onPickEmployee(employeeId: string) {
    setErpEmployeeId(employeeId);
    const emp = unimportedEmployees.find((e) => e.employeeId === employeeId);
    if (!emp) return;
    setFullName(emp.employeeName);
    if (emp.cellNumber) setMobile(emp.cellNumber);
    if (emp.erpUserId) setEmail(emp.erpUserId);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createUser({
        fullName,
        email,
        password,
        mobile,
        role,
        regions,
        companyIds,
        skillTags: skillTagsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        engineerLevel: engineerLevel || undefined,
        erpEmployeeId: erpEmployeeId || undefined,
      });
      onDone();
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { message?: string }) : null;
      setError(body?.message ?? "Could not create user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Create User" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

        {unimportedEmployees.length > 0 && (
          <div className="rounded-md border border-line bg-navy-tint/30 p-3">
            <label className="mb-1 block text-xs font-bold text-navy">Prefill from ERP Employee (optional)</label>
            <select
              value={erpEmployeeId}
              onChange={(e) => onPickEmployee(e.target.value)}
              className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy"
            >
              <option value="">— Manual entry —</option>
              {unimportedEmployees.map((emp) => (
                <option key={emp.employeeId} value={emp.employeeId}>
                  {emp.employeeId} — {emp.employeeName} — {emp.designation}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted">
              Fills name/mobile/email as a suggestion — every field below stays editable.
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Full name</label>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Email</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Mobile</label>
          <input required value={mobile} onChange={(e) => setMobile(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Initial password</label>
          <input
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8+ chars, upper, lower, number, special char"
            className="mb-2 h-9 w-full rounded-md border border-line px-2 text-sm text-navy"
          />
          <PasswordChecklist password={password} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy">
            {CREATABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Regions</label>
          <RegionPicker value={regions} onChange={setRegions} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Companies</label>
          <CompanyPicker companies={companies} value={companyIds} onChange={setCompanyIds} />
        </div>

        {role === "ENGINEER" && (
          <>
            <div>
              <label className="mb-1 block text-xs font-bold text-navy">Skill tags (comma-separated)</label>
              <input value={skillTagsText} onChange={(e) => setSkillTagsText(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-navy">Engineer level</label>
              <input value={engineerLevel} onChange={(e) => setEngineerLevel(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy" />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-line px-4 text-sm text-navy">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="h-9 rounded-md bg-orange px-4 text-sm font-bold text-navy disabled:opacity-50">
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  companies,
  onClose,
  onDone,
}: {
  user: ManagedUser;
  companies: CompanyRef[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [mobile, setMobile] = useState(user.mobile);
  const [role, setRole] = useState<Role>(user.role);
  const [regions, setRegions] = useState<Region[]>(user.regions.map((r) => r.region));
  const [companyIds, setCompanyIds] = useState<string[]>(user.companies.map((c) => c.company.id));
  const [skillTagsText, setSkillTagsText] = useState(user.skillTags.join(", "));
  const [engineerLevel, setEngineerLevel] = useState(user.engineerLevel ?? "");
  const [isActive, setIsActive] = useState(user.isActive);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await updateUser(user.id, {
        fullName,
        mobile,
        role,
        regions,
        companyIds,
        skillTags: skillTagsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        engineerLevel: engineerLevel || undefined,
        isActive,
      });
      onDone();
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { message?: string }) : null;
      setError(body?.message ?? "Could not update user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Edit ${user.fullName}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Full name</label>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Mobile</label>
          <input required value={mobile} onChange={(e) => setMobile(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy">
            {CREATABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Regions</label>
          <RegionPicker value={regions} onChange={setRegions} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Companies</label>
          <CompanyPicker companies={companies} value={companyIds} onChange={setCompanyIds} />
        </div>

        {role === "ENGINEER" && (
          <>
            <div>
              <label className="mb-1 block text-xs font-bold text-navy">Skill tags (comma-separated)</label>
              <input value={skillTagsText} onChange={(e) => setSkillTagsText(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-navy">Engineer level</label>
              <input value={engineerLevel} onChange={(e) => setEngineerLevel(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy" />
            </div>
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-navy">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-line px-4 text-sm text-navy">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="h-9 rounded-md bg-orange px-4 text-sm font-bold text-navy disabled:opacity-50">
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onDone }: { user: ManagedUser; onClose: () => void; onDone: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await resetUserPassword(user.id, newPassword);
      onDone();
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { message?: string }) : null;
      setError(body?.message ?? "Could not reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Reset password — ${user.fullName}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">New password</label>
          <input
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="8+ chars, upper, lower, number, special char"
            className="mb-2 h-9 w-full rounded-md border border-line px-2 text-sm text-navy"
          />
          <PasswordChecklist password={newPassword} />
        </div>
        <p className="text-xs text-muted">This invalidates the user&apos;s current session and forces a password change on next login.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-line px-4 text-sm text-navy">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="h-9 rounded-md bg-orange px-4 text-sm font-bold text-navy disabled:opacity-50">
            {submitting ? "Resetting…" : "Reset Password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
