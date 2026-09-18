const materials=[['🎃','BÍ NGÔ'],['🐭','CHÚ CHUỘT'],['✨','PHÉP THUẬT'],['🐴','NGỰA'],['🛞','BÁNH XE'],['🪄','ĐŨA THẦN'],['💎','PHA LÊ'],['👑','PHÉP MÀU HOÀN THIỆN']];
export function buildRewardPlan(total){return Array.from({length:total},(_,i)=>{const [icon,label]=i===total-1?['🏰','CUNG ĐIỆN']:materials[i%materials.length];return {icon,label,question:i+1}})}
export function visibleCheckpoints(total){const count=Math.min(total,7);return Array.from({length:count},(_,i)=>Math.ceil((i+1)*total/count))}
