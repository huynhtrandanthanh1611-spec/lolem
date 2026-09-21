// One position per question, with enough room to keep adjacent stones distinct.
export function journeyLayout(totalQuestions,currentQuestionIndex,viewportWidth,characterSize){
  const total=Math.max(1,Math.trunc(totalQuestions));
  const currentStep=Math.max(0,Math.min(total-1,Math.trunc(currentQuestionIndex)));
  const padding=Math.max(26,characterSize*.56);
  const stripWidth=Math.max(viewportWidth,2*padding+(total-1)*24);
  const pitch=total>1?(stripWidth-2*padding)/(total-1):0;
  const positions=Array.from({length:total},(_,i)=>padding+i*pitch);
  return {currentStep,padding,stripWidth,positions,
    stoneWidth:Math.min(36,total>1?pitch*.55:36),
    scrollLeft:Math.max(0,Math.min(stripWidth-viewportWidth,positions[currentStep]-viewportWidth/2))};
}
