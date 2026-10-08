type ClientIdentity = {
  email: string | null;
  cnic: string | null;
};

type ClientRow = ClientIdentity & { id: number | string };
type ClientDatabase = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: ClientRow[] }>;
};

export class AppointmentClientConflictError extends Error {
  constructor() {
    super("The email and CNIC do not identify a single existing client.");
    this.name = "AppointmentClientConflictError";
  }
}

export async function resolveAppointmentClient(
  db: ClientDatabase,
  identity: ClientIdentity,
  insertClient: () => Promise<{ rows: Array<{ id: number | string }> }>,
): Promise<number> {
  const email = normalizeEmail(identity.email);
  const cnic = identity.cnic?.trim() || null;

  async function findExistingClient() {
    if (!email && !cnic) return null;

    const result = await db.query(
      `
        SELECT id, email, cnic FROM "clients"
        WHERE ($1::text IS NOT NULL AND lower(trim(email)) = $1)
           OR ($2::text IS NOT NULL AND cnic = $2)
        LIMIT 2
      `,
      [email, cnic],
    );
    if (result.rows.length > 1) throw new AppointmentClientConflictError();

    const client = result.rows[0];
    if (!client) return null;

    const storedEmail = normalizeEmail(client.email);
    const storedCnic = client.cnic?.trim() || null;
    if ((email && storedEmail && email !== storedEmail) || (cnic && storedCnic && cnic !== storedCnic)) {
      throw new AppointmentClientConflictError();
    }

    // Booking an appointment must not overwrite the existing client's details.
    return Number(client.id);
  }

  const existingClientId = await findExistingClient();
  if (existingClientId !== null) return existingClientId;

  const created = await insertClient();
  if (created.rows[0]) return Number(created.rows[0].id);

  // ON CONFLICT may wait for another request's insert. A separate query sees
  // the committed client even when it was absent from our first lookup.
  const concurrentClientId = await findExistingClient();
  if (concurrentClientId !== null) return concurrentClientId;

  throw new Error("Unable to create the client: no matching email or CNIC was found after an insert conflict.");
}

function normalizeEmail(value: string | null) {
  return value?.trim().toLowerCase() || null;
}
