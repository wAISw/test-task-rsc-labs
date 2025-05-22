import type { ChannelStatus, WeatherData } from "./types";
import { delay } from "./utils";

// Класс для реализации канала связи
export class Channel {
  id: string;
  status: ChannelStatus = "idle";
  // Вероятность ошибки от 0 до 1
  failProbability = 0;
  latency = 500;
  priority = 0;

  constructor(
    id: string,
    initialStatus: ChannelStatus,
    failProbability: number,
    latency: number,
    priority: number
  ) {
    this.id = id;
    this.status = initialStatus;
    this.priority = priority;
    this.failProbability = failProbability;
    this.latency = latency;
  }

  fetch = async (): Promise<WeatherData> => {
    // Имитируем задержку сети
    await delay(this.latency);

    // Имитируем случайные ошибки
    if (Math.random() < this.failProbability) {
      throw new Error(`Произошла ошибка в канале ${this.id}`);
    }

    // Возвращаем данные с немного случайными значениями
    return {
      temperature: 20 + Math.floor(Math.random() * 10),
      humidity: 40 + Math.floor(Math.random() * 40),
      windSpeed: Math.floor(Math.random() * 30),
      source: this.id,
    };
  };

  check = async (): Promise<boolean> => {
    // Имитируем проверку доступности с задержкой
    await delay(Math.floor(this.latency / 2));

    // Имитируем случайные ошибки при проверке
    return Math.random() >= this.failProbability;
  };
}
