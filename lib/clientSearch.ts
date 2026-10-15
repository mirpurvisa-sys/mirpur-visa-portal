function validateAlias(alias: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error("Invalid client table alias.");
}

export function clientReferenceSql(alias = "c") {
  validateAlias(alias);
  return "COALESCE(NULLIF(BTRIM(" + alias + ".ref_id), ''), " + alias + ".id::text || '/MVC/2026')";
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function isNumericIdentifier(value: string) {
  return /\d/.test(value) && /^[\d+()./#\-\s]+$/.test(value);
}

/**
 * Search a client or their related records using bound parameters.
 * extraExpressions must be trusted SQL expressions supplied by the caller.
 */
export function buildClientSearch(
  query: string,
  alias = "c",
  startIndex = 1,
  extraExpressions: string[] = [],
): { condition: string; values: string[] } {
  validateAlias(alias);
  if (!Number.isInteger(startIndex) || startIndex < 1) throw new Error("Invalid search parameter offset.");
  const input = query.trim();
  if (!input) return { condition: "", values: [] };

  const prefix = alias + ".";
  const expressions = [
    prefix + "id::text",
    clientReferenceSql(alias),
    prefix + "firstname",
    prefix + "lastname",
    "concat_ws(' ', " + prefix + "firstname, " + prefix + "lastname)",
    ...[
      "cnic", "phone", "phone2", "email", "city", "province", "country",
      "address", "passport_no", "destination_country", "visa_category",
    ].map((field) => prefix + field),
    ...extraExpressions,
  ];
  const values: string[] = [];
  // Keep formatted phone/CNIC numbers together; otherwise every word must
  // match a client detail, allowing full names and combined name/city searches.
  const terms = isNumericIdentifier(input) ? [input] : input.split(/\s+/);
  const conditions = terms.map((term) => {
    values.push("%" + escapeLike(term) + "%");
    const textParameter = "$" + (startIndex + values.length - 1);
    const matches = expressions.map((expression) =>
      "COALESCE((" + expression + ")::text, '') ILIKE " + textParameter + " ESCAPE E'\\\\'",
    );

    // Reference and passport numbers often get copied without their separators.
    // Keep LIKE wildcard characters literal rather than treating them as separators.
    if (/^[a-zA-Z0-9./#()+\-]+$/.test(term) && /[a-zA-Z]/.test(term) && /\d/.test(term)) {
      values.push("%" + term.replace(/[^a-zA-Z0-9]/g, "") + "%");
      const compactParameter = "$" + (startIndex + values.length - 1);
      for (const expression of [clientReferenceSql(alias), prefix + "passport_no"]) {
        matches.push(
          "regexp_replace(COALESCE((" + expression +
          ")::text, ''), '[^a-zA-Z0-9]', '', 'g') ILIKE " + compactParameter,
        );
      }
    }

    if (isNumericIdentifier(term)) {
      const digits = term.replace(/\D/g, "");
      values.push("%" + digits + "%");
      const digitParameter = "$" + (startIndex + values.length - 1);
      matches.push(prefix + "id::text LIKE " + digitParameter);
      for (const field of ["cnic", "phone", "phone2", "passport_no"]) {
        const normalized = "regexp_replace(COALESCE(" + prefix + field + ", ''), '[^0-9]', '', 'g')";
        matches.push(normalized + " LIKE " + digitParameter);
      }

      // Pakistani phone records may store either a local 0 or +92/0092 prefix.
      // Only full-length numbers get this treatment; short partial searches
      // retain their digits so a prefix cannot turn into an empty wildcard.
      if (digits.length >= 10) {
        const subscriber = digits.replace(/^(?:0092|92|0)/, "");
        if (subscriber.length >= 10) {
          values.push("%" + subscriber + "%");
          const phoneParameter = "$" + (startIndex + values.length - 1);
          for (const field of ["phone", "phone2"]) {
            matches.push(
              "regexp_replace(regexp_replace(COALESCE(" + prefix + field +
              ", ''), '[^0-9]', '', 'g'), '^(0092|92|0)', '') LIKE " + phoneParameter,
            );
          }
        }
      }
    }

    return "(" + matches.join(" OR ") + ")";
  });

  return { condition: "(" + conditions.join(" AND ") + ")", values };
}

/** Rank exact identifiers first. recordIdExpression must be a trusted caller-supplied SQL expression. */
export function clientSearchOrderSql(query: string, alias = "c", startIndex = 1, recordIdExpression?: string) {
  validateAlias(alias);
  if (!Number.isInteger(startIndex) || startIndex < 1) throw new Error("Invalid search parameter offset.");
  const input = query.trim();
  if (!input) return "";
  const firstTerm = isNumericIdentifier(input) ? input : input.split(/\s+/)[0];
  const exactPattern = (index: number) =>
    "substring($" + index + "::text FROM 2 FOR char_length($" + index + "::text) - 2)";
  const exactText = exactPattern(startIndex);
  const exact = (expression: string) =>
    "COALESCE((" + expression + ")::text, '') ILIKE " + exactText + " ESCAPE E'\\\\'";
  const idMatches = [exact(alias + ".id::text")];
  const contactMatches = [exact(alias + ".cnic"), exact(alias + ".email")];
  const recordMatches = recordIdExpression ? [exact(recordIdExpression)] : [];

  if (isNumericIdentifier(firstTerm)) {
    const exactDigits = exactPattern(startIndex + 1);
    idMatches.push(alias + ".id::text LIKE " + exactDigits);
    if (recordIdExpression) recordMatches.push(recordIdExpression + " LIKE " + exactDigits);
    for (const field of ["cnic", "phone", "phone2"]) {
      contactMatches.push(
        "regexp_replace(COALESCE(" + alias + "." + field +
        ", ''), '[^0-9]', '', 'g') LIKE " + exactDigits,
      );
    }
  }

  const recordOrder = recordMatches.length ? "WHEN (" + recordMatches.join(" OR ") + ") THEN -1 " : "";
  return "CASE " + recordOrder + "WHEN (" + idMatches.join(" OR ") + ") THEN 0 WHEN " +
    exact(clientReferenceSql(alias)) + " THEN 1 WHEN (" + contactMatches.join(" OR ") + ") THEN 2 ELSE 3 END";
}
