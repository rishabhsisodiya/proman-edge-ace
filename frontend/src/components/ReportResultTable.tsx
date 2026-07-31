import { ReportResult } from "@/lib/ticketing/reports";

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
              {result.columns.map((c) => (
                <td key={c.key} className="whitespace-nowrap px-3 py-2 text-navy">
                  {String(row[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
