import { StudentModulePage } from "../studentModule";

export const dynamic = "force-dynamic";

export default async function LifeSkillsPage({ searchParams }: { searchParams: Promise<{ q?: string; new?: string; view?: string; edit?: string }> }) {
  return <StudentModulePage activeKey="life-skills" searchParams={searchParams} />;
}
