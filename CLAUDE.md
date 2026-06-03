# Matkasym Site - Инструкции для Claude

## Стек
- **Frontend:** React + Vite, развёрнут на Render
- **Backend:** Node.js + Express
- **База данных:** MongoDB Atlas (НЕ локальная!)
- **Изображения:** Cloudinary

## ВАЖНО: База данных

**Production MongoDB URI:**
```
mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym
```

Локальный `.env` указывает на `localhost:27017` — это НЕ production база!
При добавлении/изменении товаров ВСЕГДА использовать Atlas URI выше.

## Модель Product — обязательные поля

```javascript
{
  name: String,      // ОБЯЗАТЕЛЬНО! Используется для группировки в UI
  fullName: String,  // ОБЯЗАТЕЛЬНО!
  sku: String,       // Артикул (MKS-XXXX)
  brand: String,     // 'matkasym-home', 'matkasym-shaar'
  set: String,       // slug сета (например 'uzak-koldon')
  category: String,  // Категория товара
  price: Number,     // Цена (0 если priceUndefined: true)
  priceCost: Number, // Себестоимость / цена поставщика
  stock: Number,     // Количество на складе
  images: [String],  // URL картинок в Cloudinary
  isSupplied: Boolean, // true = привозной товар
  supplier: {
    company: String,   // Название поставщика
    sku: String        // Артикул у поставщика
  }
}
```

**НЕ использовать поле `title`** — его нет в модели!

## Поставщики (Suppliers)

При добавлении привозных товаров (isSupplied: true):
1. СНАЧАЛА создать поставщика в коллекции `suppliers`
2. ПОТОМ привязать товары

```javascript
// Модель Supplier
{
  name: String,      // Название компании
  phone: String,
  instagram: String,
  notes: String,
  products: [ObjectId] // Массив ID товаров
}
```

## Группировка товаров в UI

В `AdminSets.jsx` товары группируются по полю `name`:
```javascript
const grouped = {};
products.forEach(p => {
  if (!grouped[p.name]) grouped[p.name] = [];
  grouped[p.name].push(p);
});
```

Если у товаров одинаковый `name` — они отображаются как варианты одного товара!

## Render — ограничения

- Free tier: 512MB RAM
- Тяжёлые операции (парсинг Excel с картинками) делать на клиенте
- Деплой автоматический при push в main

## Артикулы

- Собственные товары: без префикса или с префиксом по бренду
- Привозные товары: `MKS-` + артикул поставщика (например `MKS-W055K`)
