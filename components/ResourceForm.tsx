import type { Field, Resource } from "@/lib/adminConfig";

export function ResourceForm({ resource, row, action, button }: { resource: Resource; row?: any; action: any; button: string }) {
  const mode = row ? "edit" : "create";

  return <form action={action} className="panel formSection">
    <div className="formGrid">
      {resource.fields.map((field) => {
        const value = row ? row[field.name] : undefined;
        const required = mode === "create"
          ? Boolean(field.required || field.requiredOnCreate)
          : Boolean(field.required && !field.optionalOnEdit);

        if (field.type === "checkbox") {
          return <label key={field.name} style={{display:"flex",alignItems:"center",gap:10,paddingTop:28}}>
            <input type="checkbox" name={field.name} defaultChecked={isChecked(value)} />
            <span className="label" style={{margin:0}}>{field.label || field.name}</span>
          </label>;
        }

        return <div key={field.name} style={{gridColumn:field.type === "textarea" ? "1 / -1" : undefined}}>
          <label className="label">{field.label || field.name}</label>
          {field.type === "textarea" ? (
            <textarea className="input" name={field.name} defaultValue={inputValue(field, value)} rows={4} required={required} />
          ) : (
            <input
              className="input"
              type={inputType(field)}
              name={field.name}
              defaultValue={inputValue(field, value)}
              required={required}
              step={field.step}
              placeholder={field.type === "password" && mode === "edit" ? "Leave blank to keep current password" : undefined}
            />
          )}
        </div>;
      })}
    </div>
    <div style={{display:"flex",gap:10,marginTop:22}}><button className="btn btnPrimary">{button}</button></div>
  </form>;
}

function inputType(field: Field) {
  if (field.type === "datetime") return "datetime-local";
  return field.type || "text";
}

function inputValue(field: Field, value: any) {
  if (field.type === "password") return "";
  if (value === null || value === undefined) return "";

  if (field.type === "date") {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }

  if (field.type === "datetime") {
    if (value instanceof Date) return value.toISOString().slice(0, 16);
    return String(value).replace(" ", "T").slice(0, 16);
  }

  return String(value);
}

function isChecked(value: any) {
  return value === true || value === 1 || value === "1" || value === "true";
}
