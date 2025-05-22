import type { Channel } from "./Channel";

// Types
export type ChannelStatus = "idle" | "connected" | "unavailable";

export enum ChannelEventType {
  ChannelConnected = "channel-connected",
  ChannelDisconnected = "channel-disconnected",
  ChannelRecovered = "channel-recovered",
  AllChannelsUnavailable = "all-channels-unavailable",
  SwitchedToChannel = "switched-to-channel",
}

export interface ChannelEvent {
  type: ChannelEventType;
  channel?: Channel;
  timestamp: number;
  data?: unknown;
}

export type ChannelEventListener = (event: ChannelEvent) => void;

// Тип данных, которые будут возвращать наши каналы
export interface WeatherData {
  temperature: number;
  humidity: number;
  windSpeed: number;
  source: string;
}
