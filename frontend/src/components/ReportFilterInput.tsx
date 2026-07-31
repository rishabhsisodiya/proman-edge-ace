"use client";

import { ReportFilters } from "@/lib/ticketing/reports";
import { FIELD_LABEL, PRIORITIES, REGIONS, RENEWAL_STATUSES, RULE_TYPES } from "@/lib/ticketing/report-filter-options";
import { SELECTABLE_SERVICE_TYPES, SERVICE_TYPE_LABEL } from "@/lib/ticketing/types";
import { EQUIP_CATEGORY_LABEL, EquipCategory } from "@/lib/ticketing/equipment-admin";
import SearchMultiSelect, { SearchOption } from "@/components/SearchMultiSelect";

/**
 * One filter input for a given ReportFilters field — shared by the Reports
 * page (on-demand view/export) and the Scheduled Reports form, so a field's
 * rendering (dropdown options, search-multi-select, etc.) never drifts
 * between the two screens.
 */
export default function ReportFilterInput({
  field,
  value,
  onChange,
  asmOptions,
  engineerOptions,
  fetchCustomerOptions,
}: {
  field: keyof ReportFilters;
  value: string;
  onChange: (v: string) => void;
  asmOptions: SearchOption[];
  engineerOptions: SearchOption[];
  fetchCustomerOptions: (query: string) => Promise<SearchOption[]>;
}) {
  const label = FIELD_LABEL[field];
  const base = "h-9 rounded-md border border-line px-3 text-xs text-navy";
  const selectedIds = value ? value.split(",").filter(Boolean) : [];
  const onIdsChange = (ids: string[]) => onChange(ids.join(","));

  if (field === "dateFrom" || field === "dateTo") {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={base} />
      </div>
    );
  }
  if (field === "month") {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
        <input type="month" value={value} onChange={(e) => onChange(e.target.value)} className={base} />
      </div>
    );
  }
  if (field === "region") {
    return <Select label={label} value={value} onChange={onChange} options={REGIONS.map((r) => ({ value: r, label: r }))} />;
  }
  if (field === "serviceType") {
    return (
      <Select
        label={label}
        value={value}
        onChange={onChange}
        options={SELECTABLE_SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABEL[t] }))}
      />
    );
  }
  if (field === "priority") {
    return <Select label={label} value={value} onChange={onChange} options={PRIORITIES.map((p) => ({ value: p, label: p }))} />;
  }
  if (field === "equipmentCategory") {
    return (
      <Select
        label={label}
        value={value}
        onChange={onChange}
        options={(Object.keys(EQUIP_CATEGORY_LABEL) as EquipCategory[]).map((c) => ({ value: c, label: EQUIP_CATEGORY_LABEL[c] }))}
      />
    );
  }
  if (field === "renewalStatus") {
    return <Select label={label} value={value} onChange={onChange} options={RENEWAL_STATUSES.map((s) => ({ value: s, label: s }))} />;
  }
  if (field === "ruleType") {
    return <Select label={label} value={value} onChange={onChange} options={RULE_TYPES.map((r) => ({ value: r, label: r }))} />;
  }
  if (field === "asmId") {
    return <SearchMultiSelect label={label} selected={selectedIds} onChange={onIdsChange} options={asmOptions} placeholder="Search ASM…" />;
  }
  if (field === "engineerId") {
    return (
      <SearchMultiSelect label={label} selected={selectedIds} onChange={onIdsChange} options={engineerOptions} placeholder="Search Engineer…" />
    );
  }
  // customerId — server-side search (customer list can be large), same
  // multi-select chip UI, backed by GET /customers?search=.
  return (
    <SearchMultiSelect label={label} selected={selectedIds} onChange={onIdsChange} fetchOptions={fetchCustomerOptions} placeholder="Search Customer…" />
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border border-line px-2 text-xs text-navy">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
