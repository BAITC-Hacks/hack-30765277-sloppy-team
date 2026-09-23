export type Card = {title:string;company:string;category:string;context:string;data:string;constraints:string;criteria:string;contacts:string;links:string};
export type Task = {id:string;card_data:Card;score:number;status:'PRIORITY'|'READY'|'WORKING';created_at:string};
export type Application = {id:string;task_id:string;team_name:string;idea:string;plan:string;prototype:string;status:'PENDING'|'ACCEPTED'|'REJECTED'};
export const emptyCard:Card={title:'',company:'',category:'Разработка',context:'',data:'',constraints:'',criteria:'',contacts:'',links:''};
export function scoreCard(card:Card){return (Object.entries({title:10,company:5,context:20,data:15,constraints:10,criteria:20,contacts:15,links:5}) as [keyof Card,number][]).reduce((n,[k,w])=>n+(card[k]?.trim()?w:0),0);}
export function safeUrl(value:string){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export function taskStatus(score:number):Task['status']{return score>=85?'PRIORITY':score>=70?'READY':'WORKING';}
export const questions=['Какой результат вы хотите получить и как измерите успех?','Какие данные и материалы доступны команде?','Какие есть сроки, ограничения и контакт для связи?'];
export function seedTasks():Task[]{return [
 ['1','Дашборд продаж для локальной кофейни','Кофе и люди','Аналитика','Помогите небольшой сети кофеен разобраться в продажах и находить точки роста на основе данных.'],
 ['2','Сервис подбора волонтёров для НКО','Добро рядом','Разработка','Создайте удобный сервис, который объединит волонтёров и благотворительные проекты города.'],
 ['3','Новый взгляд на доставку фермерских продуктов','Зелёная ферма','Дизайн','Исследуйте путь покупателя и спроектируйте понятный интерфейс заказа свежих продуктов.'],
 ['4','Telegram-бот для записи на занятия','Студия Ритм','Разработка','Автоматизируйте запись на групповые занятия, чтобы администратор мог уделять больше времени гостям.'],
 ['5','Стратегия продвижения локального бренда','Тихий дом','Маркетинг','Помогите молодому бренду керамики найти свою аудиторию и выстроить коммуникацию в соцсетях.'],
 ['6','Исследование аудитории книжного клуба','Между строк','Исследования','Узнайте, что привлекает читателей в офлайн-клубы, и предложите новые форматы встреч.']
 ].map(([id,title,company,category,context],i)=>{const card_data={title,company,category,context,data:i<4?'Обезличенные данные за последние 6 месяцев. Материалы предоставим выбранной команде.':'',constraints:'Срок: 4 недели. Использовать доступные открытые инструменты.',criteria:i!==5?'Рабочий прототип, проверенный на 5 пользователях, и краткая презентация результатов.':'',contacts:i<3?'hello@example.com':'',links:i===0?'https://example.com':''}; const score=scoreCard(card_data);return {id,card_data,score,status:taskStatus(score),created_at:'2026-09-20T10:00:00Z'};});}
