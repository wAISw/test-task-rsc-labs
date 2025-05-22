import type { ChannelStatus } from "./types";
import { Channel } from "./Channel";

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const createWeatherChannel = (
  id: string,
  initialStatus: ChannelStatus,
  failProbability = 0,
  latency = 500,
  priority = 0
): Channel => {
  // Создаем и возвращаем экземпляр класса Channel
  return new Channel(id, initialStatus, failProbability, latency, priority);
};
