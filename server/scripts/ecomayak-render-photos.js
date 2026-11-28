/**
 * 3D-рендеры урны Ecomayak → карточка «Мусорная урна "Ecomayak" (Красная)».
 * Квадратные PNG 1600×1600 на белом (пользователь просил PNG).
 * Без --apply только показывает план. С --apply: бэкап карточки, загрузка в R2 (Cloudinary отключён),
 * ужатие до 1600×2000 JPG q85 — R2 не режет размеры на лету,
 * images = рендеры (первый — главное фото).
 */
const mongoose=require('mongoose'); const sharp=require('sharp'); const storage=require('../lib/storage');
const fs=require('fs'); const path=require('path');
require('dotenv').config({ path: path.join(__dirname,'..','.env') });
const uri=require('../lib/atlas'); const Product=require('../models/Product');
const ID='6ac9c1a0da2d6b22089d6aa4';
const DIR='/Users/zhanat/Downloads/Урна Ecomayak — 3D рендер';
const FILES=['01 Три четверти','02 Анфас, отверстие для бутылок','03 Сбоку, листок','04 Сзади, дверца','05 Дверца открыта',
 '06 Снизу','07 Крыша','08 Фонарь с солнечной панелью','09 Отверстие крупно','10 Листок Желим Plastic','11 Сетка','12 Ушко под замок']
 .map(f=>path.join(DIR,f+'.png'));
const APPLY=process.argv.includes('--apply');
(async()=>{
  for(const f of FILES) if(!fs.existsSync(f)) throw new Error('нет файла '+f);
  await mongoose.connect(uri);
  const p=await Product.findById(ID).lean(); if(!p) throw new Error('карточка не найдена');
  console.log('Карточка:',p.fullName,'| сейчас фото:',(p.images||[]).length);
  FILES.forEach((f,i)=>console.log(` ${i+1}. ${path.basename(f)}`));
  if(!APPLY){console.log('\nПредпросмотр. Для записи: --apply'); return mongoose.disconnect();}
  const bk=path.join(__dirname,`backup-ecomayak-render-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(bk,JSON.stringify({_id:ID,images:p.images||[],driveImages:p.driveImages||[]},null,1)); console.log('бэкап',bk);
  const urls=[];
  const stamp=Date.now();
  for(const [i,f] of FILES.entries()){
    const buf=await sharp(f).resize(1600,1600,{fit:'inside'}).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
    const url=await storage.put(`products/ecomayak-3d/${stamp}-${String(i+1).padStart(2,'0')}.png`,buf,'image/png');
    urls.push(url); console.log(' ⬆',path.basename(f),(buf.length/1024|0)+' КБ →',url);}
  await Product.updateOne({_id:ID},{$set:{images:urls}});
  console.log('✓ images обновлены:',urls.length); await mongoose.disconnect();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
