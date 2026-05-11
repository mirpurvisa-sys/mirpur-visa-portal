import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, Pencil, Trash2, UploadCloud } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { canCreateResource, canDeleteResource, canEditResource, canViewFinance, canViewResource } from "@/lib/permissions";
import { dateValue, nullableText, numberValue, text, today } from "@/lib/erp";

export const dynamic = "force-dynamic";

type StudentKey = "life-skills" | "ielts";
type DbRow = Record<string, any>;

type StudentSearchParams = {
  q?: string;
  new?: string;
  view?: string;
  edit?: string;
};

const STUDENT_CONFIG = {
  "life-skills": {
    model: "life_skills",
    addLabel: "Add Life Skill Student",
    title: "Life Skills",
    dateColumn: "admission_date",
    levelColumn: "level",
  },
  ielts: {
    model: "ielts",
    addLabel: "Add IELTS Student",
    title: "IELTS",
    dateColumn: "joining_date",
    levelColumn: "category",
  },
} as const;

export async function StudentModulePage({ activeKey, searchParams }: { activeKey: StudentKey; searchParams: Promise<StudentSearchParams> }) {
  const user = await requireUser();
  const resource = getResource(activeKey);
  if (!resource || !canViewResource(user, activeKey)) return <AccessDenied title={STUDENT_CONFIG[activeKey].title} />;

  const canCreate = canCreateResource(user, resource);
  const canEdit = canEditResource(user, resource);
  const canDelete = canDeleteResource(user, resource);
  const showFinance = canViewFinance(user);
  const params = await searchParams;
  const query = textFromValue(params.q, "");
  const viewId = Number(params.view || 0);
  const editId = Number(params.edit || 0);

  const [students, viewStudent, editStudent] = await Promise.all([
    getStudents(activeKey, query),
    viewId > 0 ? getStudent(activeKey, viewId) : Promise.resolve(null),
    editId > 0 ? getStudent(activeKey, editId) : Promise.resolve(null),
  ]);

  async function createStudent(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource(activeKey);
    if (!currentResource || !canCreateResource(currentUser, currentResource)) throw new Error("You do not have permission to create students.");

    if (activeKey === "life-skills") {
      await createLifeSkill(formData, canViewFinance(currentUser));
    } else {
      await createIeltsStudent(formData, canViewFinance(currentUser));
    }

    redirect(`/admin/${activeKey}`);
  }

  async function updateStudent(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource(activeKey);
    if (!currentResource || !canEditResource(currentUser, currentResource)) throw new Error("You do not have permission to update students.");

    const id = numberValue(formData, "id");
    const currentCanViewFinance = canViewFinance(currentUser);
    const existing = currentCanViewFinance ? null : await getStudent(activeKey, id);

    if (activeKey === "life-skills") {
      await updateLifeSkill(id, formData, currentCanViewFinance, Number(existing?.fee || 0));
    } else {
      await updateIeltsStudent(id, formData, currentCanViewFinance, Number(existing?.fee || 0));
    }

    redirect(`/admin/${activeKey}`);
  }

  async function deleteStudent(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource(activeKey);
    if (!currentResource || !canDeleteResource(currentUser, currentResource)) throw new Error("You do not have permission to delete students.");

    await getDb().query(`DELETE FROM "${STUDENT_CONFIG[activeKey].model}" WHERE id=$1`, [numberValue(formData, "id")]);
    redirect(`/admin/${activeKey}`);
  }

  return <>
    <div className="workflowGrid">
      <Link className={`workflowCard ${activeKey === "life-skills" ? "active" : ""}`} href="/admin/life-skills"><strong>Life Skills</strong><span>Life skills students</span></Link>
      <Link className={`workflowCard ${activeKey === "ielts" ? "active" : ""}`} href="/admin/ielts"><strong>IELTS</strong><span>IELTS students</span></Link>
    </div>

    <div className="appointmentTopActions">
      {canCreate ? <Link className="btn btnPrimary" href={`/admin/${activeKey}?new=student`}>{STUDENT_CONFIG[activeKey].addLabel}</Link> : null}
    </div>

    {canCreate && params.new === "student" ? <StudentFormModal activeKey={activeKey} action={createStudent} showFinance={showFinance} /> : null}
    {canEdit && editStudent ? <StudentFormModal activeKey={activeKey} action={updateStudent} row={editStudent} showFinance={showFinance} /> : null}
    {viewStudent ? <StudentViewModal activeKey={activeKey} row={viewStudent} /> : null}

    <section className="panel tableWrap studentPanel">
      <table className="table dataTable studentLegacyTable">
        <thead>
          <tr>
            <th>Serial<br />#</th>
            <th>Profile</th>
            <th>Name</th>
            <th>Phone No</th>
            <th>Email</th>
            <th>Address</th>
            <th>Admission<br />Date</th>
            <th>Level</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {students.length === 0 ? <tr><td colSpan={9} className="emptyState">No data available in table</td></tr> : students.map((student, index) => (
            <tr key={student.id}>
              <td>{index + 1}</td>
              <td><img className="tableAvatar" src="/avatar.svg" alt="" /></td>
              <td>{student.name}</td>
              <td>{student.phone}</td>
              <td>{student.email}</td>
              <td>{student.address}</td>
              <td>{displayDate(student[STUDENT_CONFIG[activeKey].dateColumn])}</td>
              <td>{studentLevel(activeKey, student)}</td>
              <td>
                <div className="actionStack vertical">
                  <Link className="actionBtn view" href={`/admin/${activeKey}?view=${student.id}`} aria-label="View student"><Eye size={18} /></Link>
                  {canEdit ? <Link className="actionBtn edit" href={`/admin/${activeKey}?edit=${student.id}`} aria-label="Edit student"><Pencil size={18} /></Link> : null}
                  {canDelete ? <form action={deleteStudent}><input type="hidden" name="id" value={student.id} /><button className="actionBtn delete" aria-label="Delete student"><Trash2 size={18} /></button></form> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </>;
}

async function getStudents(activeKey: StudentKey, query: string) {
  const config = STUDENT_CONFIG[activeKey];
  const values: unknown[] = [];
  let where = "";
  if (query) {
    values.push(`%${query}%`);
    where = `
      WHERE name ILIKE $1
         OR email ILIKE $1
         OR phone ILIKE $1
         OR cnic ILIKE $1
         OR address ILIKE $1
         OR ${config.levelColumn} ILIKE $1
    `;
  }

  const result = await getDb().query(`SELECT * FROM "${config.model}" ${where} ORDER BY id ASC LIMIT 80`, values);
  return result.rows as DbRow[];
}

async function getStudent(activeKey: StudentKey, id: number) {
  const result = await getDb().query(`SELECT * FROM "${STUDENT_CONFIG[activeKey].model}" WHERE id=$1 LIMIT 1`, [id]);
  return (result.rows[0] as DbRow | undefined) ?? null;
}

async function createLifeSkill(formData: FormData, showFinance: boolean) {
  await getDb().query(
    `
      INSERT INTO "life_skills" (
        name, email, phone, cnic, gender, avatar, address, admission_date, level, fee,
        test_dates, results, cefr, remarks, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
    `,
    lifeSkillValues(formData, showFinance),
  );
}

async function updateLifeSkill(id: number, formData: FormData, showFinance: boolean, existingFee: number) {
  await getDb().query(
    `
      UPDATE "life_skills"
      SET name=$1, email=$2, phone=$3, cnic=$4, gender=$5, avatar=$6, address=$7,
          admission_date=$8, level=$9, fee=$10, test_dates=$11, results=$12,
          cefr=$13, remarks=$14, updated_at=NOW()
      WHERE id=$15
    `,
    [...lifeSkillValues(formData, showFinance, existingFee), id],
  );
}

function lifeSkillValues(formData: FormData, showFinance: boolean, existingFee = 0) {
  return [
    text(formData, "name"),
    text(formData, "email"),
    text(formData, "phone"),
    text(formData, "cnic"),
    text(formData, "gender", "Male"),
    text(formData, "avatar", "user.jpg"),
    text(formData, "address", "-"),
    dateValue(formData, "admission_date"),
    text(formData, "level", "Beginner"),
    showFinance ? numberValue(formData, "fee") : existingFee,
    nullableText(formData, "test_dates"),
    nullableText(formData, "results"),
    nullableText(formData, "cefr"),
    nullableText(formData, "remarks"),
  ];
}

async function createIeltsStudent(formData: FormData, showFinance: boolean) {
  await getDb().query(
    `
      INSERT INTO "ielts" (
        name, email, phone, cnic, gender, avatar, address, band_required, country,
        category, a_result, fee, joining_date, ending_date, listening, reading,
        writing, speaking, overall, cefr, remarks, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),NOW())
    `,
    ieltsValues(formData, showFinance),
  );
}

async function updateIeltsStudent(id: number, formData: FormData, showFinance: boolean, existingFee: number) {
  await getDb().query(
    `
      UPDATE "ielts"
      SET name=$1, email=$2, phone=$3, cnic=$4, gender=$5, avatar=$6, address=$7,
          band_required=$8, country=$9, category=$10, a_result=$11, fee=$12,
          joining_date=$13, ending_date=$14, listening=$15, reading=$16,
          writing=$17, speaking=$18, overall=$19, cefr=$20, remarks=$21,
          updated_at=NOW()
      WHERE id=$22
    `,
    [...ieltsValues(formData, showFinance, existingFee), id],
  );
}

function ieltsValues(formData: FormData, showFinance: boolean, existingFee = 0) {
  return [
    text(formData, "name"),
    text(formData, "email"),
    text(formData, "phone"),
    text(formData, "cnic"),
    text(formData, "gender", "Male"),
    text(formData, "avatar", "user.jpg"),
    text(formData, "address", "-"),
    text(formData, "band_required", "6.0"),
    text(formData, "country", "-"),
    text(formData, "category", "General"),
    nullableText(formData, "a_result"),
    showFinance ? numberValue(formData, "fee") : existingFee,
    dateValue(formData, "joining_date"),
    nullableText(formData, "ending_date"),
    nullableNumberValue(formData, "listening"),
    nullableNumberValue(formData, "reading"),
    nullableNumberValue(formData, "writing"),
    nullableNumberValue(formData, "speaking"),
    nullableNumberValue(formData, "overall"),
    nullableText(formData, "cefr"),
    nullableText(formData, "remarks"),
  ];
}

function StudentFormModal({
  activeKey,
  action,
  row,
  showFinance,
}: {
  activeKey: StudentKey;
  action: (formData: FormData) => Promise<void>;
  row?: DbRow;
  showFinance: boolean;
}) {
  return <div className="modalOverlay">
    <form action={action} className="mvcModal appointmentCreateModal">
      <Link className="modalClose" href={`/admin/${activeKey}`} aria-label="Close">&times;</Link>
      <h2>Student Management</h2>
      <div className="modalDivider" />
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      {activeKey === "life-skills" ? <LifeSkillFields row={row} showFinance={showFinance} /> : <IeltsFields row={row} showFinance={showFinance} />}
      <button className="btn btnPrimary modalSubmit">{row ? "Update" : "Register"}</button>
    </form>
  </div>;
}

function LifeSkillFields({ row, showFinance }: { row?: DbRow; showFinance: boolean }) {
  return <div className="modalGrid">
    <Field name="name" label="Name" defaultValue={row?.name} required />
    <Field name="phone" label="Phone Number" defaultValue={row?.phone} required />
    <Field name="cnic" label="CNIC Number" defaultValue={row?.cnic} placeholder="XXXXX-XXXXXXX-X" required />
    <Field name="email" label="Email" type="email" defaultValue={row?.email} required />
    <RadioGroup name="gender" label="Gender" options={["Male", "Female"]} defaultValue={textFromValue(row?.gender, "Male")} />
    <Field name="admission_date" label="Admission Date" type="date" defaultValue={row?.admission_date || today()} required />
    <Field name="test_dates" label="Test Dates" defaultValue={row?.test_dates} />
    <Select name="level" label="Level" options={["Beginner", "Intermediate", "Advanced"]} defaultValue={row?.level || "Intermediate"} />
    {showFinance ? <Field name="fee" label="Fee" type="number" defaultValue={row?.fee || "0"} required /> : null}
    <Select name="results" label="Results" options={["", "Pending", "Completed", "Passed", "Failed"]} defaultValue={row?.results || ""} />
    <Field name="cefr" label="CEFR Level" defaultValue={row?.cefr} />
    <Field name="remarks" label="Remarks" defaultValue={row?.remarks} />
    <Textarea name="address" label="Address" defaultValue={row?.address} wide />
    <UploadMock />
  </div>;
}

function IeltsFields({ row, showFinance }: { row?: DbRow; showFinance: boolean }) {
  return <div className="modalGrid">
    <Field name="name" label="Name" defaultValue={row?.name} required />
    <Field name="phone" label="Phone Number" defaultValue={row?.phone} required />
    <Field name="cnic" label="CNIC Number" defaultValue={row?.cnic} placeholder="XXXXX-XXXXXXX-X" required />
    <Field name="email" label="Email" type="email" defaultValue={row?.email} required />
    <RadioGroup name="gender" label="Gender" options={["Male", "Female"]} defaultValue={textFromValue(row?.gender, "Male")} />
    <Field name="joining_date" label="Joining Date" type="date" defaultValue={row?.joining_date || today()} required />
    <Field name="ending_date" label="Ending Date" type="date" defaultValue={row?.ending_date} />
    <Field name="category" label="Category" defaultValue={row?.category || "General"} required />
    <Field name="band_required" label="Band Required" defaultValue={row?.band_required || "6.0"} required />
    <Field name="country" label="Country" defaultValue={row?.country} required />
    {showFinance ? <Field name="fee" label="Fee" type="number" defaultValue={row?.fee || "0"} required /> : null}
    <Field name="a_result" label="Result" defaultValue={row?.a_result} />
    <Field name="listening" label="Listening" type="number" defaultValue={row?.listening} />
    <Field name="reading" label="Reading" type="number" defaultValue={row?.reading} />
    <Field name="writing" label="Writing" type="number" defaultValue={row?.writing} />
    <Field name="speaking" label="Speaking" type="number" defaultValue={row?.speaking} />
    <Field name="overall" label="Overall" type="number" defaultValue={row?.overall} />
    <Field name="cefr" label="CEFR" defaultValue={row?.cefr} />
    <Textarea name="remarks" label="Remarks" defaultValue={row?.remarks} />
    <Textarea name="address" label="Address" defaultValue={row?.address} wide />
    <UploadMock />
  </div>;
}

function StudentViewModal({ activeKey, row }: { activeKey: StudentKey; row: DbRow }) {
  return <div className="modalOverlay">
    <div className="mvcModal caseStartModal">
      <Link className="modalClose" href={`/admin/${activeKey}`} aria-label="Close">&times;</Link>
      <h2>Student Detail</h2>
      <div className="modalDivider" />
      <div className="clientDetailModal">
        <img className="profilePhoto" src="/avatar.svg" alt="" />
        <div className="detailGrid">
          <span>Name</span><strong>{row.name || "-"}</strong>
          <span>Phone</span><strong>{row.phone || "-"}</strong>
          <span>Email</span><strong>{row.email || "-"}</strong>
          <span>CNIC</span><strong>{row.cnic || "-"}</strong>
          <span>Address</span><strong>{row.address || "-"}</strong>
          <span>Admission Date</span><strong>{displayDate(row[STUDENT_CONFIG[activeKey].dateColumn])}</strong>
          <span>Level</span><strong>{studentLevel(activeKey, row)}</strong>
        </div>
      </div>
    </div>
  </div>;
}

function Field({
  name,
  label,
  type = "text",
  required,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
}) {
  return <div>
    <label className="label">{label}</label>
    <input className="input" name={name} type={type} required={required} defaultValue={inputValue(defaultValue)} placeholder={placeholder} step={type === "number" ? "0.01" : undefined} />
  </div>;
}

function Textarea({ name, label, defaultValue, wide }: { name: string; label: string; defaultValue?: unknown; wide?: boolean }) {
  return <div style={{gridColumn: wide ? "1 / -1" : undefined}}>
    <label className="label">{label}</label>
    <textarea className="input" name={name} rows={4} defaultValue={inputValue(defaultValue)} />
  </div>;
}

function Select({ name, label, options, defaultValue }: { name: string; label: string; options: string[]; defaultValue?: unknown }) {
  return <div>
    <label className="label">{label}</label>
    <select className="input" name={name} defaultValue={inputValue(defaultValue)}>
      {options.map((option) => <option key={option || "empty"} value={option}>{option || "Select one"}</option>)}
    </select>
  </div>;
}

function RadioGroup({ name, label, options, defaultValue }: { name: string; label: string; options: string[]; defaultValue: string }) {
  return <div>
    <span className="label">{label}</span>
    <div className="radioGroup">
      {options.map((option) => <label key={option}><input type="radio" name={name} value={option} defaultChecked={option.toLowerCase() === defaultValue.toLowerCase()} /> {option}</label>)}
    </div>
  </div>;
}

function UploadMock() {
  return <div>
    <span className="label mutedUploadLabel">Upload Profile Picture</span>
    <div className="uploadMock"><UploadCloud size={44} /><span>Drag and drop a file here<br />or click</span></div>
  </div>;
}

function nullableNumberValue(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) return null;
  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function studentLevel(activeKey: StudentKey, row: DbRow) {
  if (activeKey === "life-skills") return textFromValue(row.level, "-");
  return textFromValue(row.category, textFromValue(row.band_required, "-"));
}

function displayDate(value: unknown) {
  const normalized = inputValue(value);
  return normalized ? normalized.slice(0, 10) : "-";
}

function inputValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return String(value);
}

function textFromValue(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function AccessDenied({ title }: { title: string }) {
  return <div className="panel"><h1>{title}</h1><p className="muted">You do not have permission to access students.</p></div>;
}
