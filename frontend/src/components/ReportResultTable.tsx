import { ReportLinkType, ReportResult } from "@/lib/ticketing/reports";

// Client request (2026-08-05) — every ID in a report should be clickable,
// jumping straight to that Ticket/Customer/Equipment/AMC Contract/Item.
// Items use their own itemCode as the route param (Item's primary key),
// everything else uses the DB uuid.
const LINK_ROUTES: Record<ReportLinkType, string> = {
  ticket: "/dashboard/tickets",
  customer: "/dashboard/customers",
  equipment: "/dashboard/admin/equipment",
  amc: "/dashboard/admin/amc-contracts",
  item: "/dashboard/items",
};

export default function ReportResultTable({ result }: { result: ReportResult }) {
  if (result.rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line bg-navy-soft text-left font-bold uppercase tracking-wide text-navy">
            {result.columns.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-3 py-2">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {result.columns.map((c) => {
                const value = String(row[c.key] ?? "");
                const linkId = c.link ? row[`${c.key}__linkId`] : undefined;
                return (
                  <td key={c.key} className="whitespace-nowrap px-3 py-2 text-navy">
                    {c.link && linkId ? (
                      <a
                        href={`${LINK_ROUTES[c.link]}/${encodeURIComponent(String(linkId))}`}
                        className="font-bold text-navy underline hover:text-orange"
                      >
                        {value}
                      </a>
                    ) : (
                      value
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
