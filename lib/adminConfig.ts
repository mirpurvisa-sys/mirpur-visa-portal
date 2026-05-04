export type FieldType = "text" | "number" | "date" | "datetime" | "textarea" | "email" | "password" | "checkbox";
export type Field = {
  name: string;
  label?: string;
  type?: FieldType;
  required?: boolean;
  requiredOnCreate?: boolean;
  optionalOnEdit?: boolean;
  step?: string;
};
export type Resource = {
  key: string;
  title: string;
  model: string;
  primaryKey: string[];
  searchFields: string[];
  columns: string[];
  fields: Field[];
  autoTimestamps?: {
    createdAt?: boolean;
    updatedAt?: boolean;
  };
};

export const resources: Resource[] = [
  {
    "key": "activity-log",
    "title": "Activity Log",
    "model": "activity_log",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "log_name",
      "description",
      "subject_type",
      "causer_type"
    ],
    "columns": [
      "id",
      "log_name",
      "description",
      "subject_type",
      "subject_id",
      "causer_type",
      "causer_id",
      "created_at"
    ],
    "fields": [
      {
        "name": "log_name",
        "label": "Log Name",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "description",
        "label": "Description",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "subject_type",
        "label": "Subject Type",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "subject_id",
        "label": "Subject Id",
        "type": "number",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "causer_type",
        "label": "Causer Type",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "causer_id",
        "label": "Causer Id",
        "type": "number",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "properties",
        "label": "Properties",
        "type": "textarea",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "appointments",
    "title": "Appointments",
    "model": "appointments",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "appointmentstatus",
      "category"
    ],
    "columns": [
      "id",
      "client_id",
      "fee",
      "appointmentstatus",
      "category",
      "appointmentdate",
      "created_at"
    ],
    "fields": [
      {
        "name": "client_id",
        "label": "Client Id",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "fee",
        "label": "Fee",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "appointmentstatus",
        "label": "Appointmentstatus",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "category",
        "label": "Category",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "appointmentdate",
        "label": "Appointmentdate",
        "type": "datetime",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "case-installments",
    "title": "Case Installments",
    "model": "case_installments",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "name",
      "amount"
    ],
    "columns": [
      "id",
      "client_case_id",
      "name",
      "amount",
      "time",
      "created_at"
    ],
    "fields": [
      {
        "name": "client_case_id",
        "label": "Client Case Id",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "name",
        "label": "Name",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "amount",
        "label": "Amount",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "time",
        "label": "Time",
        "type": "datetime",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "clients",
    "title": "Clients",
    "model": "clients",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "ref_id",
      "firstname",
      "lastname",
      "email",
      "phone",
      "phone2"
    ],
    "columns": [
      "id",
      "ref_id",
      "firstname",
      "lastname",
      "email",
      "epassword",
      "phone",
      "phone2"
    ],
    "fields": [
      {
        "name": "ref_id",
        "label": "Ref Id",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "firstname",
        "label": "Firstname",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "lastname",
        "label": "Lastname",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "email",
        "label": "Email",
        "type": "email",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "epassword",
        "label": "Epassword",
        "type": "password",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "phone",
        "label": "Phone",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "phone2",
        "label": "Phone2",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "cnic",
        "label": "Cnic",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "cnic_issue",
        "label": "Cnic Issue",
        "type": "date",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "cnic_expiry",
        "label": "Cnic Expiry",
        "type": "date",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "gender",
        "label": "Gender",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "avatar",
        "label": "Avatar",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "city",
        "label": "City",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "province",
        "label": "Province",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "country",
        "label": "Country",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "address",
        "label": "Address",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "destination_country",
        "label": "Destination Country",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "visa_category",
        "label": "Visa Category",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "passport_no",
        "label": "Passport No",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "passport_issue",
        "label": "Passport Issue",
        "type": "date",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "passport_expiry",
        "label": "Passport Expiry",
        "type": "date",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "documents",
        "label": "Documents",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "cases",
    "title": "Client Cases",
    "model": "client_cases",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "client_name",
      "caseCategory",
      "travel_dates",
      "docs",
      "documents_note",
      "status"
    ],
    "columns": [
      "id",
      "client_id",
      "appointment_id",
      "employee_id",
      "client_name",
      "total",
      "advance",
      "remaining"
    ],
    "fields": [
      {
        "name": "client_id",
        "label": "Client Id",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "appointment_id",
        "label": "Appointment Id",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "employee_id",
        "label": "Employee Id",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "client_name",
        "label": "Client Name",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "total",
        "label": "Total",
        "type": "number",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "advance",
        "label": "Advance",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "remaining",
        "label": "Remaining",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "total_paid",
        "label": "Total Paid",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "caseCategory",
        "label": "CaseCategory",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "startDate",
        "label": "StartDate",
        "type": "date",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "endDate",
        "label": "EndDate",
        "type": "date",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "submitted_on",
        "label": "Submitted On",
        "type": "date",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "travel_dates",
        "label": "Travel Dates",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "docs",
        "label": "Docs",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "email_gen",
        "label": "Email Gen",
        "type": "checkbox",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "travel_history",
        "label": "Travel History",
        "type": "checkbox",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "previous_refusal",
        "label": "Previous Refusal",
        "type": "checkbox",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "vfa",
        "label": "Vfa",
        "type": "checkbox",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "dfa",
        "label": "Dfa",
        "type": "checkbox",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "personal_documents",
        "label": "Personal Documents",
        "type": "checkbox",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "job_documents",
        "label": "Job Documents",
        "type": "checkbox",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "business_documents",
        "label": "Business Documents",
        "type": "checkbox",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "documents_note",
        "label": "Documents Note",
        "type": "textarea",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "status",
        "label": "Status",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "description",
        "label": "Description",
        "type": "textarea",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "leads",
    "title": "Client Leads",
    "model": "client_leads",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "title",
      "category",
      "description"
    ],
    "columns": [
      "id",
      "title",
      "category",
      "description",
      "created_at"
    ],
    "fields": [
      {
        "name": "title",
        "label": "Title",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "category",
        "label": "Category",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "description",
        "label": "Description",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "daily-activities",
    "title": "Daily Activities",
    "model": "daily_activities",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "title",
      "category",
      "priority",
      "description"
    ],
    "columns": [
      "id",
      "user_id",
      "title",
      "category",
      "priority",
      "description",
      "date_time",
      "created_at"
    ],
    "fields": [
      {
        "name": "user_id",
        "label": "User Id",
        "type": "number",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "title",
        "label": "Title",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "category",
        "label": "Category",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "priority",
        "label": "Priority",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "description",
        "label": "Description",
        "type": "textarea",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "date_time",
        "label": "Date Time",
        "type": "datetime",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "documents",
    "title": "Documents",
    "model": "documents",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "document",
      "document_type"
    ],
    "columns": [
      "id",
      "client_case_id",
      "document",
      "document_type",
      "created_at"
    ],
    "fields": [
      {
        "name": "client_case_id",
        "label": "Client Case Id",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "document",
        "label": "Document",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "document_type",
        "label": "Document Type",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "employees",
    "title": "Employees",
    "model": "employees",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "emp_id",
      "firstname",
      "lastname",
      "phone",
      "designation",
      "city"
    ],
    "columns": [
      "id",
      "user_id",
      "emp_id",
      "firstname",
      "lastname",
      "phone",
      "designation",
      "joining_date"
    ],
    "fields": [
      {
        "name": "user_id",
        "label": "User Id",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "emp_id",
        "label": "Emp Id",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "firstname",
        "label": "Firstname",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "lastname",
        "label": "Lastname",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "phone",
        "label": "Phone",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "designation",
        "label": "Designation",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "joining_date",
        "label": "Joining Date",
        "type": "date",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "city",
        "label": "City",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "province",
        "label": "Province",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "country",
        "label": "Country",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "address",
        "label": "Address",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "salary",
        "label": "Salary",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "expenses",
    "title": "Expenses",
    "model": "expenses",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "voucher_no",
      "Title",
      "ExpenseType",
      "Description"
    ],
    "columns": [
      "id",
      "voucher_no",
      "Title",
      "ExpenseType",
      "Amount",
      "Description",
      "Date",
      "created_at"
    ],
    "fields": [
      {
        "name": "voucher_no",
        "label": "Voucher No",
        "type": "textarea",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "Title",
        "label": "Title",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "ExpenseType",
        "label": "ExpenseType",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "Amount",
        "label": "Amount",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "Description",
        "label": "Description",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "Date",
        "label": "Date",
        "type": "date",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "failed-jobs",
    "title": "Failed Jobs",
    "model": "failed_jobs",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "connection",
      "queue"
    ],
    "columns": [
      "id",
      "connection",
      "queue",
      "failed_at"
    ],
    "fields": [
      {
        "name": "connection",
        "label": "Connection",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "queue",
        "label": "Queue",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "payload",
        "label": "Payload",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "exception",
        "label": "Exception",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": false,
      "updatedAt": false
    }
  },
  {
    "key": "families",
    "title": "Families",
    "model": "families",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "firstname",
      "lastname",
      "phone",
      "email",
      "cnic_no",
      "gender"
    ],
    "columns": [
      "id",
      "client_id",
      "self_id",
      "firstname",
      "lastname",
      "phone",
      "email",
      "dob"
    ],
    "fields": [
      {
        "name": "client_id",
        "label": "Client Id",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "self_id",
        "label": "Self Id",
        "type": "number",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "firstname",
        "label": "Firstname",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "lastname",
        "label": "Lastname",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "phone",
        "label": "Phone",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "email",
        "label": "Email",
        "type": "email",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "dob",
        "label": "Dob",
        "type": "date",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "cnic_no",
        "label": "Cnic No",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "gender",
        "label": "Gender",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "avatar",
        "label": "Avatar",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "cnic_issue",
        "label": "Cnic Issue",
        "type": "date",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "cnic_expiry",
        "label": "Cnic Expiry",
        "type": "date",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "visa_category",
        "label": "Visa Category",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "destination_country",
        "label": "Destination Country",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "passport_no",
        "label": "Passport No",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "passport_issue",
        "label": "Passport Issue",
        "type": "date",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "passport_expiry",
        "label": "Passport Expiry",
        "type": "date",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "passport_attach",
        "label": "Passport Attach",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "address",
        "label": "Address",
        "type": "textarea",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "relationship",
        "label": "Relationship",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "ielts",
    "title": "Ielts",
    "model": "ielts",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "name",
      "email",
      "phone",
      "cnic",
      "gender",
      "avatar"
    ],
    "columns": [
      "id",
      "name",
      "email",
      "phone",
      "cnic",
      "gender",
      "avatar",
      "address"
    ],
    "fields": [
      {
        "name": "name",
        "label": "Name",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "email",
        "label": "Email",
        "type": "email",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "phone",
        "label": "Phone",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "cnic",
        "label": "Cnic",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "gender",
        "label": "Gender",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "avatar",
        "label": "Avatar",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "address",
        "label": "Address",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "band_required",
        "label": "Band Required",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "country",
        "label": "Country",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "category",
        "label": "Category",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "a_result",
        "label": "A Result",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "fee",
        "label": "Fee",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "joining_date",
        "label": "Joining Date",
        "type": "date",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "ending_date",
        "label": "Ending Date",
        "type": "date",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "listening",
        "label": "Listening",
        "type": "number",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "reading",
        "label": "Reading",
        "type": "number",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "writing",
        "label": "Writing",
        "type": "number",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "speaking",
        "label": "Speaking",
        "type": "number",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "overall",
        "label": "Overall",
        "type": "number",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "cefr",
        "label": "Cefr",
        "type": "textarea",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "remarks",
        "label": "Remarks",
        "type": "textarea",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "incomes",
    "title": "Incomes",
    "model": "incomes",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "Title",
      "IncomesType",
      "Description",
      "foreign_id"
    ],
    "columns": [
      "id",
      "Title",
      "IncomesType",
      "Amount",
      "Description",
      "Date",
      "created_at",
      "foreign_id"
    ],
    "fields": [
      {
        "name": "Title",
        "label": "Title",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "IncomesType",
        "label": "IncomesType",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "Amount",
        "label": "Amount",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "Description",
        "label": "Description",
        "type": "textarea",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "Date",
        "label": "Date",
        "type": "date",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "foreign_id",
        "label": "Foreign Id",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "life-skills",
    "title": "Life Skills",
    "model": "life_skills",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "name",
      "email",
      "phone",
      "cnic",
      "gender",
      "avatar"
    ],
    "columns": [
      "id",
      "name",
      "email",
      "phone",
      "cnic",
      "gender",
      "avatar",
      "address"
    ],
    "fields": [
      {
        "name": "name",
        "label": "Name",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "email",
        "label": "Email",
        "type": "email",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "phone",
        "label": "Phone",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "cnic",
        "label": "Cnic",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "gender",
        "label": "Gender",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "avatar",
        "label": "Avatar",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "address",
        "label": "Address",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "admission_date",
        "label": "Admission Date",
        "type": "date",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "level",
        "label": "Level",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "fee",
        "label": "Fee",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false,
        "step": "0.01"
      },
      {
        "name": "test_dates",
        "label": "Test Dates",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "results",
        "label": "Results",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "cefr",
        "label": "Cefr",
        "type": "text",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "remarks",
        "label": "Remarks",
        "type": "textarea",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "migrations",
    "title": "Migrations",
    "model": "migrations",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "migration"
    ],
    "columns": [
      "id",
      "migration",
      "batch"
    ],
    "fields": [
      {
        "name": "migration",
        "label": "Migration",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "batch",
        "label": "Batch",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": false,
      "updatedAt": false
    }
  },
  {
    "key": "notifications",
    "title": "Notifications",
    "model": "notifications",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "id",
      "type",
      "notifiable_type"
    ],
    "columns": [
      "id",
      "type",
      "notifiable_type",
      "notifiable_id",
      "read_at",
      "created_at"
    ],
    "fields": [
      {
        "name": "id",
        "label": "Id",
        "type": "text",
        "required": false,
        "requiredOnCreate": true,
        "optionalOnEdit": false
      },
      {
        "name": "type",
        "label": "Type",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "notifiable_type",
        "label": "Notifiable Type",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "notifiable_id",
        "label": "Notifiable Id",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "data",
        "label": "Data",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "read_at",
        "label": "Read At",
        "type": "datetime",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "password-resets",
    "title": "Password Resets",
    "model": "password_resets",
    "primaryKey": [
      "email"
    ],
    "searchFields": [
      "email",
      "token"
    ],
    "columns": [
      "email",
      "token",
      "created_at"
    ],
    "fields": [
      {
        "name": "email",
        "label": "Email",
        "type": "email",
        "required": false,
        "requiredOnCreate": true,
        "optionalOnEdit": false
      },
      {
        "name": "token",
        "label": "Token",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": false
    }
  },
  {
    "key": "permissions",
    "title": "Permissions",
    "model": "permissions",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "name",
      "slug"
    ],
    "columns": [
      "id",
      "name",
      "slug",
      "created_at"
    ],
    "fields": [
      {
        "name": "name",
        "label": "Name",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "slug",
        "label": "Slug",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "reminders",
    "title": "Reminders",
    "model": "reminders",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "title",
      "category",
      "description"
    ],
    "columns": [
      "id",
      "user_id",
      "title",
      "category",
      "description",
      "date",
      "reminded",
      "created_at"
    ],
    "fields": [
      {
        "name": "user_id",
        "label": "User Id",
        "type": "number",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "title",
        "label": "Title",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "category",
        "label": "Category",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "description",
        "label": "Description",
        "type": "textarea",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "date",
        "label": "Date",
        "type": "date",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "reminded",
        "label": "Reminded",
        "type": "checkbox",
        "required": false,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "roles",
    "title": "Roles",
    "model": "roles",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "name",
      "slug"
    ],
    "columns": [
      "id",
      "name",
      "slug",
      "created_at"
    ],
    "fields": [
      {
        "name": "name",
        "label": "Name",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "slug",
        "label": "Slug",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "roles-permissions",
    "title": "Role Permissions",
    "model": "roles_permissions",
    "primaryKey": [
      "role_id",
      "permission_id"
    ],
    "searchFields": [
      "role_id",
      "permission_id"
    ],
    "columns": [
      "role_id",
      "permission_id"
    ],
    "fields": [
      {
        "name": "role_id",
        "label": "Role Id",
        "type": "number",
        "required": false,
        "requiredOnCreate": true,
        "optionalOnEdit": false
      },
      {
        "name": "permission_id",
        "label": "Permission Id",
        "type": "number",
        "required": false,
        "requiredOnCreate": true,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": false,
      "updatedAt": false
    }
  },
  {
    "key": "users",
    "title": "Users",
    "model": "users",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "user_type",
      "firstname",
      "lastname",
      "email",
      "phone",
      "cnic"
    ],
    "columns": [
      "id",
      "user_type",
      "firstname",
      "lastname",
      "email",
      "phone",
      "cnic",
      "gender"
    ],
    "fields": [
      {
        "name": "user_type",
        "label": "User Type",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "firstname",
        "label": "Firstname",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "lastname",
        "label": "Lastname",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "email",
        "label": "Email",
        "type": "email",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "phone",
        "label": "Phone",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "cnic",
        "label": "Cnic",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "gender",
        "label": "Gender",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "avatar",
        "label": "Avatar",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "password",
        "label": "Password",
        "type": "password",
        "required": false,
        "requiredOnCreate": true,
        "optionalOnEdit": true
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  },
  {
    "key": "users-permissions",
    "title": "User Permissions",
    "model": "users_permissions",
    "primaryKey": [
      "user_id",
      "permission_id"
    ],
    "searchFields": [
      "user_id",
      "permission_id"
    ],
    "columns": [
      "user_id",
      "permission_id"
    ],
    "fields": [
      {
        "name": "user_id",
        "label": "User Id",
        "type": "number",
        "required": false,
        "requiredOnCreate": true,
        "optionalOnEdit": false
      },
      {
        "name": "permission_id",
        "label": "Permission Id",
        "type": "number",
        "required": false,
        "requiredOnCreate": true,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": false,
      "updatedAt": false
    }
  },
  {
    "key": "users-roles",
    "title": "User Roles",
    "model": "users_roles",
    "primaryKey": [
      "user_id",
      "role_id"
    ],
    "searchFields": [
      "user_id",
      "role_id"
    ],
    "columns": [
      "user_id",
      "role_id"
    ],
    "fields": [
      {
        "name": "user_id",
        "label": "User Id",
        "type": "number",
        "required": false,
        "requiredOnCreate": true,
        "optionalOnEdit": false
      },
      {
        "name": "role_id",
        "label": "Role Id",
        "type": "number",
        "required": false,
        "requiredOnCreate": true,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": false,
      "updatedAt": false
    }
  },
  {
    "key": "visitors",
    "title": "Visitors",
    "model": "visitors",
    "primaryKey": [
      "id"
    ],
    "searchFields": [
      "name",
      "category",
      "phone",
      "description"
    ],
    "columns": [
      "id",
      "name",
      "category",
      "phone",
      "description",
      "created_at"
    ],
    "fields": [
      {
        "name": "name",
        "label": "Name",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "category",
        "label": "Category",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "phone",
        "label": "Phone",
        "type": "text",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      },
      {
        "name": "description",
        "label": "Description",
        "type": "textarea",
        "required": true,
        "requiredOnCreate": false,
        "optionalOnEdit": false
      }
    ],
    "autoTimestamps": {
      "createdAt": true,
      "updatedAt": true
    }
  }
];

export function getResource(key: string) { return resources.find((r) => r.key === key); }
