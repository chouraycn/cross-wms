export type TimelineEvent = {
  id: string;
  timestamp: number;
  duration?: number;
  type: string;
  label: string;
  data?: Record<string, unknown>;
  parentId?: string;
  children?: TimelineEvent[];
};

export type TimelineOptions = {
  maxEvents?: number;
  autoPrune?: boolean;
};

export class DiagnosticsTimeline {
  private events: TimelineEvent[] = [];
  private maxEvents: number;
  private autoPrune: boolean;

  constructor(options: TimelineOptions = {}) {
    this.maxEvents = options.maxEvents ?? 1000;
    this.autoPrune = options.autoPrune ?? true;
  }

  addEvent(event: Omit<TimelineEvent, "id" | "timestamp">): TimelineEvent {
    const newEvent: TimelineEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    };

    this.events.push(newEvent);

    if (this.autoPrune && this.events.length > this.maxEvents) {
      this.prune();
    }

    return newEvent;
  }

  startEvent(label: string, type: string, data?: Record<string, unknown>): TimelineEvent {
    return this.addEvent({ label, type, data });
  }

  endEvent(eventId: string): void {
    const event = this.events.find((e) => e.id === eventId);
    if (event) {
      event.duration = Date.now() - event.timestamp;
    }
  }

  prune(): void {
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  getEvents(): TimelineEvent[] {
    return [...this.events];
  }

  getEventsByType(type: string): TimelineEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  getRecentEvents(count: number): TimelineEvent[] {
    return this.events.slice(-count);
  }

  clear(): void {
    this.events = [];
  }

  toJSON(): TimelineEvent[] {
    return this.getEvents();
  }

  getTotalDuration(): number {
    return this.events.reduce((acc, event) => acc + (event.duration ?? 0), 0);
  }

  getEventsByLabel(label: string): TimelineEvent[] {
    return this.events.filter((e) => e.label === label);
  }

  findEventById(id: string): TimelineEvent | undefined {
    return this.events.find((e) => e.id === id);
  }
}

export const diagnosticsTimeline = new DiagnosticsTimeline();