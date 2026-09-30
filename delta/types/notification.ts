/** A notification the server kept for the signed-in user (GET /notifications). */
export interface AppNotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationList {
  items: AppNotificationDTO[];
  unread: number;
}
