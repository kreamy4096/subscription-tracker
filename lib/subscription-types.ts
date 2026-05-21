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
}
