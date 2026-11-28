/**
 * Удаление скамеек Kalyn, Dem Aluu, Bakyt и навеса Kölökö (сет mazza-seyil) — решение пользователя 28.11.2026.
 * Без --apply только печатает. С --apply: полная копия документов в JSON, удаление, запись «deleted» в ProductLog.
 * Фото в хранилище не трогаем.
 */
const mongoose=require('mongoose'); const fs=require('fs'); const path=require('path');
const uri=require('../lib/atlas'); const Product=require('../models/Product'); const ProductLog=require('../models/ProductLog');
const IDS=['6a643e56228fc37217d7a342','6a643e57228fc37217d7a34e','6a23c5a162432d59269b0287','6a05c3217f2c7b50e45989ec'];
const APPLY=process.argv.includes('--apply');
(async()=>{await mongoose.connect(uri);
 const docs=await Product.find({_id:{$in:IDS}}).lean();
 docs.forEach(d=>console.log('•',d.fullName,'|',d.sku,'|',d.set,'| остаток',d.stock));
 const kits=await Product.find({'kitParts.product':{$in:IDS}},'fullName').lean();
 if(kits.length) throw new Error('используются в комплектах: '+kits.map(k=>k.fullName));
 if(!APPLY){console.log('\nПредпросмотр. Для удаления: --apply'); return mongoose.disconnect();}
 const bk=path.join(__dirname,`backup-mazza-benches-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
 fs.writeFileSync(bk,JSON.stringify(docs,null,1)); console.log('бэкап',bk);
 for(const d of docs){
  await Product.deleteOne({_id:d._id});
  await ProductLog.create({action:'deleted',productId:d._id,productName:d.fullName||d.name,sku:d.sku||'',brand:d.brand||'',source:'manual',sourceUrl:'',changedBy:{name:'Claude (по просьбе Жаната)'}});
  console.log('✓ удалён',d.fullName);
 }
 await mongoose.disconnect();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
