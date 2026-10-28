// Callers supply fixed SQL field expressions; all user text stays in parameters.
export function buildRecordSearch(query: string, fields: string[], identifiers: string[] = []) {
  const values: string[] = [];
  const input = query.trim();
  const numeric = (value: string) => /\d/.test(value) && /^[\d+()./#\-\s]+$/.test(value);
  const terms = numeric(input) ? [input] : input.split(/\s+/).filter(Boolean);
  const conditions = terms.map((term) => {
    values.push(`%${term.replace(/[\\%_]/g, "\\$&")}%`);
    const parameter = `$${values.length}`;
    const matches = fields.map((field) => `COALESCE(${field}::text,'') ILIKE ${parameter} ESCAPE E'\\\\'`);
    if (numeric(term) && identifiers.length) {
      values.push(`%${term.replace(/\D/g, "")}%`);
      matches.push(...identifiers.map((field) => `regexp_replace(COALESCE(${field}::text,''),'[^0-9]','','g') LIKE $${values.length}`));
    }
    return `(${matches.join(" OR ")})`;
  });
  return { condition: conditions.join(" AND ") || "TRUE", values };
}

export function studentSearch(query: string, course: "ielts" | "life-skills") {
  return buildRecordSearch(query, ["id", "name", "email", "phone", "cnic", "address", "remarks",
    course === "ielts" ? "category" : "level", course === "ielts" ? "country" : "cefr", course === "ielts" ? "'IELTS'" : "'Life Skills'"], ["id", "phone", "cnic"]);
}
