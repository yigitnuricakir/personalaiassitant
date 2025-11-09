// FIX: Define all necessary types for the application.
// This file was previously empty, causing "Cannot find name" errors.
// These types provide structure for messages, settings, events, and other data.

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  image?: {
    data: string;
    mimeType: string;
  };
  sources?: GroundingSource[];
}

export interface MessagesByDate {
  [date: string]: Message[];
}

export interface Settings {
  notificationTime: string;
  tempUnit: 'C' | 'F';
  theme: 'light' | 'dark' | 'high-contrast';
  language: 'en' | 'tr';
}

export interface CalendarEvent {
  id: string;
  title: string;
  time: string;
}

export interface EventsByDate {
    [date: string]: CalendarEvent[];
}

export interface WeatherData {
  condition: string;
  temperature: number;
}

export interface GroundingSource {
    uri: string;
    title: string;
}
