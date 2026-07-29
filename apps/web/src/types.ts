export type Locale = "uk" | "en";
export type Theme = "SYSTEM" | "LIGHT" | "DARK";

export interface User {
  id: string;
  name: string;
  email: string;
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
}

export interface Room {
  id: string;
  name: string;
  floor: number;
  capacity: number;
  workStart: string;
  workEnd: string;
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
  participationMode: "INVITE_ONLY" | "OPEN";
  organizer: Person;
  participants: Person[];
}

export interface RoomBlock {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  seriesId: string | null;
  recurrence: "DAILY" | "WEEKLY" | null;
}

export interface Schedule {
  officeTimeZone: string;
  room: Room;
  bookings: Booking[];
  blocks: RoomBlock[];
}
