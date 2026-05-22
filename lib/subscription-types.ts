export interface Subscription {
  id: string;
  tool: string;
  subscription: string;
  due_date: string;
  price: string;
  login_email: string;
  login_password?: string;
  has_login_password?: boolean;
  action: string;
  payment_status: string;
  created_at?: string;
}

export interface ReminderSettings {
  email: string;
  days_before: number;
  enabled: boolean;
  groups?: ReminderGroup[];
  recipients?: ReminderRecipient[];
}

export interface ReminderGroup {
  id: string;
  name: string;
  days_before: number;
  enabled: boolean;
  recipients: ReminderRecipient[];
  created_at?: string;
  updated_at?: string;
}

export interface ReminderRecipient {
  id: string;
  group_id?: string;
  email: string;
  is_primary: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}
