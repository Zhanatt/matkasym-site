/**
 * 3D-рендеры урны F1 (ДУ0188.2) → R2 products/f1-3d/ для каталога 0-TASTANDY.
 * Кадры с ведром (05, 07) не берём — так сказал пользователь. В базу ничего не пишет, печатает ссылки.
 */
const sharp=require('sharp'); const path=require('path'); require('dotenv').config({path:path.join(__dirname,'..','.env')});
const storage=require('../lib/storage');
const DIR='/Users/zhanat/Downloads/Урна F1 — 3D рендер';
const FILES=['01 Три четверти','02 Анфас','03 Сбоку','04 Сзади','06 Дверца открыта, без ведра','08 Окно для мусора','09 Сверху','10 Листок Таштанды Organic'];
(async()=>{const stamp=Date.now();
 for(const [i,f] of FILES.entries()){
  const buf=await sharp(path.join(DIR,f+'.png')).resize(1600,1600,{fit:'inside'}).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
  const url=await storage.put(`products/f1-3d/${stamp}-${String(i+1).padStart(2,'0')}.png`,buf,'image/png');
  console.log(JSON.stringify(f),':',JSON.stringify(url)+',');
 }})().catch(e=>{console.error(e);process.exit(1)});
