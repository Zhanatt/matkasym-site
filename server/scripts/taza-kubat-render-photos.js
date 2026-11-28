/**
 * 3D-рендеры урны для батареек → «Урна для батареек TAZA KUBAT 570х350 мм (с ведром)».
 * Квадратные PNG 1600×1600 на белом (пользователь просил PNG).
 * Без --apply только показывает план. С --apply: бэкап карточки, загрузка в R2 (Cloudinary отключён),
 * ужатие до 1600×2000 JPG q85 — R2 не режет размеры на лету,
 * images = рендеры (первый — главное фото).
 */
const mongoose=require('mongoose'); const sharp=require('sharp'); const storage=require('../lib/storage');
const fs=require('fs'); const path=require('path');
require('dotenv').config({ path: path.join(__dirname,'..','.env') });
const uri=require('../lib/atlas'); const Product=require('../models/Product');
const ID='6af1781453924e6aa16a4763';
const DIR='/Users/zhanat/Downloads/Таза кубат — 3D рендер';
const FILES=['01 Три четверти','02 Анфас, Батареялар үчүн','03 Анфас, Для батареек','04 Сбоку, ручка','05 Сверху, крышка',
 '06 Клапан-качелька открыт','07 Клапан-качелька крупно','09 Ведро вынуто, сверху 1','10 Ведро 1']
 .map(f=>path.join(DIR,f+'.png'));
const APPLY=process.argv.includes('--apply');
(async()=>{
  for(const f of FILES) if(!fs.existsSync(f)) throw new Error('нет файла '+f);
  await mongoose.connect(uri);
  const p=await Product.findById(ID).lean(); if(!p) throw new Error('карточка не найдена');
  console.log('Карточка:',p.fullName,'| сейчас фото:',(p.images||[]).length);
  FILES.forEach((f,i)=>console.log(` ${i+1}. ${path.basename(f)}`));
  if(!APPLY){console.log('\nПредпросмотр. Для записи: --apply'); return mongoose.disconnect();}
  const bk=path.join(__dirname,`backup-taza-kubat-render-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(bk,JSON.stringify({_id:ID,images:p.images||[],driveImages:p.driveImages||[]},null,1)); console.log('бэкап',bk);
  const urls=[];
  const stamp=Date.now();
  for(const [i,f] of FILES.entries()){
    const buf=await sharp(f).resize(1600,1600,{fit:'inside'}).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
    const url=await storage.put(`products/taza-kubat-3d/${stamp}-${String(i+1).padStart(2,'0')}.png`,buf,'image/png');
    urls.push(url); console.log(' ⬆',path.basename(f),(buf.length/1024|0)+' КБ →',url);}
  await Product.updateOne({_id:ID},{$set:{images:urls}});
  console.log('✓ images обновлены:',urls.length); await mongoose.disconnect();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
