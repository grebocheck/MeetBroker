import { intlLocale, localize } from "../common/localization";
import type { Locale } from "../common/types";

export interface BookingNotificationRecipient {
  locale: Locale;
  timezone: string | null;
}

interface BookingNotificationCopy {
  title: string;
  body: string;
}

function localizedDate(
  startsAt: Date,
  recipient: BookingNotificationRecipient,
  officeTimeZone: string,
): string {
  return new Intl.DateTimeFormat(intlLocale(recipient.locale), {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: recipient.timezone ?? officeTimeZone,
  }).format(startsAt);
}

export function bookingChangeCopy(
  bookingTitle: string,
  roomName: string | null,
  startsAt: Date,
  recipient: BookingNotificationRecipient,
  officeTimeZone: string,
): BookingNotificationCopy {
  const date = localizedDate(startsAt, recipient, officeTimeZone);
  return {
    title: localize(recipient.locale, "changedTitle"),
    body: roomName
      ? localize(recipient.locale, "changedRoom", {
          title: bookingTitle,
          room: roomName,
          date,
        })
      : localize(recipient.locale, "changedOnline", {
          title: bookingTitle,
          date,
        }),
  };
}

export function bookingRemovalCopy(
  bookingTitle: string,
  recipient: BookingNotificationRecipient,
): BookingNotificationCopy {
  return {
    title: localize(recipient.locale, "removedTitle"),
    body: localize(recipient.locale, "removedBody", {
      title: bookingTitle,
    }),
  };
}

export function bookingInvitationCopy(
  organizer: string,
  bookingTitle: string,
  roomName: string | null,
  startsAt: Date,
  recipient: BookingNotificationRecipient,
  officeTimeZone: string,
): BookingNotificationCopy {
  const date = localizedDate(startsAt, recipient, officeTimeZone);
  return {
    title: localize(recipient.locale, "invitationTitle"),
    body: roomName
      ? localize(recipient.locale, "invitationRoom", {
          organizer,
          title: bookingTitle,
          room: roomName,
          date,
        })
      : localize(recipient.locale, "invitationOnline", {
          organizer,
          title: bookingTitle,
          date,
        }),
  };
}
