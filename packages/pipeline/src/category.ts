// Transaction categories (ARCHITECTURE §4.4). The 2nd-to-last group feeds only alert A01.
export type Category =
  | 'service_revenue'
  | 'sales_revenue'
  | 'export_revenue'
  | 'financial_income'
  | 'pro_labore'
  | 'profit_distribution'
  | 'salary'
  | 'inss_charge'
  | 'fgts_charge'
  | 'das_tax'
  | 'darf_tax'
  | 'other_taxes'
  | 'deductible_health'
  | 'deductible_education'
  | 'pgbl_pension'
  | 'operating_expense'
  | 'personal_expense_in_pj' // feeds only alert A01
  | 'same_holder_transfer'
  | 'bank_fee'
  | 'unclassified';
