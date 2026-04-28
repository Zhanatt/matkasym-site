# MATKASYM — Контекст проекта

## Что это
E-commerce сайт + PIM система ("Продакт матрица") для MATKASYM — кыргызского производителя товаров для дома.

## Стек
- **Frontend:** React 18 + Vite, React Router v6
- **Backend:** Express.js (Node.js)
- **БД:** MongoDB + Mongoose (Atlas M0 free)
- **Фото:** Cloudinary (все фото уже перенесены туда)
- **Email:** Nodemailer + Gmail SMTP
- **Auth:** JWT (30 дней), роли: user / admin
- **Деплой:** Render (Node.js Web Service) — один сервис, Express раздаёт React build

## Репозиторий
- GitHub: https://github.com/Zhanatt/matkasym-site.git
- Сайт: https://matkasym-site.onrender.com
- Продакт матрица: https://matkasym-site.onrender.com/admin/login

## Структура папок
```
matkasym-site/
├── client/          # React (Vite)
│   └── src/
│       ├── pages/
│       │   ├── admin/       # AdminLayout, AdminLogin, AdminProducts, AdminProductForm, AdminDashboard, AdminResetPassword
│       │   ├── Home, Catalog, ProductPage, Cart, Checkout, Login, Register, Orders, Favorites, Sets, Brand
│       ├── context/         # AuthContext (saveLogin/logout), CartContext
│       ├── api/index.js     # все axios вызовы
│       ├── components/      # Header, Footer, ImageUploader, SelectWithAdd
│       └── config/          # categorySpecs.js
├── server/
│   ├── models/      # User.js, Product.js, Brand.js, Order.js
│   ├── routes/      # auth.js, products.js, admin.js, brands.js, orders.js
│   ├── middleware/  # auth.js (protect, admin)
│   ├── lib/         # cloudinary.js, mailer.js
│   ├── index.js     # Express entry point
│   ├── createAdmin.js    # скрипт создания/обновления admin пользователя
│   ├── migrateImages.js  # скрипт миграции imgbb → Cloudinary (уже выполнен)
│   └── seedProducts.js   # 60 товаров (уже залито)
└── package.json (root) — build + start скрипты для Render
```

## Credentials (локальные / сервер)

### MongoDB Atlas
- URI: `mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0`
- Пользователь БД: `zhanat_db_user` / `oDaCJQeuD2mjTpGp`
- IP Whitelist: 0.0.0.0/0 (открыт для всех)

### Cloudinary
- Cloud name: `dnbg21ef8`
- API Key: `517988148957995`
- API Secret: `80b7xJz8J_kRnDXJbhU3bxEfIMA`
- Папка: `matkasym/`

### Gmail (для email)
- User: `zhanattool@gmail.com`
- App Password: `awsbxdmzetppvuac` (добавлен в Render env)

### Admin аккаунт (Продакт матрица)
- Email: `zhanattool@gmail.com`
- Пароль: `Matkasym123`

### Render env vars (должны быть установлены)
```
MONGO_URI=mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0
JWT_SECRET=matkasym_super_secret_key_2026
GMAIL_USER=zhanattool@gmail.com
GMAIL_APP_PASSWORD=awsbxdmzetppvuac
NODE_ENV=production
SITE_URL=https://matkasym-site.onrender.com
```

### Локальный .env (server/.env)
```
PORT=5001
MONGO_URI=mongodb://localhost:27017/matkasym
JWT_SECRET=matkasym_super_secret_key_2026
CLIENT_URL=http://localhost:5173
CLOUDINARY_CLOUD_NAME=dnbg21ef8
CLOUDINARY_API_KEY=517988148957995
CLOUDINARY_API_SECRET=80b7xJz8J_kRnDXJbhU3bxEfIMA
```

## Модель Product (ключевые поля)
```js
name, fullName, sku
brand, set, setLevel, color, category
priceCost      // Себестоимость
priceWholesale // Оптовая цена
priceDealer    // Дилерская цена
price          // Розничная цена (показывается на сайте)
dimensions, specs [{key, value}]
images []      // Cloudinary URLs
inStock, isNew, stock
```

## Модель User
```js
name, email, password (bcrypt)
role: 'user' | 'admin'
isPending: Boolean  // true = ждёт подтверждения admin
resetPasswordToken, resetPasswordExpires  // для сброса пароля
favorites []
```

## Ключевые API эндпоинты
```
POST /api/auth/register       — регистрация (isPending=true, email admin)
POST /api/auth/login          — вход
GET  /api/auth/approve/:id    — подтвердить пользователя (ссылка в письме)
GET  /api/auth/reject/:id     — отклонить (ссылка в письме)
POST /api/auth/forgot-password — сброс пароля (отправляет email)
POST /api/auth/reset-password/:token — установить новый пароль

GET  /api/products            — каталог (фильтры: brand, set, category)
GET  /api/admin/products/facets — зависимые фильтры (brand→set→category)
```

## Что сделано
- [x] 60 товаров в БД с фото и характеристиками
- [x] Все фото перенесены imgbb → Cloudinary
- [x] Деплой на Render (https://matkasym-site.onrender.com)
- [x] Продакт матрица (admin панель) с фильтрами и зависимыми сетами
- [x] Авторизация: вход, регистрация с подтверждением по email
- [x] Восстановление пароля по email
- [x] Мобильная адаптация (сайт + admin)
- [x] 4 типа цен: Себестоимость / Оптовая / Дилерская / Розничная

## Что ещё не сделано / возможные следующие шаги
- [ ] Добавить Gmail App Password в Render env (awsbxdmzetppvuac) → проверить отправку писем
- [ ] Наполнить цены для 60 товаров (сейчас у многих price=0)
- [ ] Настроить оплату (если нужно)

## Скрипты для запуска вручную
```bash
# Создать/обновить admin пользователя
cd server && MONGO_URI="mongodb+srv://..." node createAdmin.js

# Миграция фото (уже выполнена)
cd server && node migrateImages.js
```

## Как запустить локально
```bash
# Terminal 1 — backend
cd server && npm install && node index.js

# Terminal 2 — frontend
cd client && npm install && npm run dev
```
