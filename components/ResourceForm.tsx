import type { Resource } from "@/lib/adminConfig";
import { formatValue } from "@/lib/crud";

export function ResourceForm({ resource, row, action, button }: { resource: Resource; row?: any; action: any; button: string }) {
  return <form action={action} className="card" style={{ padding: 22 }}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
      {resource.fields.map((f) => {
        const val = row ? formatValue(row[f.name]) : "";
        return <div key={f.name} style={{gridColumn:f.type === "textarea" ? "1 / -1" : undefined}}>
          <label className="label">{f.label || f.name}</label>
          {f.type === "textarea" ? <textarea className="input" name={f.name} defaultValue={val === "—" ? "" : val} rows={4} required={f.required}/> :
          <input className="input" type={f.type || "text"} name={f.name} defaultValue={val === "—" ? "" : val} required={f.required}/>} 
        </div>
      })}
    </div>
    <div style={{display:"flex",gap:10,marginTop:22}}><button className="btn btnPrimary">{button}</button></div>
  </form>
}
