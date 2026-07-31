import type { Locale } from "./types";

type Variables = Record<string, string | number>;

const messages = {
  uk: {
    changedTitle: "Деталі зустрічі змінено",
    changedRoom: "«{title}» тепер відбудеться в «{room}» — {date}.",
    changedOnline: "Онлайн-зустріч «{title}» тепер запланована на {date}.",
    removedTitle: "Участь у зустрічі змінено",
    removedBody: "Вас більше немає серед учасників зустрічі «{title}».",
    invitationTitle: "Нове запрошення",
    invitationRoom:
      "{organizer} запрошує вас на «{title}» у «{room}» — {date}.",
    invitationOnline:
      "{organizer} запрошує вас на онлайн-зустріч «{title}» — {date}.",
    reminderTitle: "Зустріч скоро почнеться",
    reminderBody: "«{title}» починається о {time}.",
    endWarningTitle: "Наступний слот уже зайнятий",
    endWarningBody:
      "«{title}» завершується о {time}. Одразу після неї починається «{nextTitle}».",
    cancelledTitle: "Зустріч скасовано",
    cancelledBody: "Зустріч «{title}» було скасовано.",
    cancelledWithReason: "Зустріч «{title}» було скасовано. Причина: {reason}.",
    adminChangedTitle: "Адміністратор змінив зустріч",
    adminChangedBody:
      "Адміністратор {admin} змінив зустріч «{title}». Причина: {reason}. {details}",
    adminRemovedTitle: "Адміністратор змінив склад зустрічі",
    adminRemovedBody:
      "Адміністратор {admin} видалив вас із зустрічі «{title}». Причина: {reason}.",
    adminInvitedTitle: "Адміністратор запросив вас на зустріч",
    adminInvitedBody:
      "Адміністратор {admin} запросив вас на зустріч «{title}» ({location}). Причина зміни: {reason}.",
    adminOrganizerTitle: "Адміністратор змінив вашу зустріч",
    adminOrganizerBody:
      "Адміністратор {admin} змінив зустріч «{title}». Причина: {reason}.",
    telegramTest:
      "Тестове сповіщення успішно пройшло через робочий канал доставки.",
    telegramConnected:
      "Telegram успішно підключено. Тепер ви можете вибрати потрібні групи сповіщень у профілі.",
    emailRegisterTitle: "Підтвердіть email у MeetBroker",
    emailRegisterIntro: "Ваш профіль MeetBroker майже готовий.",
    emailRegisterAction: "Підтвердьте email протягом 24 годин: {url}",
    emailRegisterAfter:
      "Після цього адміністратор зможе схвалити корпоративний доступ.",
    emailChangeTitle: "Підтвердіть нову email-адресу в MeetBroker",
    emailChangeIntro: "Ви запросили зміну email-адреси в MeetBroker.",
    emailChangeAction: "Підтвердьте нову адресу протягом 24 годин: {url}",
    emailChangeAfter: "Якщо це були не ви, не переходьте за посиланням.",
    emailOpenAction: "Відкрити MeetBroker",
    emailFooter:
      "Автоматичне повідомлення корпоративного простору MeetBroker.",
    online: "онлайн",
  },
  en: {
    changedTitle: "Meeting details changed",
    changedRoom: "“{title}” is now scheduled in “{room}” on {date}.",
    changedOnline: "The online meeting “{title}” is now scheduled for {date}.",
    removedTitle: "Meeting participation changed",
    removedBody: "You are no longer a participant of “{title}”.",
    invitationTitle: "New meeting invitation",
    invitationRoom:
      "{organizer} invited you to “{title}” in “{room}” on {date}.",
    invitationOnline:
      "{organizer} invited you to the online meeting “{title}” on {date}.",
    reminderTitle: "Meeting starts soon",
    reminderBody: "“{title}” starts at {time}.",
    endWarningTitle: "The next slot is occupied",
    endWarningBody:
      "“{title}” ends at {time}. “{nextTitle}” starts immediately after it.",
    cancelledTitle: "Meeting cancelled",
    cancelledBody: "The meeting “{title}” was cancelled.",
    cancelledWithReason:
      "The meeting “{title}” was cancelled. Reason: {reason}.",
    adminChangedTitle: "An administrator changed the meeting",
    adminChangedBody:
      "Administrator {admin} changed “{title}”. Reason: {reason}. {details}",
    adminRemovedTitle: "An administrator changed the participants",
    adminRemovedBody:
      "Administrator {admin} removed you from “{title}”. Reason: {reason}.",
    adminInvitedTitle: "An administrator invited you to a meeting",
    adminInvitedBody:
      "Administrator {admin} invited you to “{title}” ({location}). Reason: {reason}.",
    adminOrganizerTitle: "An administrator changed your meeting",
    adminOrganizerBody:
      "Administrator {admin} changed “{title}”. Reason: {reason}.",
    telegramTest:
      "The test notification was delivered successfully through the configured channel.",
    telegramConnected:
      "Telegram is connected. You can now choose notification groups in your profile.",
    emailRegisterTitle: "Verify your email for MeetBroker",
    emailRegisterIntro: "Your MeetBroker profile is almost ready.",
    emailRegisterAction: "Verify your email within 24 hours: {url}",
    emailRegisterAfter:
      "After that, an administrator can approve corporate access.",
    emailChangeTitle: "Verify your new email address for MeetBroker",
    emailChangeIntro: "You requested an email address change in MeetBroker.",
    emailChangeAction: "Verify the new address within 24 hours: {url}",
    emailChangeAfter: "If this was not you, do not open the link.",
    emailOpenAction: "Open MeetBroker",
    emailFooter: "An automated message from your MeetBroker workspace.",
    online: "online",
  },
  de: {
    changedTitle: "Besprechungsdetails geändert",
    changedRoom: "„{title}“ findet jetzt am {date} in „{room}“ statt.",
    changedOnline: "Das Online-Meeting „{title}“ findet am {date} statt.",
    removedTitle: "Teilnahme geändert",
    removedBody: "Sie nehmen nicht mehr an „{title}“ teil.",
    invitationTitle: "Neue Besprechungseinladung",
    invitationRoom:
      "{organizer} hat Sie zu „{title}“ in „{room}“ am {date} eingeladen.",
    invitationOnline:
      "{organizer} hat Sie zum Online-Meeting „{title}“ am {date} eingeladen.",
    reminderTitle: "Die Besprechung beginnt bald",
    reminderBody: "„{title}“ beginnt um {time}.",
    endWarningTitle: "Der nächste Zeitraum ist belegt",
    endWarningBody:
      "„{title}“ endet um {time}. Direkt danach beginnt „{nextTitle}“.",
    cancelledTitle: "Besprechung abgesagt",
    cancelledBody: "Die Besprechung „{title}“ wurde abgesagt.",
    cancelledWithReason:
      "Die Besprechung „{title}“ wurde abgesagt. Grund: {reason}.",
    adminChangedTitle: "Ein Administrator hat die Besprechung geändert",
    adminChangedBody:
      "Administrator {admin} hat „{title}“ geändert. Grund: {reason}. {details}",
    adminRemovedTitle: "Ein Administrator hat die Teilnehmenden geändert",
    adminRemovedBody:
      "Administrator {admin} hat Sie aus „{title}“ entfernt. Grund: {reason}.",
    adminInvitedTitle: "Ein Administrator hat Sie eingeladen",
    adminInvitedBody:
      "Administrator {admin} hat Sie zu „{title}“ ({location}) eingeladen. Grund: {reason}.",
    adminOrganizerTitle: "Ein Administrator hat Ihre Besprechung geändert",
    adminOrganizerBody:
      "Administrator {admin} hat „{title}“ geändert. Grund: {reason}.",
    telegramTest: "Die Testbenachrichtigung wurde erfolgreich zugestellt.",
    telegramConnected:
      "Telegram ist verbunden. Sie können nun Benachrichtigungsgruppen im Profil auswählen.",
    emailRegisterTitle: "E-Mail für MeetBroker bestätigen",
    emailRegisterIntro: "Ihr MeetBroker-Profil ist fast fertig.",
    emailRegisterAction:
      "Bestätigen Sie Ihre E-Mail innerhalb von 24 Stunden: {url}",
    emailRegisterAfter:
      "Danach kann ein Administrator den Unternehmenszugriff genehmigen.",
    emailChangeTitle: "Neue E-Mail-Adresse für MeetBroker bestätigen",
    emailChangeIntro:
      "Sie haben eine Änderung Ihrer E-Mail-Adresse angefordert.",
    emailChangeAction:
      "Bestätigen Sie die neue Adresse innerhalb von 24 Stunden: {url}",
    emailChangeAfter: "Wenn Sie das nicht waren, öffnen Sie den Link nicht.",
    emailOpenAction: "MeetBroker öffnen",
    emailFooter:
      "Eine automatische Nachricht aus Ihrem MeetBroker-Arbeitsbereich.",
    online: "online",
  },
  es: {
    changedTitle: "Detalles de la reunión modificados",
    changedRoom: "«{title}» tendrá lugar en «{room}» el {date}.",
    changedOnline: "La reunión en línea «{title}» tendrá lugar el {date}.",
    removedTitle: "Participación modificada",
    removedBody: "Ya no participas en «{title}».",
    invitationTitle: "Nueva invitación a una reunión",
    invitationRoom:
      "{organizer} te ha invitado a «{title}» en «{room}» el {date}.",
    invitationOnline:
      "{organizer} te ha invitado a la reunión en línea «{title}» el {date}.",
    reminderTitle: "La reunión comenzará pronto",
    reminderBody: "«{title}» comienza a las {time}.",
    endWarningTitle: "El siguiente intervalo está ocupado",
    endWarningBody:
      "«{title}» termina a las {time}. «{nextTitle}» comienza justo después.",
    cancelledTitle: "Reunión cancelada",
    cancelledBody: "La reunión «{title}» ha sido cancelada.",
    cancelledWithReason:
      "La reunión «{title}» ha sido cancelada. Motivo: {reason}.",
    adminChangedTitle: "Un administrador modificó la reunión",
    adminChangedBody:
      "El administrador {admin} modificó «{title}». Motivo: {reason}. {details}",
    adminRemovedTitle: "Un administrador modificó los participantes",
    adminRemovedBody:
      "El administrador {admin} te eliminó de «{title}». Motivo: {reason}.",
    adminInvitedTitle: "Un administrador te invitó a una reunión",
    adminInvitedBody:
      "El administrador {admin} te invitó a «{title}» ({location}). Motivo: {reason}.",
    adminOrganizerTitle: "Un administrador modificó tu reunión",
    adminOrganizerBody:
      "El administrador {admin} modificó «{title}». Motivo: {reason}.",
    telegramTest: "La notificación de prueba se entregó correctamente.",
    telegramConnected:
      "Telegram está conectado. Ya puedes elegir grupos de notificaciones en tu perfil.",
    emailRegisterTitle: "Verifica tu correo para MeetBroker",
    emailRegisterIntro: "Tu perfil de MeetBroker está casi listo.",
    emailRegisterAction: "Verifica tu correo en un plazo de 24 horas: {url}",
    emailRegisterAfter:
      "Después, un administrador podrá aprobar el acceso corporativo.",
    emailChangeTitle: "Verifica tu nueva dirección de correo para MeetBroker",
    emailChangeIntro: "Has solicitado cambiar tu correo en MeetBroker.",
    emailChangeAction:
      "Verifica la nueva dirección en un plazo de 24 horas: {url}",
    emailChangeAfter: "Si no fuiste tú, no abras el enlace.",
    emailOpenAction: "Abrir MeetBroker",
    emailFooter: "Un mensaje automático de tu espacio de MeetBroker.",
    online: "en línea",
  },
  fr: {
    changedTitle: "Détails de la réunion modifiés",
    changedRoom: "« {title} » aura lieu dans « {room} » le {date}.",
    changedOnline: "La réunion en ligne « {title} » aura lieu le {date}.",
    removedTitle: "Participation modifiée",
    removedBody: "Vous ne participez plus à « {title} ».",
    invitationTitle: "Nouvelle invitation à une réunion",
    invitationRoom:
      "{organizer} vous a invité à « {title} » dans « {room} » le {date}.",
    invitationOnline:
      "{organizer} vous a invité à la réunion en ligne « {title} » le {date}.",
    reminderTitle: "La réunion commence bientôt",
    reminderBody: "« {title} » commence à {time}.",
    endWarningTitle: "Le créneau suivant est occupé",
    endWarningBody:
      "« {title} » se termine à {time}. « {nextTitle} » commence juste après.",
    cancelledTitle: "Réunion annulée",
    cancelledBody: "La réunion « {title} » a été annulée.",
    cancelledWithReason:
      "La réunion « {title} » a été annulée. Motif : {reason}.",
    adminChangedTitle: "Un administrateur a modifié la réunion",
    adminChangedBody:
      "L’administrateur {admin} a modifié « {title} ». Motif : {reason}. {details}",
    adminRemovedTitle: "Un administrateur a modifié les participants",
    adminRemovedBody:
      "L’administrateur {admin} vous a retiré de « {title} ». Motif : {reason}.",
    adminInvitedTitle: "Un administrateur vous a invité à une réunion",
    adminInvitedBody:
      "L’administrateur {admin} vous a invité à « {title} » ({location}). Motif : {reason}.",
    adminOrganizerTitle: "Un administrateur a modifié votre réunion",
    adminOrganizerBody:
      "L’administrateur {admin} a modifié « {title} ». Motif : {reason}.",
    telegramTest: "La notification de test a été envoyée avec succès.",
    telegramConnected:
      "Telegram est connecté. Vous pouvez maintenant choisir les groupes de notifications dans votre profil.",
    emailRegisterTitle: "Vérifiez votre e-mail pour MeetBroker",
    emailRegisterIntro: "Votre profil MeetBroker est presque prêt.",
    emailRegisterAction: "Vérifiez votre e-mail sous 24 heures : {url}",
    emailRegisterAfter:
      "Un administrateur pourra ensuite approuver l’accès professionnel.",
    emailChangeTitle: "Vérifiez votre nouvelle adresse e-mail pour MeetBroker",
    emailChangeIntro:
      "Vous avez demandé à modifier votre e-mail dans MeetBroker.",
    emailChangeAction: "Vérifiez la nouvelle adresse sous 24 heures : {url}",
    emailChangeAfter:
      "Si vous n’êtes pas à l’origine de cette demande, n’ouvrez pas le lien.",
    emailOpenAction: "Ouvrir MeetBroker",
    emailFooter:
      "Un message automatique de votre espace de travail MeetBroker.",
    online: "en ligne",
  },
  ja: {
    changedTitle: "会議の詳細が変更されました",
    changedRoom: "「{title}」は{date}に「{room}」で開催されます。",
    changedOnline: "オンライン会議「{title}」は{date}に開催されます。",
    removedTitle: "会議への参加が変更されました",
    removedBody: "「{title}」の参加者から外れました。",
    invitationTitle: "新しい会議への招待",
    invitationRoom:
      "{organizer}さんから、{date}に「{room}」で開催される「{title}」へ招待されました。",
    invitationOnline:
      "{organizer}さんから、{date}に開催されるオンライン会議「{title}」へ招待されました。",
    reminderTitle: "会議がまもなく始まります",
    reminderBody: "「{title}」は{time}に始まります。",
    endWarningTitle: "次の時間枠は予約済みです",
    endWarningBody:
      "「{title}」は{time}に終了し、直後に「{nextTitle}」が始まります。",
    cancelledTitle: "会議がキャンセルされました",
    cancelledBody: "会議「{title}」はキャンセルされました。",
    cancelledWithReason:
      "会議「{title}」はキャンセルされました。理由: {reason}。",
    adminChangedTitle: "管理者が会議を変更しました",
    adminChangedBody:
      "管理者{admin}が「{title}」を変更しました。理由: {reason}。{details}",
    adminRemovedTitle: "管理者が参加者を変更しました",
    adminRemovedBody:
      "管理者{admin}があなたを「{title}」から削除しました。理由: {reason}。",
    adminInvitedTitle: "管理者から会議に招待されました",
    adminInvitedBody:
      "管理者{admin}から「{title}」（{location}）に招待されました。理由: {reason}。",
    adminOrganizerTitle: "管理者があなたの会議を変更しました",
    adminOrganizerBody:
      "管理者{admin}が「{title}」を変更しました。理由: {reason}。",
    telegramTest: "テスト通知は正常に配信されました。",
    telegramConnected:
      "Telegramに接続しました。プロフィールで通知グループを選択できます。",
    emailRegisterTitle: "MeetBrokerのメールアドレスを確認してください",
    emailRegisterIntro: "MeetBrokerプロフィールの準備はもうすぐ完了です。",
    emailRegisterAction: "24時間以内にメールアドレスを確認してください: {url}",
    emailRegisterAfter: "確認後、管理者が社内アクセスを承認できます。",
    emailChangeTitle: "MeetBrokerの新しいメールアドレスを確認してください",
    emailChangeIntro: "MeetBrokerでメールアドレスの変更が要求されました。",
    emailChangeAction: "24時間以内に新しいアドレスを確認してください: {url}",
    emailChangeAfter: "心当たりがない場合は、リンクを開かないでください。",
    emailOpenAction: "MeetBrokerを開く",
    emailFooter: "MeetBrokerワークスペースからの自動メッセージです。",
    online: "オンライン",
  },
} satisfies Record<Locale, Record<string, string>>;

export type ApiMessageKey = keyof (typeof messages)["uk"];

export function intlLocale(locale: Locale): string {
  return {
    uk: "uk-UA",
    en: "en-GB",
    de: "de-DE",
    es: "es-ES",
    fr: "fr-FR",
    ja: "ja-JP",
  }[locale];
}

export function localize(
  locale: Locale,
  key: ApiMessageKey,
  variables: Variables = {},
): string {
  return Object.entries(variables).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    messages[locale][key],
  );
}
