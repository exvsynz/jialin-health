/* D 階段：mock 的 sample 讀截圖時的固定回覆（全部是假資料，沒有真實的人、醫院或數值）。
   瀏覽器裡是 window.__shotFixtures，node 裡是 module.exports。值是回覆的字串、{text,truncated}、{error}，或依序取用的陣列。
   用法：harness 的 cfg.sample.shot = '情境名'。 */
(function(g){
const J=o=>JSON.stringify(o);
const lab=(o)=>({type:'lab',date:'115/10/20',reportDate:null,place:'測試醫院',order:null,flag:null,unit:null,ref:null,unclear:[],...o});
const rep=(o)=>({type:'report',date:'2026/10/18',reportDate:null,place:'測試醫院',title:null,class:null,unclear:[],...o});
const F={
  /* 一筆甲狀腺抽血：民國日期、H 旗標 */
  single:J({items:[
    lab({order:'甲狀腺刺激素',name:'TSH',value:'H 5.2',unit:'μIU/mL',ref:'0.27-4.20'}),
    lab({order:'游離甲狀腺素',name:'FREE T4',value:'1.10',unit:'ng/dL',ref:'0.93-1.70'})]}),
  /* 同一天的甲狀腺與生殖軸激素；兩張截圖重疊，TSH 出現兩次 */
  multi:J({items:[
    lab({name:'TSH',value:'2.30',unit:'uIU/mL',ref:'0.27-4.20'}),
    lab({name:'FT4',value:'1.25',unit:'ng/dL',ref:'0.93-1.70'}),
    lab({name:'TSH',value:'2.30',unit:'uIU/mL',ref:'0.27-4.20'}),
    lab({name:'Estradiol',value:'85.2',unit:'pg/mL',ref:null}),
    lab({name:'FSH',value:'6.1',unit:'mIU/mL',ref:null}),
    lab({name:'LH',value:'L 1.2',unit:'mIU/mL',ref:'2.4-12.6'})]}),
  /* 對不到的檢驗：混在對得到的裡面，另一天只有對不到的 */
  unmapped:J({items:[
    lab({name:'TSH',value:'1.80',unit:'μIU/mL'}),
    lab({name:'FT3',value:'3.1',unit:'pg/mL',ref:'2.0-4.4'}),
    lab({name:'Free testosterone',value:'0.9',unit:'pg/mL'}),
    lab({date:'115/09/01',name:'LDL-C',value:'H 135',unit:'mg/dL',ref:'<130'})]}),
  /* 單位：pmol/L 與 ng/mL 不同，mIU/L 視為相同 */
  unit:J({items:[
    lab({name:'TSH',value:'2.0',unit:'mIU/L'}),
    lab({name:'Free T4',value:'15.4',unit:'pmol/L',ref:'12-22'}),
    lab({name:'Testosterone',value:'0.35',unit:'ng/mL'}),
    lab({name:'E2',value:'60',unit:null})]}),
  /* 讀不清楚：一個值看不清楚、日期看不清楚；另一份只有報告日期 */
  unclear:J({items:[
    lab({date:null,name:'TSH',value:null,unit:'μIU/mL',unclear:['value','date']}),
    lab({date:null,name:'Free T4',value:'1.2',unit:'ng/dL',unclear:['date']}),
    rep({date:null,reportDate:'115/10/25',exam:'thy_us',title:'Thyroid sonography',text:'Both lobes: no nodule.',unclear:['date']})]}),
  /* 和 harness 種子資料的 records/r3（甲狀腺抽血 2026-07-01）同一天 */
  dup:J({items:[lab({date:'2026-07-01',name:'TSH',value:'2.2',unit:'μIU/mL'})]}),
  /* 報告分類 */
  report:J({items:[
    rep({exam:'breast_us',title:'Breast sonography',class:'BI-RADS 3',text:'Right breast 10 o\'clock 0.6 cm hypoechoic nodule. BI-RADS category 3.'}),
    rep({date:'2026/10/12',exam:'lung_ldct',title:'Low dose chest CT',class:'Lung-RADS v2022 category 2S',text:'Tiny nodule 3 mm. Lung-RADS v2022 category 2S. Coronary calcification.'}),
    rep({date:'2026/10/05',exam:'thy_us',title:'Thyroid sonography',class:'TI-RADS 3',text:'Left lobe 1.1 cm nodule, ACR TI-RADS 3.'}),
    rep({date:'2026/09/30',exam:'gi_colo',title:'Colonoscopy',class:null,text:'Two small polyps at sigmoid colon, polypectomy done.'})]}),
  /* 兩側分類不同、BI-RADS 6 */
  reportMulti:J({items:[
    rep({exam:'breast_mammo',title:'Mammography',class:'R: BI-RADS 2; L: BI-RADS 3',text:'R: BI-RADS 2. L: BI-RADS 3.'}),
    rep({date:'2026/10/01',exam:'breast_us',title:'Breast sonography',class:'BI-RADS 6',text:'Known malignancy. BI-RADS 6.'})]}),
  /* 報告裡有像身分證號的字串 */
  pii:J({items:[rep({exam:'breast_us',title:'Breast sonography',class:'BI-RADS 2',text:'ID A123456789 / A12****789. Benign cyst. BI-RADS 2.'})]}),
  /* 同一個欄位兩個不同的值 */
  conflict:J({items:[lab({name:'TSH',value:'5.2',unit:'μIU/mL'}),lab({name:'TSH',value:'5.3',unit:'μIU/mL'}),lab({name:'Free T4',value:'1.0',unit:'ng/dL'})]}),
  /* 跳脫：讀出的文字含 HTML */
  xss:J({items:[rep({exam:'breast_us',title:'<img src=x onerror="window.__xss=1">',text:'<script>window.__xss=1</script> "quoted" BI-RADS 1'})]}),
  empty:J({items:[]}),
  bad:'讀不出來，這不是 JSON',
  partial:J({items:[{type:'lab',name:'TSH',value:'1.5',unit:'μIU/mL',date:'115/10/20',place:'測試醫院'},{type:'weird'},{type:'lab',value:'3'}]}),
  truncated:{text:'{"items":[{"type":"lab","name":"TSH"',truncated:true}
};
if(typeof module!=='undefined'&&module.exports)module.exports=F;else g.__shotFixtures=F;
})(typeof window!=='undefined'?window:this);
