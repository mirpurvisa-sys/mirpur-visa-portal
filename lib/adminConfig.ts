export type FieldType = "text" | "number" | "date" | "textarea" | "email";
export type Field = { name: string; label?: string; type?: FieldType; required?: boolean };
export type Resource = { key: string; title: string; model: string; searchFields: string[]; columns: string[]; fields: Field[] };

export const resources: Resource[] = [
  { key:"clients", title:"Clients", model:"clients", searchFields:["firstname","lastname","email","phone","cnic","passport_no"], columns:["id","ref_id","firstname","lastname","phone","destination_country","visa_category","created_at"], fields:[
    {name:"ref_id"},{name:"firstname",required:true},{name:"lastname",required:true},{name:"email",type:"email"},{name:"phone",required:true},{name:"phone2"},{name:"cnic"},{name:"gender",required:true},{name:"city"},{name:"province"},{name:"country"},{name:"address",type:"textarea",required:true},{name:"destination_country"},{name:"visa_category"},{name:"passport_no"},{name:"passport_issue",type:"date"},{name:"passport_expiry",type:"date"}
  ]},
  { key:"cases", title:"Client Cases", model:"client_cases", searchFields:["client_name","caseCategory","status","description"], columns:["id","client_id","client_name","caseCategory","total","remaining","status","startDate"], fields:[
    {name:"client_id",type:"number",required:true},{name:"appointment_id",type:"number",required:true},{name:"employee_id",type:"number",required:true},{name:"client_name"},{name:"total",type:"number"},{name:"advance",type:"number",required:true},{name:"remaining",type:"number",required:true},{name:"total_paid",type:"number",required:true},{name:"caseCategory",required:true},{name:"startDate",type:"date",required:true},{name:"endDate",type:"date"},{name:"submitted_on",type:"date"},{name:"travel_dates"},{name:"status"},{name:"description",type:"textarea"}
  ]},
  { key:"appointments", title:"Appointments", model:"appointments", searchFields:["appointmentstatus","category"], columns:["id","client_id","fee","appointmentstatus","category","appointmentdate"], fields:[
    {name:"client_id",type:"number",required:true},{name:"fee",type:"number"},{name:"appointmentstatus"},{name:"category"},{name:"appointmentdate",type:"date"}
  ]},
  { key:"documents", title:"Documents", model:"documents", searchFields:["document","document_type"], columns:["id","client_case_id","document","document_type"], fields:[
    {name:"client_case_id",type:"number",required:true},{name:"document",required:true},{name:"document_type"}
  ]},
  { key:"incomes", title:"Incomes", model:"incomes", searchFields:["Title","IncomesType","Description"], columns:["id","Title","IncomesType","Amount","Date","foreign_id"], fields:[
    {name:"Title",required:true},{name:"IncomesType"},{name:"Amount",type:"number",required:true},{name:"Description",type:"textarea"},{name:"Date",type:"date",required:true},{name:"foreign_id",type:"number"}
  ]},
  { key:"expenses", title:"Expenses", model:"expenses", searchFields:["voucher_no","Title","ExpenseType","Description"], columns:["id","voucher_no","Title","ExpenseType","Amount","Date"], fields:[
    {name:"voucher_no"},{name:"Title",required:true},{name:"ExpenseType"},{name:"Amount",type:"number",required:true},{name:"Description",type:"textarea"},{name:"Date",type:"date",required:true}
  ]},
  { key:"employees", title:"Employees", model:"employees", searchFields:["firstname","lastname","phone","designation"], columns:["id","emp_id","firstname","lastname","phone","designation","salary"], fields:[
    {name:"user_id",type:"number",required:true},{name:"emp_id"},{name:"firstname",required:true},{name:"lastname",required:true},{name:"phone"},{name:"designation"},{name:"joining_date",type:"date"},{name:"city"},{name:"province"},{name:"country"},{name:"address",type:"textarea"},{name:"salary",type:"number"}
  ]},
  { key:"users", title:"Users", model:"users", searchFields:["firstname","lastname","email","phone"], columns:["id","user_type","firstname","lastname","email","phone"], fields:[
    {name:"user_type"},{name:"firstname",required:true},{name:"lastname",required:true},{name:"email",type:"email",required:true},{name:"phone"},{name:"cnic"},{name:"gender"}
  ]},
  { key:"families", title:"Families", model:"families", searchFields:["firstname","lastname","phone","email","relationship"], columns:["id","client_id","firstname","lastname","phone","relationship","destination_country"], fields:[
    {name:"client_id",type:"number",required:true},{name:"self_id",type:"number"},{name:"firstname",required:true},{name:"lastname",required:true},{name:"phone"},{name:"email",type:"email"},{name:"dob",type:"date"},{name:"cnic_no"},{name:"gender"},{name:"visa_category"},{name:"destination_country"},{name:"passport_no"},{name:"passport_issue",type:"date"},{name:"passport_expiry",type:"date"},{name:"relationship"}
  ]},
  { key:"ielts", title:"IELTS", model:"ielts", searchFields:["name","email","phone","cnic","country"], columns:["id","name","phone","band_required","country","fee","overall","joining_date"], fields:[
    {name:"name",required:true},{name:"email",type:"email"},{name:"phone"},{name:"cnic"},{name:"gender"},{name:"address",type:"textarea"},{name:"band_required"},{name:"country"},{name:"category"},{name:"a_result"},{name:"fee",type:"number"},{name:"joining_date",type:"date"},{name:"ending_date",type:"date"},{name:"listening"},{name:"reading"},{name:"writing"},{name:"speaking"},{name:"overall"},{name:"cefr"},{name:"remarks",type:"textarea"}
  ]},
  { key:"life-skills", title:"Life Skills", model:"life_skills", searchFields:["name","email","phone","cnic","level"], columns:["id","name","phone","level","fee","results","admission_date"], fields:[
    {name:"name",required:true},{name:"email",type:"email"},{name:"phone"},{name:"cnic"},{name:"gender"},{name:"address",type:"textarea"},{name:"admission_date",type:"date"},{name:"level"},{name:"fee",type:"number"},{name:"test_dates"},{name:"results"},{name:"cefr"},{name:"remarks",type:"textarea"}
  ]},
  { key:"leads", title:"Client Leads", model:"client_leads", searchFields:["name","email","phone","message"], columns:["id","name","email","phone","created_at"], fields:[{name:"name"},{name:"email",type:"email"},{name:"phone"},{name:"message",type:"textarea"}]},
  { key:"visitors", title:"Visitors", model:"visitors", searchFields:["ip","country","city"], columns:["id","ip","country","city","created_at"], fields:[{name:"ip"},{name:"country"},{name:"city"}]},
  { key:"roles", title:"Roles", model:"roles", searchFields:["name","slug"], columns:["id","name","slug"], fields:[{name:"name",required:true},{name:"slug",required:true}]},
  { key:"permissions", title:"Permissions", model:"permissions", searchFields:["name","slug"], columns:["id","name","slug"], fields:[{name:"name",required:true},{name:"slug",required:true}]}
];

export function getResource(key: string) { return resources.find((r) => r.key === key); }
