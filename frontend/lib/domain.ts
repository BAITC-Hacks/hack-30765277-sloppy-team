export type Card = {title:string;company:string;category:string;context:string;data:string;expected_result:string;constraints:string;criteria:string;target_audience:string;contacts:string;interaction_format:string;links:string};
export type TaskStatus='DRAFT'|'WORKING'|'READY'|'PRIORITY';
export type Task = {id:string;card_data:Card;score:number;status:TaskStatus;created_at:string;applications_open?:boolean;owner_id?:string};
export type Application = {id:string;task_id:string;team_name:string;idea:string;plan:string;prototype:string;status:'PENDING'|'ACCEPTED'|'REJECTED'};
export type BackendCard={title:string;context:string|null;data_materials:string|null;expected_result:string|null;success_criteria:string|null;constraints:string|null;target_audience:string|null;contacts:string|null;interaction_format:string|null};
export const emptyCard:Card={title:'',company:'',category:'Разработка',context:'',data:'',expected_result:'',constraints:'',criteria:'',target_audience:'',contacts:'',interaction_format:'',links:''};
export function fromBackendCard(card:BackendCard):Card{return {...emptyCard,title:card.title,context:card.context??'',data:card.data_materials??'',expected_result:card.expected_result??'',criteria:card.success_criteria??'',constraints:card.constraints??'',target_audience:card.target_audience??'',contacts:card.contacts??'',interaction_format:card.interaction_format??''};}
function fieldScore(value:string|undefined,maximum:number){const length=(value??'').trim().length;return length<10?0:length<30?Math.floor(maximum/2):maximum;}
export function scoreCard(card:Card){return fieldScore(card.context,20)+fieldScore(card.data,20)+fieldScore(card.expected_result,15)+fieldScore(card.criteria,15)+fieldScore(card.constraints,10)+fieldScore(card.target_audience,10)+fieldScore(card.contacts,5)+fieldScore(card.interaction_format,5);}
export function safeUrl(value:string){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export function taskStatus(score:number):TaskStatus{return score>=90?'PRIORITY':score>=70?'READY':score>=40?'WORKING':'DRAFT';}
export function seedTasks():Task[]{return [
 ['1','Дашборд продаж для локальной кофейни','Кофе и люди','Аналитика','Помогите небольшой сети кофеен разобраться в продажах и находить точки роста на основе данных.'],
 ['2','Сервис подбора волонтёров для НКО','Добро рядом','Разработка','Создайте удобный сервис, который объединит волонтёров и благотворительные проекты города.'],
 ['3','Новый взгляд на доставку фермерских продуктов','Зелёная ферма','Дизайн','Исследуйте путь покупателя и спроектируйте понятный интерфейс заказа свежих продуктов.'],
 ['4','Telegram-бот для записи на занятия','Студия Ритм','Разработка','Автоматизируйте запись на групповые занятия, чтобы администратор мог уделять больше времени гостям.'],
 ['5','Стратегия продвижения локального бренда','Тихий дом','Маркетинг','Помогите молодому бренду керамики найти свою аудиторию и выстроить коммуникацию в соцсетях.'],
 ['6','Исследование аудитории книжного клуба','Между строк','Исследования','Узнайте, что привлекает читателей в офлайн-клубы, и предложите новые форматы встреч.']
 ].map(([id,title,company,category,context],i)=>{const card_data={...emptyCard,title,company,category,context,data:i<4?'Обезличенные данные за последние 6 месяцев. Материалы предоставим выбранной команде.':'',constraints:'Срок: 4 недели. Использовать доступные открытые инструменты.',criteria:i!==5?'Рабочий прототип, проверенный на 5 пользователях, и краткая презентация результатов.':'',contacts:i<3?'hello@example.com':'',links:i===0?'https://example.com':''}; const score=scoreCard(card_data);return {id,card_data,score,status:taskStatus(score),created_at:'2026-09-20T10:00:00Z',applications_open:true};});}
