export type ScheduleAudience = "household" | "provider";
export interface ScheduleRecord {
  id: string;
  created_at: string;
}
export interface ServiceSchedule extends ScheduleRecord {
  household_id: string;
  asset_id: string;
  provider_id: string;
  case_id: string | null;
  next_service_on: string;
  status: "active" | "cancelled";
  revision: number;
  note: string;
  created_by: ScheduleAudience;
  updated_by: ScheduleAudience;
  updated_at: string;
}
export interface ScheduleCreate {
  household_id: string;
  asset_id: string;
  provider_id?: string | null;
  case_id?: string | null;
  next_service_on: string;
  note?: string;
}
export interface ScheduleEdit {
  expected_revision: number;
  next_service_on?: string;
  status?: "active" | "cancelled";
  note?: string;
}
export interface ServiceReminder extends ScheduleRecord {
  schedule_id: string;
  revision: number;
  household_id: string;
  provider_id: string;
  next_service_on: string;
  stage: "upcoming" | "due";
  audience: ScheduleAudience;
  message: string;
  status: "available" | "acknowledged" | "superseded" | "cancelled";
  acknowledged_at: string | null;
  channel: "in_app";
  external_effect: false;
}
export interface ContactCreate {
  expected_revision: number;
  kind: "local_message" | "contact_note";
  content: string;
}
export interface ServiceContact extends ScheduleRecord {
  schedule_id: string;
  revision: number;
  provider_id: string;
  kind: ContactCreate["kind"];
  content: string;
  status: "local_recorded";
  external_effect: false;
}
export interface ReminderCheckResult {
  as_of: string;
  schedules_processed: number;
  reminders_created: number;
  batch_limit: number;
  external_effect: false;
}
export interface ScheduleActor {
  audience: ScheduleAudience;
  id: string;
}
