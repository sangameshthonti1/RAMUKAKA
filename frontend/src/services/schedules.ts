import { ApiError } from "./api";
import type {
  ContactCreate,
  ReminderCheckResult,
  ScheduleActor,
  ScheduleCreate,
  ScheduleEdit,
  ServiceContact,
  ServiceReminder,
  ServiceSchedule,
} from "../types/schedules";

async function scheduleRequest<T>(
  path: string,
  actor?: ScheduleActor,
  body?: unknown,
  method = "POST",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? "GET" : method,
      headers: {
        Accept: "application/json",
        ...(actor ? { "X-Demo-Role": actor.audience } : {}),
        ...(actor?.audience === "provider"
          ? { "X-Provider-ID": actor.id }
          : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the local backend. Check that it is running and retry.",
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      "The server did not return JSON. Check the API proxy and backend.",
    );
  }
  if (!response.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? data.detail
        : undefined;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((item: unknown) =>
                item && typeof item === "object" && "msg" in item
                  ? String(item.msg)
                  : "Invalid input",
              )
              .join("; ")
          : "The request could not be completed.";
    throw new ApiError(response.status, message);
  }
  return data as T;
}
const schedulePath = (id: string) =>
  `/service-schedules/${encodeURIComponent(id)}`;
const partyPath = (actor: ScheduleActor) =>
  `/${actor.audience === "household" ? "households" : "providers"}/${encodeURIComponent(actor.id)}`;
async function listAll<T>(path: string): Promise<T[]> {
  const records: T[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await scheduleRequest<T[]>(
      `${path}?limit=200&offset=${offset}`,
    );
    records.push(...page);
    if (page.length < 200) return records;
  }
}
export const schedulesApi = {
  get: (id: string) => scheduleRequest<ServiceSchedule>(schedulePath(id)),
  list: (actor: ScheduleActor) =>
    listAll<ServiceSchedule>(`${partyPath(actor)}/service-schedules`),
  reminders: (actor: ScheduleActor) =>
    listAll<ServiceReminder>(`${partyPath(actor)}/service-reminders`),
  contacts: (id: string) =>
    listAll<ServiceContact>(`${schedulePath(id)}/contacts`),
  create: (actor: ScheduleActor, body: ScheduleCreate) =>
    scheduleRequest<ServiceSchedule>("/service-schedules", actor, body),
  edit: (actor: ScheduleActor, id: string, body: ScheduleEdit) =>
    scheduleRequest<ServiceSchedule>(schedulePath(id), actor, body, "PATCH"),
  acknowledge: (actor: ScheduleActor, id: string) =>
    scheduleRequest<ServiceReminder>(
      `/service-reminders/${encodeURIComponent(id)}/acknowledge`,
      actor,
      {},
    ),
  contact: (actor: ScheduleActor, id: string, body: ContactCreate) =>
    scheduleRequest<ServiceContact>(
      `${schedulePath(id)}/contacts`,
      actor,
      body,
    ),
  check: (body: { as_of?: string | null } = {}) =>
    scheduleRequest<ReminderCheckResult>(
      "/service-reminders/check",
      undefined,
      body,
    ),
};
