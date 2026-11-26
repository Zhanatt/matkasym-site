const mongoose=require('mongoose');
const uri=require('/Users/zhanat/matkasym-site/server/lib/atlas');
(async()=>{
  await mongoose.connect(uri);
  const Product=require('/Users/zhanat/matkasym-site/server/models/Product');
  const ps=await Product.find({$or:[{name:/ADIK/i},{sku:/^MKS-A[HS]-/}]},'sku name stock isOnOrder inTransit productStatus set supplier price').lean();
  console.log('Карточек ADIK в базе:',ps.length);
  for(const p of ps) console.log(`  ${(p.sku||'—').padEnd(20)} ${String(p.name).slice(0,58).padEnd(60)} ост ${String(p.stock).padStart(3)}  ${p.isOnOrder?'в заказе ':''}${p.inTransit?'в пути ':''}${p.supplier?.company||''}`);
  try{
    const PR=require('/Users/zhanat/matkasym-site/server/models/ProductRequest');
    const rs=await PR.find({}).sort({createdAt:-1}).limit(40).lean();
    const sh=rs.filter(r=>/стеллаж|ADIK/i.test(JSON.stringify(r)));
    console.log('\nЗаявок на закуп со стеллажами:',sh.length);
    for(const r of sh) console.log('  ',new Date(r.createdAt).toLocaleDateString('ru'), r.productName||r.name||'', '| кол-во', r.quantity??r.qty??'', '| статус', r.status);
  }catch(e){console.log('\nProductRequest:',e.message);}
  await mongoose.disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
