export type Locale = "uk" | "en" | "de" | "es" | "fr" | "ja";
export type Theme = "SYSTEM" | "LIGHT" | "DARK";
export type Capability =
  "BOOKING_CREATE" | "BOOKING_CANCEL_OWN" | "SCHEDULE_VIEW" | "ACCOUNT_LOGIN";

export interface ActiveRestriction {
  id: string;
  capability: Capability;
  roomId: string | null;
  startsAt: string;
  expiresAt: string | null;
  reason: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  pendingEmail: string | null;
  bio: string | null;
  avatarPreset: string;
  avatarUrl: string | null;
  role: "USER" | "ADMIN";
  locale: Locale;
  theme: Theme;
  timezone: string | null;
  emailVerified: boolean;
  approved: boolean;
  accessRevoked: boolean;
  activeRestrictions?: ActiveRestriction[];
}

export interface Room {
  id: string;
  name: string;
  floor: number;
  capacity: number;
  workStart: string;
  workEnd: string;
  workingDays: number[];
  imageUrl: string | null;
}

export interface Person {
  id: string;
  name: string;
  bio?: string | null;
  avatarPreset: string;
  avatarUrl: string | null;
  status?: "INVITED" | "ACCEPTED" | "DECLINED";
}

export interface Booking {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  meetingType?: "ROOM" | "ONLINE";
  meetingUrl?: string | null;
  imageUrl?: string | null;
  room?: Pick<Room, "id" | "name"> | null;
  participationMode: "INVITE_ONLY" | "OPEN";
  seriesId: string | null;
  organizer: Person;
  participants: Person[];
}

export interface MyMeeting extends Booking {
  meetingType: "ROOM" | "ONLINE";
  meetingUrl: string | null;
  room: Pick<Room, "id" | "name"> | null;
  myRole: "ORGANIZER" | "PARTICIPANT";
  participantStatus: "INVITED" | "ACCEPTED" | null;
}

export interface MyMeetingsCalendar {
  officeTimeZone: string;
  meetings: MyMeeting[];
}

export interface RoomBlock {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  seriesId: string | null;
  recurrence: "DAILY" | "WEEKLY" | null;
  recurrenceInterval: number | null;
  recurrenceWeekdays: number[] | null;
  recurrenceUntil: string | null;
}

export interface Schedule {
  officeTimeZone: string;
  room: Room;
  bookings: Booking[];
  blocks: RoomBlock[];
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  bookingId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
