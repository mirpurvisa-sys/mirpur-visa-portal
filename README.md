# MVC Next.js Admin Panel

A ready Next.js admin panel for your Supabase Postgres database.

## Setup

```powershell
Copy-Item .env.example .env
notepad .env
npm install
npx prisma db pull
npx prisma generate
npm run dev
```

Open:

```txt
http://localhost:3000/admin
```

## Supabase Database

Set `DATABASE_URL` to your Supabase pooler connection string and `DIRECT_URL` to the direct database connection string. You can find both in Supabase under Project Settings > Database > Connection string.

Use `npx prisma db pull` to introspect the existing Supabase tables, then `npx prisma generate` to refresh the Prisma client.

## Included Modules

Dashboard, Clients, Client Cases, Appointments, Documents, Incomes, Expenses, Employees, Users, Families, IELTS, Life Skills, Leads, Visitors, Roles, Permissions.
