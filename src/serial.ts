export async function mapSequential<T,R>(items:readonly T[],operation:(item:T,index:number)=>Promise<R>):Promise<PromiseSettledResult<R>[]>{
  const results:PromiseSettledResult<R>[]=[];
  for(let index=0;index<items.length;index++){
    try{results.push({status:"fulfilled",value:await operation(items[index],index)});}
    catch(reason){results.push({status:"rejected",reason});}
  }
  return results;
}
