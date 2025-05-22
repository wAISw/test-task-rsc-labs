import { useState, useEffect, useCallback } from "react";
import "./App.css";
import {
  CommunicationChannelService,
  createCommunicationChannelService,
} from "./services/CommunicationChannelService";
import {
  ChannelEventType,
  type ChannelEvent,
  type WeatherData,
} from "./services/types";
import { createWeatherChannel } from "./services/utils";

function App() {
  // Состояние для хранения текущих данных
  const [weatherData, setWeatherData] = useState<WeatherData | undefined>();

  // Состояние для отображения событий
  const [events, setEvents] = useState<ChannelEvent[]>([]);

  // Состояние для отображения ошибки, когда все каналы недоступны
  const [allUnavailable, setAllUnavailable] = useState(false);
  const [service, setService] = useState<
    CommunicationChannelService | undefined
  >();

  // Инициализация сервиса при монтировании компонента
  const serviceInit = useCallback(() => {
    // Создаем каналы с разными характеристиками
    const primaryChannel = createWeatherChannel(
      "OpenWeatherMap API",
      "idle",
      0.01,
      500,
      2
    );
    const secondaryChannel = createWeatherChannel(
      "Weather.com API",
      "idle",
      0.05,
      800,
      1
    );
    const tertiaryChannel = createWeatherChannel(
      "AccuWeather API",
      "idle",
      0.1,
      1200,
      0
    );

    // Создаем сервис с каналами
    const service = createCommunicationChannelService({
      channels: [primaryChannel, secondaryChannel, tertiaryChannel],
      checkIntervalMs: 5000, // Проверяем недоступные каналы каждые 5 секунд
      monitorIntervalMs: 2000, // Мониторим активный канал каждые 2 секунды
      bufferSize: 5,
    });

    setService(service);

    return service;
  }, []);

  useEffect(() => {
    const service = serviceInit();

    // Подписываемся на события от сервиса
    const unsubscribe = service.subscribe((event) => {
      // Добавляем событие в историю
      setEvents((prev) => [event, ...prev].slice(0, 10));

      // Если все каналы недоступны, показываем ошибку
      if (event.type === ChannelEventType.AllChannelsUnavailable) {
        setAllUnavailable(true);
      } else {
        setAllUnavailable(false);
      }

      if (event.type === ChannelEventType.ChannelConnected) {
        service.fetchData().then((data) => {
          if (data) {
            setWeatherData(data);
          }
        });
      }
    });

    // Запускаем периодическое получение данных
    const fetchInterval = setInterval(async () => {
      const data = await service.fetchData();
      if (data) {
        setWeatherData(data);
      }
    }, 3000);

    // Очистка при размонтировании
    return () => {
      clearInterval(fetchInterval);
      unsubscribe();
      service.dispose();
    };
  }, [serviceInit]);

  // Функция для принудительного переключения на конкретный канал
  const switchToChannel = useCallback(
    (channelId: string) => {
      service?.switchToChannel(channelId, true);
    },
    [service]
  );

  // Функция для принудительного вызова ошибки в текущем канале
  const simulateError = useCallback(() => {
    service?.fetchData(true);
  }, [service]);

  return (
    <div className="App">
      <h1>Демонстрация отказоустойчивого сервиса каналов связи</h1>

      <div className="data-container">
        <h2>Текущие данные о погоде</h2>
        {weatherData ? (
          <div className="weather-data">
            <p>
              <strong>Источник:</strong>
              <span>{weatherData.source}</span>
            </p>
            <p>
              <strong>Температура:</strong>
              <span>{weatherData.temperature}°C</span>
            </p>
            <p>
              <strong>Влажность:</strong>
              <span>{weatherData.humidity}%</span>
            </p>
            <p>
              <strong>Скорость ветра:</strong>
              <span>{weatherData.windSpeed} км/ч</span>
            </p>
          </div>
        ) : (
          <p>Загрузка данных...</p>
        )}

        {allUnavailable && (
          <div className="error-message">
            <p>
              ⚠️ Все каналы связи недоступны. Данные могут быть устаревшими.
            </p>
          </div>
        )}
      </div>

      <div className="channels-container">
        <h2>Статус каналов связи</h2>
        <div className="channels-list">
          {service?.getChannels().map((channel) => (
            <div
              key={channel.id}
              className={`channel-item status-${channel.status}`}
            >
              <div className="channel-info">
                <span className="channel-name">{channel.id}</span>
                <span className="channel-status">
                  {channel.status === "connected"
                    ? "🟢 Подключен"
                    : channel.status === "idle"
                    ? "🟡 Готов"
                    : "🔴 Недоступен"}
                </span>
              </div>
              <button
                onClick={() => switchToChannel(channel.id)}
                disabled={
                  channel.status === "unavailable" ||
                  channel.status === "connected"
                }
              >
                Переключиться
              </button>
            </div>
          ))}
        </div>

        <button onClick={simulateError}>
          Симулировать ошибку в текущем канале
        </button>
      </div>

      <div className="events-container">
        <h2>История событий</h2>
        <div className="events-list">
          {events.map((event, index) => (
            <div key={index} className={`event-item event-${event.type}`}>
              <span className="event-time">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <span className="event-type">
                {event.type === ChannelEventType.ChannelConnected
                  ? "🟢 Канал подключен"
                  : event.type === ChannelEventType.ChannelDisconnected
                  ? "🔴 Канал отключен"
                  : event.type === ChannelEventType.ChannelRecovered
                  ? "🟡 Канал восстановлен"
                  : event.type === ChannelEventType.AllChannelsUnavailable
                  ? "⚠️ Все каналы недоступны"
                  : event.type === ChannelEventType.SwitchedToChannel
                  ? "🔄 Переключение на канал"
                  : event.type}
              </span>
              {event.channel && (
                <span className="event-channel">{event.channel.id}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
