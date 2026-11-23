---
name: matkasym-site-project
description: Контекст по проекту matkasym-site — интернет-магазин + PIM система для производителя товаров для дома (Кыргызстан)
---

Проект находится в `/Users/zhanat/matkasym-site/` (клиент + сервер).

**Why:** E-commerce сайт + внутренняя PIM система ("Продакт матрица") для MATKASYM — кыргызского производителя товаров для дома.

**How to apply:** При работе с проектом — это коммерческий продакшн проект с реальной БД и деплоем на Render.

## Стек

- **Frontend:** React 18 + Vite, React Router v6, Axios, react-pdf, jspdf, reactflow, react-virtuoso
- **Backend:** Node.js + Express 4, JWT (90 дней), Resend API (email), Cloudinary, Multer, PDFKit, XLSX
- **БД:** MongoDB Atlas M0 + Mongoose
- **Деплой:** Render (Node.js Web Service) — один сервис, Express раздаёт React build
- **GitHub:** https://github.com/Zhanatt/matkasym-site.git
- **Сайт:** https://matkasym-site.onrender.com
- **MongoDB URI:** в репозитории не хранится — `server/.env.atlas` (`ATLAS_URI`), читается через `server/lib/atlas.js`; на Render — переменная `MONGO_URI`

## Структура

```
matkasym-site/
├── client/src/
│   ├── pages/         # Home, Catalog, ProductPage, Cart, Checkout, Orders, Favorites, Sets, Brand, Login, Register
│   ├── pages/admin/   # 27 страниц (включая AdminNews, AdminNewsCreate)
│   ├── components/    # Header, Footer, ProductCard, ImageUploader, SelectWithAdd
│   ├── context/       # AuthContext, CartContext
│   ├── api/index.js   # все axios-запросы
│   ├── hooks/         # useLazyItems, useScrollRestore
│   └── config/categorySpecs.js
└── server/
    ├── index.js       # Entry point + Telegram webhook + migration split-onoi-sakta
    ├── models/        # Product, User, Order, Brand, ChangeLog, StockLog, CategorySpec, Frontman, PriceLog, ProductLog, News
    ├── routes/        # auth, products, admin (1749 строк), brands, orders, catalog
    ├── lib/           # cloudinary.js, mailer.js, telegram.js
    └── middleware/auth.js  # protect / admin / editor / viewer
```

## Admin страницы (client/src/pages/admin/)

AdminDashboard, AdminProducts, AdminProductCard, AdminProductForm, AdminProductModal, AdminProductView,
AdminSets, AdminFrontmen, AdminAllCatalog, AdminUsers, AdminChangelog, AdminStockLog, AdminPriceLog,
AdminProductLog, AdminSalesChart, AdminSetSalesChart, AdminOutOfStock, AdminTenders,
AdminPdfButton, CatalogPDF, AdminProductMap, AdminLayout, AdminLogin, AdminResetPassword,
**AdminNews, AdminNewsCreate** (новые — лента новостей)

## Бренды

- **matkasym-home** — HOME товары (сеты: taza-kiym, kosh-kelniz, baary-oorunda, shirin-balalyk, jenil-ashkana и др.)
- **matkasym-shaar** — уличные/промышленные товары (сет: onoi-sakta)

> Migration: `onoi-sakta` HOME товары переименованы в `baary-oorunda`; только промышленные остались в `onoi-sakta` (shaar). Migration при старте сервера.

## Ролевая модель

`owner` > `editor` > `viewer` > `user` > `banned`

Регистрация с одобрением: `isPending=true` → email админу с "Одобрить"/"Отклонить".

## Модель Product (ключевые поля)

- `name` — базовое название (без цвета)
- `fullName` — полное название (совпадает с 1С именем для синхронизации)
- `color` — white / black / grey / pink / ""
- `brand`, `set`, `setLevel` — классификация
- `priceCost`, `priceWholesale`, `priceDealer`, `price` — 4 типа цен
- `specs` — динамические характеристики
- `driveImages` — Google Drive file IDs; `images` — Cloudinary/fallback URLs
- `productStatus` — planned / improvement / discontinued / for_sale / in_development / nelikvid / **on_pause**
- `pauseNote` — причина паузы (поле для on_pause)
- `developmentStage` — стадия разработки (производство / моделирование / чертеж)
- `stockStatus` — in_stock / out_of_stock / expected
- `inTransit` — товар в пути (ещё не на складе)
- `isSupplied` + `supplier.{company, contactName, sku}` — привозной товар от стороннего производителя
- `developmentTZ`, `improvementTZ` — технические задания с файлами
- `tenderCompleted`, `tenderAssignee` — поля для системы тендеров

## Модель User (ключевые поля)

- `role`: user / owner / editor / viewer / banned
- `isPending`, `lastSeen`
- `telegramChatId` — для Telegram уведомлений (привязывается через /start userId в боте)

## Модель News

Новостная лента для командной коммуникации.
- `type`: discontinued / nelikvid / out_of_stock / restocked / price_change / custom / new_product / status_*
- `product` — снимок данных товара (id, name, brand, set, stock, images)
- `recipients` — массив пользователей с флагом `read`
- Авто-публикация при смене статуса товара

## Синхронизация с 1С

- `server/syncStock.js` — обновляет остатки по Excel выгрузке из 1С
- `server/preview-nomenclature` + `confirm-nomenclature` — импорт новых товаров из номенклатуры 1С с preview
- Матчинг по `norm(p.fullName)` с именами из 1С

## Уведомления

- **Email:** Resend API (заменили Gmail SMTP в мае 2026)
- **Telegram:** `server/lib/telegram.js` — бот для push-уведомлений о новостях. Привязка через `/start userId` в Telegram.

## Сброс пароля / восстановление доступа (2026-07-15)

- Пароли хешируются bcrypt в `User.pre('save')` — узнать исходный пароль НЕВОЗМОЖНО, только сбросить.
- **Email-сброс через Resend не работает у пользователя**: Resend не настроен как надо (владелец не знает про Resend; домен скорее всего НЕ подтверждён → шлётся с `<почта>`, а это позволяет слать только на email владельца аккаунта). Плюс был баг: `resend.emails.send()` не бросает исключение, а возвращает `{error}` — ошибка молча терялась, юзер видел «письмо отправлено». Исправлено в `sendPasswordReset` (mailer.js): проверка `{error}` + throw при отсутствии ключа.
- **Рабочее решение — сброс пароля владельцем из админки** (не требует почты, сохраняет аккаунт и статистику): эндпоинт `PATCH /admin/users/:id/password` (middleware `admin` = только owner), кнопка «🔑 Пароль» + модалка в `AdminUsers.jsx`. API: `adminSetUserPassword`.
- Диагностика почты: `server/testMail.js` (`node testMail.js email` с production RESEND_API_KEY) — печатает точную ошибку Resend.
- **How to apply:** если снова «письма не приходят» — сперва проверь, подтверждён ли домен в Resend и заданы ли `RESEND_API_KEY`/`FROM_EMAIL`/`SITE_URL` в Render. Для быстрого решения — сброс пароля через админку.

## Версионирование

- `GET /api/version` — возвращает timestamp старта сервера
- Фронтенд поллит этот эндпоинт и делает `location.reload()` при изменении версии (авто-обновление при новом деплое)

## Видео-съёмки (2026 июль)

- Модель `VideoSchedule` (frontman + product + plannedDate + isCompleted), страницы AdminVideoSchedule (планирование фронтмена), AdminVideoReport (сводка), AdminVideoReportDetail (детально по фронтмену: календарь, снято/план/не снято).
- **Важно:** `Product.hasVideo` — глобальный флаг товара; «снято» у фронтмена считать ТОЛЬКО по его completed-записям VideoSchedule. Сеты пересекаются между фронтменами (kosh-keliniz: Санира+Амантур и т.д.), глобальный флаг завышает чужие счётчики. При удалении completed-записи флаг сбрасывается (fix 2026-07-06).

## Решённые проблемы (2026 май)

- Дубликаты товаров — `renameToMatch1C.js` переименовал 81 товар, удалил 80 пустых дубликатов. Итого ~942 товара.
- 11 товаров без аналога в 1С (оставлены): Bosogo 9SW, Karagay, Asyl, Zina Diamond, Taitemir, Muradyl, Orion, Novel, Queen 3, Queen 4, ЩР IP31 40х30х155.
- onoi-sakta сет разделён: HOME → baary-oorunda, промышленные остались в SHAAR/onoi-sakta.

- **Локальная MongoDB** (`server/.env` → localhost:27017, данные /opt/homebrew/var/mongodb, 254 МБ): автозапуск выключен 16.11.2026. Для локальной проверки сайта запускать вручную: `mongod --config /opt/homebrew/etc/mongod.conf --fork`. `brew services` ругается на untrusted tap mongodb/brew.
