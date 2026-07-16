export interface CompactionNotification {
  id: string;
  sessionId: string;
  type: 'compaction' | 'truncate' | 'budget_warning';
  level: 'info' | 'warning' | 'critical';
  message: string;
  details: {
    tokensBefore?: number;
    tokensAfter?: number;
    reductionRatio?: number;
    messageCount?: number;
    compactedMessageCount?: number;
    summary?: string;
    trigger?: string;
  };
  timestamp: number;
  read: boolean;
}

export class CompactionNotificationManager {
  private notifications: Map<string, CompactionNotification[]> = new Map();
  private maxNotificationsPerSession: number = 10;

  addNotification(sessionId: string, notification: Omit<CompactionNotification, 'id' | 'timestamp' | 'read'>): CompactionNotification {
    const id = `notification_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newNotification: CompactionNotification = {
      ...notification,
      id,
      timestamp: Date.now(),
      read: false,
    };

    const sessionNotifications = this.notifications.get(sessionId) || [];
    sessionNotifications.unshift(newNotification);
    
    if (sessionNotifications.length > this.maxNotificationsPerSession) {
      sessionNotifications.pop();
    }

    this.notifications.set(sessionId, sessionNotifications);
    return newNotification;
  }

  getNotifications(sessionId: string): CompactionNotification[] {
    return this.notifications.get(sessionId) || [];
  }

  markAsRead(sessionId: string, notificationId: string): boolean {
    const sessionNotifications = this.notifications.get(sessionId);
    if (!sessionNotifications) return false;

    const notification = sessionNotifications.find(n => n.id === notificationId);
    if (!notification) return false;

    notification.read = true;
    return true;
  }

  markAllAsRead(sessionId: string): void {
    const sessionNotifications = this.notifications.get(sessionId);
    if (!sessionNotifications) return;

    sessionNotifications.forEach(n => n.read = true);
  }

  removeNotification(sessionId: string, notificationId: string): boolean {
    const sessionNotifications = this.notifications.get(sessionId);
    if (!sessionNotifications) return false;

    const index = sessionNotifications.findIndex(n => n.id === notificationId);
    if (index === -1) return false;

    sessionNotifications.splice(index, 1);
    return true;
  }

  clearAll(sessionId: string): void {
    this.notifications.delete(sessionId);
  }

  hasUnread(sessionId: string): boolean {
    const sessionNotifications = this.notifications.get(sessionId);
    if (!sessionNotifications) return false;
    return sessionNotifications.some(n => !n.read);
  }

  getUnreadCount(sessionId: string): number {
    const sessionNotifications = this.notifications.get(sessionId);
    if (!sessionNotifications) return 0;
    return sessionNotifications.filter(n => !n.read).length;
  }
}

export const compactionNotificationManager = new CompactionNotificationManager();
export const compactionNotification = compactionNotificationManager;
