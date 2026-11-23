---
name: feedback-modal-positioning
description: Модалки центрировать по экрану — transform у родителя ломает position:fixed
---

Модальные окна ВСЕГДА должны открываться по центру ЭКРАНА пользователя, а не по центру страницы.

**Why:** Реальная причина бага в matkasym-site (июль 2026): если у ЛЮБОГО родителя есть `transform` (а также `filter`, `perspective`, `will-change: transform`), то `position: fixed` у потомков позиционируется относительно этого родителя, а не viewport. В Admin.css было `.admin-page { animation: fadeInUp .28s ... both; }` — fill-mode `both` навсегда оставлял `transform: translateY(0)` на обёртке страницы, и все модалки внутри центрировались по высоте всей страницы.

**How to apply:**
1. У анимаций входа на контейнерах-обёртках НЕ использовать fill-mode `both`/`forwards`, если keyframes содержат transform — после анимации transform останется и сломает fixed-потомков. Либо убрать fill-mode, либо заканчивать keyframe на `transform: none`.
2. При баге «модалка не по центру экрана» — первым делом искать transform/animation на предках (`.admin-page`, обёртки страниц), а не крутить стили самой модалки.
3. Сами модалки: `position: fixed; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; z-index: 9999`.
4. Самый надёжный вариант для новых модалок — React portal в `document.body` (`createPortal`), тогда transform предков вообще не влияет.
