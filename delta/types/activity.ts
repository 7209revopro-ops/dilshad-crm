/** Where someone is right now (GET /activity/people). */
export type PresenceStatus =
  | "active" //      used the app in the last 2 minutes
  | "idle" //        app open, nobody using it
  | "away" //        was here today, app closed
  | "signed_out" //  signed out today
  | "offline"; //    not seen today

export interface PersonActivity {
  id: string;
  name: string;
  email: string;
  designation: string | null;
  role: string;
  superAdmin: boolean;
  teams: string[];
  status: PresenceStatus;
  lastSeenAt: string | null;
  lastActiveAt: string | null;
  /** Minutes since they last used the app (today), when not active now. */
  quietMinutes: number | null;
  /** An idle alert has gone out for the current quiet stretch. */
  alerted: boolean;
  activeMinutesToday: number;
  firstActiveToday: string | null;
  lastLogin: { at: string; ip: string; device: string } | null;
  lastLogoutAt: string | null;
}

export interface PeopleResponse {
  items: PersonActivity[];
  summary: Record<PresenceStatus, number> & { alertsToday: number; failedSignInsToday: number };
  idleRule: { enabled: boolean; limitMinutes: number; notifyTeamLeaders: boolean; inWorkingHours: boolean; timezone: string };
}

export type LoginEventKind = "login" | "login_failed" | "logout";
export type LoginFailReason = "wrong_password" | "unknown_email" | "deactivated" | "no_account";

/** GET /activity/logins — one sign-in, refused sign-in or sign-out. */
export interface LoginEventEntry {
  id: string;
  kind: LoginEventKind;
  method: "password" | "sso" | null;
  reason: LoginFailReason | null;
  email: string;
  user: { id: string; name: string } | null;
  ip: string;
  device: string;
  deviceType: string;
  createdAt: string;
}

/** GET /activity/idle — one idle alert and how long the person stayed away. */
export interface IdleStretchEntry {
  id: string;
  user: { id: string; name: string } | null;
  since: string;
  alertedAt: string;
  endedAt: string | null;
  /** Working minutes without activity. */
  minutes: number;
}

export interface PeopleFilters {
  search?: string;
  teamId?: string;
}

export interface LoginEventFilters {
  page?: number;
  limit?: number;
  userId?: string;
  kind?: LoginEventKind;
}

export interface IdleStretchFilters {
  page?: number;
  limit?: number;
  userId?: string;
}
