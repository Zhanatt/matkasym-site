/**
 * Характеристики трёх карточек, получивших 3D-рендеры 28.11.2026.
 * Габариты и вес (сталь 7850 кг/м³) посчитаны по STEP-моделям; цвета — со слов пользователя;
 * объём Tazalyk — как у соседних карточек Tazalyk 1100 л.
 * Без --apply только печатает. С --apply — бэкап в JSON и запись.
 */
const mongoose=require('mongoose'); const fs=require('fs'); const path=require('path');
const uri=require('../lib/atlas'); const Product=require('../models/Product');
const S=(key,value,options=[])=>({key,value,options});
const CARDS={
 '6af1781453924e6aa16a4761':{ // Tazalyk с крышкой, тёмно-серый
  category:'Мусорные баки',
  dimensions:'149 × 104 × 136 см',
  description:'Металлический контейнер для отходов Tazalyk 1100 л с крышкой и откидным клапаном для мелкого мусора. Четыре поворотных колеса Ø200 мм, два из них с тормозом. Сбоку встроенная пепельница, на стенках шильды «Таштанды Organic». Порошковая окраска.',
  specs:[S('материал','Металл, порошковая окраска'),S('Объём','1100 л'),S('Тип','Уличный мусорный бак'),
   S('Крышка','есть, с откидным клапаном'),S('Колёса','4 поворотных Ø200 мм, 2 с тормозом'),S('Пепельница','есть'),
   S('Цвет','тёмно-серый (графит)'),S('Габариты ДxШxВ','1492 × 1038 × 1361 мм'),S('Вес','≈ 100 кг')]},
 '6ac9c1a0da2d6b22089d6aa4':{ // Ecomayak красная
  category:'Уличные урны',
  dimensions:'98 × 87 × 187 см',
  description:'Уличная урна-сетка Ecomayak для сбора пластиковых бутылок. Каркас из стального листа и сварной сетки, крыша с кронштейном для фонаря, круглая горловина для бутылок. Для выгрузки — сетчатая дверца на петлях с ушком под замок. Накладки «Желим Plastic». Порошковая окраска.',
  specs:[S('Тип','Урна для пластиковых бутылок'),S('Материал','Металл: лист и сварная сетка, порошковая окраска'),
   S('Габариты ДxШxВ','984 × 868 × 1872 мм (с фонарём)'),S('Крышка','крыша'),S('Дверца для выгрузки','есть, с ушком под замок'),
   S('Колёса','нет'),S('Педаль','нет',['есть','нет']),S('Цвет','красный RAL 3020, накладки жёлтые RAL 1026'),S('Вес','≈ 32 кг')]},
 '6af1781453924e6aa16a4763':{ // TAZA KUBAT 570×350
  category:'Уличные урны',
  dimensions:'Ø37 × 57 см',
  description:'Урна для сбора использованных батареек TAZA KUBAT. Внутри съёмное ведро ≈ 30 л, на крышке — клапан-качелька, который сам возвращается в закрытое положение. Надписи «Батареялар үчүн» и «Для батареек» вырезаны лазером. Порошковая окраска.',
  specs:[S('Тип','Урна для батареек'),S('Материал','Металл, порошковая окраска'),S('Габариты ДxШxВ','Ø374 × 574 мм (корпус Ø344)'),
   S('Крышка','качающаяся',['есть','нет','педальная','качающаяся']),S('Ведро','съёмное, ≈ 30 л'),
   S('Цвет','корпус жёлтый, крышка и основание чёрные'),S('Вес','≈ 8 кг')]},
};
const APPLY=process.argv.includes('--apply');
(async()=>{await mongoose.connect(uri);
 const docs=await Product.find({_id:{$in:Object.keys(CARDS)}}).lean();
 for(const d of docs){const c=CARDS[d._id];
  console.log(`\n■ ${d.fullName}\n  категория: ${d.category} → ${c.category}\n  габариты: «${d.dimensions}» → «${c.dimensions}»\n  было характеристик: ${(d.specs||[]).length}`);
  c.specs.forEach(s=>console.log(`   · ${s.key}: ${s.value}`)); console.log('  описание:',c.description);}
 if(!APPLY){console.log('\nПредпросмотр. Для записи: --apply'); return mongoose.disconnect();}
 const bk=path.join(__dirname,`backup-render-cards-specs-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
 fs.writeFileSync(bk,JSON.stringify(docs.map(d=>({_id:d._id,category:d.category,dimensions:d.dimensions,description:d.description,specs:d.specs})),null,1));
 console.log('\nбэкап',bk);
 for(const [id,c] of Object.entries(CARDS)) await Product.updateOne({_id:id},{$set:c});
 console.log('✓ записано',Object.keys(CARDS).length); await mongoose.disconnect();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
