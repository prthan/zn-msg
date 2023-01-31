const config            = require('../config')();
const logger            = require('../logger');

function findEventSubscriptions(event, subscriptions)
{
  let list=[];
  subscriptions.forEach((obj)=>
  {
    if(obj.event==event) list.push(obj.subscription);
  })
  
  return list;
}

var eventDispatcher={}

eventDispatcher.dispatch=function(msg, ctx, $)
{
  let impl=async(res$, rej$)=>
  {
    ctx.logger.info(`<<--<< ${msg.event}`);
  
    var subscriptions = findEventSubscriptions(msg.event,ctx.app.eventSubscriptions);
    
    if (subscriptions.length==0) 
    {
      ctx.logger.error("no subscriptions found for event");
      ctx.logger.info("event dispatcher < " + msg.event);
      res$();
      return;
    }  
    
    for(let subscription of subscriptions)
    {
      await subscription["onEvent"](msg, ctx);
    }
    ctx.logger.info(`>>-->> ${msg.event}`);
    
    res$();
  }

  return new Promise(impl);
}

module.exports=eventDispatcher;

