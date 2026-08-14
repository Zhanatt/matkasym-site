/**
 * Обвязка над window.Telegram.WebApp.
 *
 * Скрипт telegram-web-app.js подключается в index.html и существует только внутри
 * Telegram. В обычном браузере (локальная разработка, «открыть в браузере» из меню)
 * объекта нет — тогда все хелперы превращаются в заглушки, а страница остаётся рабочей:
 * без этого магазин невозможно было бы открыть и проверить вне Telegram.
 */
const tg = () => window.Telegram?.WebApp || null;

export const isTelegram = () => !!tg()?.initData;

// Подписанная строка для сервера: по ней бэкенд узнаёт клиента и подпись проверяет сам.
export const initData = () => tg()?.initData || '';

export const tgUser = () => tg()?.initDataUnsafe?.user || null;

/** Разворачиваем окно на всю высоту и включаем подтверждение закрытия на форме заявки. */
export function initTelegram() {
  const app = tg();
  if (!app) return;
  app.ready();
  app.expand();
  // Свайп вниз внутри Mini App закрывает окно — на странице со списком это мешает листать
  app.disableVerticalSwipes?.();
}

/** Кнопка «назад» в шапке Telegram: аппаратная, поэтому ведём её отдельно от вёрстки. */
export function setBackButton(onClick) {
  const app = tg();
  if (!app?.BackButton) return () => {};
  app.BackButton.show();
  app.BackButton.onClick(onClick);
  return () => {
    app.BackButton.offClick(onClick);
    app.BackButton.hide();
  };
}

export function hideBackButton() {
  tg()?.BackButton?.hide();
}

/** Нижняя кнопка Telegram — главное действие экрана («Уточнить наличие»). */
export function setMainButton({ text, onClick, loading = false, enabled = true }) {
  const app = tg();
  if (!app?.MainButton) return () => {};
  const mb = app.MainButton;
  mb.setText(text);
  mb.onClick(onClick);
  if (loading) mb.showProgress(false); else mb.hideProgress();
  if (enabled) mb.enable(); else mb.disable();
  mb.show();
  return () => {
    mb.offClick(onClick);
    mb.hideProgress();
    mb.hide();
  };
}

export const haptic = (type = 'light') => {
  const h = tg()?.HapticFeedback;
  if (!h) return;
  if (['error', 'success', 'warning'].includes(type)) h.notificationOccurred(type);
  else h.impactOccurred(type);
};

export const showAlert = msg => {
  const app = tg();
  if (app?.showAlert) app.showAlert(msg);
  else alert(msg);
};

export const closeApp = () => tg()?.close();
