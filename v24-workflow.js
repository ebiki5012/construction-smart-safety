"use strict";
function date(value){if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
function validate(kind,b){const need=(key,label,max=5000)=>typeof b[key]!=="string"||!b[key].trim()?label+" 입력하세요.":b[key].length>max?label+" 최대 "+max+"자입니다.":null;
 if(kind==='risk'){if(!date(b.date)||!date(b.period_start)||!date(b.period_end)||b.period_start>b.period_end)return '작성일과 평가 적용기간을 확인하세요.';return need('work','작업명을',500)||need('hazard','위험요인을')||need('measure','감소대책을');}
 if(kind==='tbm'){if(!date(b.tbm_date))return 'TBM 실시일을 확인하세요.';if(!/^[0-9]+$/.test(String(b.people??''))||!Number.isSafeInteger(Number(b.people))||Number(b.people)<1||Number(b.people)>100000)return '참여 인원은 1명 이상 정수로 입력하세요.';return need('work_name','작업명을',500)||need('hazard','위험요인을')||need('measure','감소대책을');}
 return '지원하지 않는 기록입니다.';
}
module.exports={date,validate};
