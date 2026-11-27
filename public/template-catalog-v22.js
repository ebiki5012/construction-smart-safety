/* Shared classification and illustrative construction risk prompts. No example is an approved assessment. */
(function(root,factory){const catalog=factory();if(typeof module==='object'&&module.exports)module.exports=catalog;else root.V22Catalog=catalog;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const groups=[
 ['common','공통·가설', '통로,정리정돈,가설,안전시설,개구부,동절기,폭염,화재,공통'],
 ['earth','토공·흙막이','굴착,흙막이,터파기,되메우기,토공,사면,지반,천공,항타'],
 ['frame','골조·철근콘크리트','철근,거푸집,동바리,콘크리트,타설,형틀,골조,철골,데크'],
 ['scaffold','비계·고소작업','비계,고소작업,작업발판,사다리,달비계,고소작업대'],
 ['lifting','양중·건설기계','양중,크레인,호이스트,지게차,굴삭기,장비,덤프,인양,리프트'],
 ['finish','마감·내외장','미장,조적,타일,도장,방수,창호,유리,석재,천장,마감,단열,외장,목공'],
 ['mep','전기·기계·설비','전기,배관,덕트,용접,설비,소방,분전반,케이블,밀폐,가스'],
 ['demo','해체·철거','해체,철거,절단,철거물,폐기물'],
 ['other','기타·미분류','']
 ].map(([id,name,words])=>({id,name,words:words.split(',').filter(Boolean)}));
 const types=['추락','낙하·비래','끼임·충돌','붕괴','감전','화재·폭발','질식·유해물질','넘어짐','근골격계','기타'];
 const patterns=[/추락|떨어짐|떨어질|개구부/,/낙하|비래|낙물|튀어|떨어지는 자재/,/끼임|협착|충돌|부딪|말림|접촉/,/붕괴|무너|전도|매몰/,/감전|누전/,/화재|폭발|불티|발화/,/질식|산소|유해|분진|중독|가스|흄/,/넘어짐|미끄|걸려|걸림/,/근골격|허리|중량물|반복/];
 const text=x=>String(x??'').normalize('NFKC').trim().toLowerCase();
 const validCategory=id=>typeof id==='string'&&groups.some(g=>g.id===id);
 const categoryName=id=>groups.find(g=>g.id===id)?.name||'';
 const areaLabel=row=>[categoryName(row.category),row.area].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ');
 function classify(row){if(groups.some(g=>g.id===row.category))return row.category;for(const field of [row.work,row.area,row.name]){const value=text(field);const matches=groups.filter(g=>g.words.some(w=>value.includes(w)));if(matches.length){const sorted=matches.map(g=>[g,Math.max(...g.words.filter(w=>value.includes(w)).map(w=>w.length))]).sort((a,b)=>b[1]-a[1]);return sorted[0][0].id;}}return 'other';}
 function hazardType(row){if(types.includes(row.hazard_type))return row.hazard_type;const i=patterns.findIndex(p=>p.test(text(row.hazard)));return types[i<0?types.length-1:i];}
 const examples=[
 ['common','작업 통로 정리','넘어짐','통로에 적치된 자재·전선에 걸려 넘어짐','통로를 확보하고 자재·전선을 정리한다. 미끄러운 곳은 제거하거나 통제한다.'],
 ['common','개구부 주변 작업','추락','방호조치가 없는 개구부로 추락','개구부 덮개 또는 안전난간의 설치·고정 상태를 확인한다. 미설치 구간은 출입을 통제한다.'],
 ['common','동절기 작업','넘어짐','결빙된 통로에서 미끄러짐','작업 전 결빙 구간을 점검하고 제빙·미끄럼 방지 및 출입 통제를 실시한다.'],
 ['common','자재 적치','낙하·비래','불안정하게 쌓은 자재가 떨어져 맞음','평탄한 곳에 안정적으로 적치하고 전도·낙하 방지 조치를 확인한다.'],
 ['earth','굴착 작업','붕괴','굴착면 붕괴로 작업자가 매몰됨','지반과 굴착면 상태를 확인하고 계획에 따른 흙막이·사면 보호를 실시한다. 이상 징후 시 작업을 중지한다.'],
 ['earth','굴착부 주변 이동','추락','굴착부 가장자리에서 추락','가장자리에 안전난간 등 방호시설을 설치하고 안전한 출입로를 확보한다.'],
 ['earth','흙막이 점검','붕괴','흙막이 변형·이탈로 붕괴','계획에 따른 설치 상태와 변형·누수 등을 점검한다. 이상 시 출입을 통제하고 전문가 확인 후 재개한다.'],
 ['earth','되메우기 작업','끼임·충돌','후진 장비와 작업자 충돌','장비 이동구역과 보행구역을 분리하고 유도자 배치 등 접근 통제 조치를 실시한다.'],
 ['frame','철근 운반·배근','근골격계','중량 철근을 무리하게 운반하여 허리 부담','운반 장비와 보조도구를 활용하고 적절한 인원으로 운반한다.'],
 ['frame','철근 조립','추락','슬래브 단부·개구부에서 추락','작업발판과 단부·개구부 방호시설을 확인하고 필요한 추락방지 조치를 실시한다.'],
 ['frame','거푸집 설치','낙하·비래','거푸집 부재가 떨어져 맞음','부재 고정 상태를 확인하고 하부 출입을 통제한다. 인양 시 작업계획을 준수한다.'],
 ['frame','동바리 설치·점검','붕괴','지지 구조 불량으로 거푸집·동바리 붕괴','구조 검토 및 조립도에 따른 설치 상태를 확인한다. 임의 해체를 금지하고 이상 시 작업을 중지한다.'],
 ['frame','콘크리트 타설','붕괴','편중 타설 또는 지지 구조 이상으로 붕괴','타설 순서와 속도를 계획에 맞춰 관리하고 변형 등 이상 징후를 확인한다.'],
 ['frame','철골 조립','추락','철골 부재 위 이동 중 추락','안전한 작업발판·이동로와 추락방지 설비를 확보하고 안전대 체결 상태를 확인한다.'],
 ['scaffold','비계 조립·해체','추락','조립·해체 중 작업발판에서 추락','작업계획에 따른 순서를 준수하고 추락방지 설비·안전대 사용 상태 및 하부 출입 통제를 확인한다.'],
 ['scaffold','비계 사용','붕괴','벽이음·가새 불량으로 비계 붕괴','벽이음, 가새, 받침, 작업발판 및 적재 상태를 점검하고 이상 시 사용을 중지한다.'],
 ['scaffold','고소작업대 작업','끼임·충돌','상승 중 상부 구조물에 끼임','상부 간섭물과 작업 범위를 확인하고 비상정지·안전장치 작동 및 접근 통제를 점검한다.'],
 ['scaffold','사다리 사용','추락','불안정한 사다리에서 추락','작업에 적합한 안전한 작업발판을 우선 사용하고 사다리 사용이 허용되는 조건과 고정 상태를 확인한다.'],
 ['lifting','크레인 인양','낙하·비래','줄걸이 불량으로 인양물이 낙하','정격하중과 줄걸이 용구 상태를 확인하고 신호체계를 유지하며 인양물 하부 출입을 금지한다.'],
 ['lifting','지게차 운반','끼임·충돌','지게차와 보행자 충돌','보행 동선과 장비 동선을 분리하고 운전 자격·시야·유도 조치를 확인한다.'],
 ['lifting','호이스트 사용','낙하·비래','운반 자재가 승강 중 떨어짐','적재·고정 상태와 출입문·안전장치를 확인하고 허용하중을 준수한다.'],
 ['lifting','굴삭기 작업','끼임·충돌','선회 반경 내 작업자와 장비 충돌','선회 반경 내 출입을 통제하고 유도자와 운전자 간 신호체계를 확보한다.'],
 ['finish','타일 절단','질식·유해물질','절단 작업에서 발생하는 분진 노출','적합한 집진·습식 작업 등 분진 저감 조치를 적용하고 적절한 호흡보호구를 사용한다.'],
 ['finish','도장 작업','화재·폭발','가연성 도료 증기에 점화','물질안전보건자료에 따른 환기·점화원 통제 및 보관 조치를 확인한다.'],
 ['finish','창호·유리 설치','낙하·비래','유리 또는 창호 부재가 떨어져 맞음','적합한 운반·고정 도구를 사용하고 설치 전후 고정 상태 및 하부 출입 통제를 확인한다.'],
 ['finish','천장 마감','추락','작업발판에서 추락','적합한 작업발판과 방호시설을 사용하고 작업 중 무리한 자세를 피한다.'],
 ['mep','임시전기 사용','감전','손상된 전선·전기기구에서 감전','누전차단기·접지·전선 피복 상태를 확인하고 손상된 기구 사용을 금지한다.'],
 ['mep','전기설비 정비','감전','충전부 접촉으로 감전','전원 차단·잠금 및 표지, 무전압 확인 등 적합한 전기 작업 절차를 준수한다.'],
 ['mep','용접·용단','화재·폭발','불티가 가연물에 점화','가연물 제거·방호, 소화설비 및 필요한 화재감시자 배치를 확인하고 화기 작업 절차를 준수한다.'],
 ['mep','밀폐공간 작업','질식·유해물질','산소 부족 또는 유해가스로 질식','밀폐공간 작업 프로그램에 따라 산소·유해가스 측정, 환기, 감시 및 구조체계를 확보한다.'],
 ['demo','구조물 해체','붕괴','계획과 다른 해체로 구조물 붕괴','사전 조사와 해체계획에 따른 순서·지지 상태를 확인하고 위험구역 출입을 통제한다.'],
 ['demo','철거물 반출','낙하·비래','철거물이 떨어져 하부 작업자에게 맞음','안전한 반출 방법과 낙하 방지 시설을 확보하고 하부 출입을 통제한다.'],
 ['demo','철거 작업','질식·유해물질','철거 과정에서 분진·유해물질 노출','사전 유해물질 조사 결과에 따라 적합한 작업 방법, 격리·집진 및 보호구를 적용한다.']
 ].map(([category,work,hazard_type,hazard,measure],i)=>({id:'example-'+(i+1),category,work,name:work,area:groups.find(g=>g.id===category).name,hazard_type,hazard,measure,example:true}));
 function filter(rows,{category='',type='',work='',query='',source='all',favorites=[]}={}){const words=text(query).split(/\s+/).filter(Boolean);return rows.filter(r=> (!category||classify(r)===category)&&(!type||hazardType(r)===type)&&(!work||text(r.work)===text(work))&&(source==='all'||source==='saved'&&!r.example||source==='examples'&&r.example||source==='favorites'&&favorites.includes(String(r.id)))&&words.every(w=>text([r.name,r.area,r.work,r.hazard,r.measure,groups.find(g=>g.id===classify(r))?.name,hazardType(r)].join(' ')).includes(w)));}
 return {groups,types,classify,hazardType,examples,filter,validCategory,categoryName,areaLabel};
});
