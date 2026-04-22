import Papa from "papaparse";

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T)[]): string {
  return Papa.unparse({
    fields: columns as string[],
    data: rows.map((r) => columns.map((c) => r[c] ?? ""))
  });
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}
