import { type ChannelEventListener, type ChannelEvent, type WeatherData, ChannelEventType } from "./types";
import type { Channel } from "./Channel";

// Сервис управления каналами связи
export class CommunicationChannelService {
  private channels: Channel[] = [];
  private activeChannel: Channel | null = null;
  private dataBuffer: WeatherData[] = [];
  private eventListeners: ChannelEventListener[] = [];
  private checkIntervalId: number | null = null;
  private monitorIntervalId: number | null = null;
  private isReconnecting = false;
  private lastData: WeatherData | null = null;

  constructor(
    private options: {
      channels?: Channel[];
      checkIntervalMs?: number;
      monitorIntervalMs?: number;
      bufferSize?: number;
    } = {}
  ) {
    if (options.channels) {
      this.channels = [...options.channels];
    }

    // Запуск интервалов мониторинга и проверки
    this.startMonitoringActiveChannel();
    this.startChecking();
  }

  public addChannel(channel: Channel): void {
    this.channels.push(channel);

    // Если нет активного канала и этот в состоянии idle, подключаемся к нему
    if (!this.activeChannel && channel.status === "idle") {
      this.connectToChannel(channel);
    }
  }

  public removeChannel(channelId: string): void {
    const index = this.channels.findIndex((c) => c.id === channelId);
    if (index !== -1) {
      const isActiveChannel =
        this.activeChannel && this.activeChannel.id === channelId;

      // Если это активный канал, отключаемся сначала
      if (isActiveChannel) {
        this.disconnectFromChannel(this.activeChannel!);
        this.switchToNextAvailableChannel();
      }

      this.channels.splice(index, 1);
    }
  }

  // Получить текущие данные из активного канала
  public async fetchData(withError = false): Promise<WeatherData | null> {
    if (!this.activeChannel) {
      await this.switchToNextAvailableChannel();
    }

    if (!this.activeChannel) {
      this.emitEvent({
        type: ChannelEventType.AllChannelsUnavailable,
        timestamp: Date.now(),
      });
      return this.lastData;
    }

    try {
      if (withError) {
        throw new Error(`Произошла ошибка в канале ${this.activeChannel.id}`);
      }
      const data = await this.activeChannel.fetch();
      this.lastData = data;
      this.bufferData(data);
      return data;
    } catch (error) {
      console.error(
        `Ошибка получения данных из канала ${this.activeChannel.id}:`,
        error
      );

      // Отметить канал как недоступный
      this.activeChannel.status = "unavailable";
      this.emitEvent({
        type: ChannelEventType.ChannelDisconnected,
        channel: this.activeChannel,
        timestamp: Date.now(),
        data: { error },
      });

      // Пробуем переключиться на другой канал
      await this.switchToNextAvailableChannel();

      // возвращаем последние данные
      return this.lastData;
    }
  }

  public subscribe(listener: ChannelEventListener): () => void {
    this.eventListeners.push(listener);

    // Вернуть функцию отписки
    return () => {
      const index = this.eventListeners.indexOf(listener);
      if (index !== -1) {
        this.eventListeners.splice(index, 1);
      }
    };
  }

  public getChannels(): Channel[] {
    return [...this.channels];
  }

  public getActiveChannel(): Channel | null {
    return this.activeChannel;
  }

  // Принудительно переключиться на определенный канал
  public async switchToChannel(
    channelId: string,
    force = false
  ): Promise<boolean> {
    const channel = this.channels.find((c) => c.id === channelId);

    if (!channel) {
      return false;
    }

    // Если принудительно или канал в состоянии idle, пытаемся подключиться
    if (force || channel.status === "idle") {
      // Отключаемся от текущего канала
      if (this.activeChannel) {
        this.disconnectFromChannel(this.activeChannel);
      }

      return this.connectToChannel(channel);
    }

    return false;
  }

  // Вручную проверить доступность канала
  public async checkChannel(channelId: string): Promise<boolean> {
    const channel = this.channels.find((c) => c.id === channelId);

    if (!channel) {
      return false;
    }

    return this.performChannelCheck(channel);
  }

  // Остановить весь мониторинг и очистить ресурсы
  public dispose(): void {
    if (this.checkIntervalId !== null) {
      window.clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }

    if (this.monitorIntervalId !== null) {
      window.clearInterval(this.monitorIntervalId);
      this.monitorIntervalId = null;
    }

    if (this.activeChannel) {
      this.disconnectFromChannel(this.activeChannel);
    }

    this.channels = [];
    this.activeChannel = null;
    this.eventListeners = [];
    this.dataBuffer = [];
    this.lastData = null;
  }

  // Запуск периодической проверки каналов
  private startChecking(): void {
    const interval = this.options.checkIntervalMs || 30000; // По умолчанию: 30 секунд

    this.checkIntervalId = window.setInterval(() => {
      // Проверить все недоступные каналы
      this.channels
        .filter((channel) => channel.status === "unavailable")
        .forEach((channel) => this.performChannelCheck(channel));
    }, interval);
  }

  // Запуск мониторинга активного канала
  private startMonitoringActiveChannel(): void {
    const interval = this.options.monitorIntervalMs || 5000; // По умолчанию: 5 секунд

    this.monitorIntervalId = window.setInterval(() => {
      if (this.activeChannel) {
        this.performChannelCheck(this.activeChannel);
      } else {
        this.switchToNextAvailableChannel();
      }
    }, interval);
  }

  // Проверить доступность канала
  private async performChannelCheck(channel: Channel): Promise<boolean> {
    try {
      const isAvailable = await channel.check();

      // Обновить статус канала на основе результата проверки
      const previousStatus = channel.status;
      const newStatus = isAvailable
        ? channel === this.activeChannel
          ? "connected"
          : "idle"
        : "unavailable";

      if (previousStatus !== newStatus) {
        channel.status = newStatus;

        // Если канал восстановился, отправить событие
        if (previousStatus === "unavailable" && newStatus !== "unavailable") {
          this.emitEvent({
            type: ChannelEventType.ChannelRecovered,
            channel,
            timestamp: Date.now(),
          });

          // Если нет активного канала, подключиться к этому
          if (!this.activeChannel) {
            this.connectToChannel(channel);
          }
        }

        // Если активный канал стал недоступен, переключиться на другой
        if (channel === this.activeChannel && newStatus === "unavailable") {
          this.emitEvent({
            type: ChannelEventType.ChannelDisconnected,
            channel,
            timestamp: Date.now(),
          });

          await this.switchToNextAvailableChannel();
        }
      }

      return isAvailable;
    } catch (error) {
      console.error(`Ошибка проверки канала ${channel.id}:`, error);

      if (channel.status !== "unavailable") {
        channel.status = "unavailable";

        this.emitEvent({
          type: ChannelEventType.ChannelDisconnected,
          channel,
          timestamp: Date.now(),
          data: { error },
        });

        // Если это был активный канал, переключиться на другой
        if (channel === this.activeChannel) {
          await this.switchToNextAvailableChannel();
        }
      }

      return false;
    }
  }

  // Переключиться на следующий доступный канал
  private async switchToNextAvailableChannel(): Promise<boolean> {
    // Предотвращение одновременных переключений
    if (this.isReconnecting) {
      return false;
    }

    this.isReconnecting = true;

    try {
      // Сортировка каналов по приоритету (выше сначала) и статусу (idle сначала)
      const sortedChannels = [...this.channels].sort((a, b) => {
        // Сначала каналы в состоянии idle
        if (a.status === "idle" && b.status !== "idle") return -1;
        if (a.status !== "idle" && b.status === "idle") return 1;

        // Затем по приоритету (выше сначала)
        const priorityA = a.priority ?? 0;
        const priorityB = b.priority ?? 0;
        return priorityB - priorityA;
      });

      // Найти первый канал в состоянии idle
      const nextChannel = sortedChannels.find(
        (channel) =>
          channel.status === "idle" &&
          (!this.activeChannel || channel.id !== this.activeChannel.id)
      );

      if (!nextChannel) {
        // Нет доступных каналов
        if (this.activeChannel) {
          // Продолжить использовать текущий активный канал, даже если есть проблемы
          return true;
        }

        this.emitEvent({
          type: ChannelEventType.AllChannelsUnavailable,
          timestamp: Date.now(),
        });

        return false;
      }

      // Отключиться от текущего канала, если он существует
      if (this.activeChannel) {
        this.disconnectFromChannel(this.activeChannel);
      }

      // Подключиться к новому каналу
      return this.connectToChannel(nextChannel);
    } finally {
      this.isReconnecting = false;
    }
  }

  // Подключиться к каналу
  private async connectToChannel(channel: Channel): Promise<boolean> {
    try {
      // Проверить доступность канала перед подключением
      const isAvailable = await channel.check();

      if (!isAvailable) {
        channel.status = "unavailable";
        return false;
      }

      if (this.activeChannel) {
        this.disconnectFromChannel(this.activeChannel);
      }

      this.activeChannel = channel;
      channel.status = "connected";

      this.emitEvent({
        type: ChannelEventType.SwitchedToChannel,
        channel,
        timestamp: Date.now(),
      });

      this.emitEvent({
        type: ChannelEventType.ChannelConnected,
        channel,
        timestamp: Date.now(),
      });
      return true;
    } catch (error) {
      console.error(`Не удалось подключиться к каналу ${channel.id}:`, error);
      channel.status = "unavailable";
      return false;
    }
  }

  // Отключиться от канала
  private disconnectFromChannel(channel: Channel): void {
    if (channel === this.activeChannel) {
      this.activeChannel = null;
    }

    // Установить статус в idle, если был connected, оставить как unavailable в противном случае
    if (channel.status === "connected") {
      channel.status = "idle";
    }
  }

  // Добавить данные в буфер
  private bufferData(data: WeatherData): void {
    const bufferSize = this.options.bufferSize || 10;

    this.dataBuffer.push(data);

    // Обрезать буфер, если он превышает максимальный размер
    if (this.dataBuffer.length > bufferSize) {
      this.dataBuffer.shift();
    }
  }

  private emitEvent(event: ChannelEvent): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("Ошибка в обработчике события канала:", error);
      }
    });
  }
}

// Вспомогательная функция-фабрика для создания сервиса
export function createCommunicationChannelService(
  options: {
    channels?: Channel[];
    checkIntervalMs?: number;
    monitorIntervalMs?: number;
    bufferSize?: number;
  } = {}
): CommunicationChannelService {
  return new CommunicationChannelService(options);
}
