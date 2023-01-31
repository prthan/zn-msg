const config            = require('../config')();
const logger            = require('../logger');

let FROM_MSG=`msg@${config.id}`;

let dispatcher={}

dispatcher.findCallHandler=(callName, callHandlers, type)=>
{
  let callHandler=[];
  callHandlers.forEach((obj)=>
  {
    if(obj.event==event) list.push(obj.subscription);
  })
  
  return list;
}


dispatcher.dispatch=function(msg, ctx, $)
{
  let impl=async(res$, rej$)=>
  {
    ctx.logger.info(`<<--<< ${msg.fn}`);
  
    let localCallHandler=ctx.app.callHandlers.find(x=>x.type=='local' && x.name==msg.fn);
    if(localCallHandler)
    {
      ctx.logger.info(`executing local call handler for call=${msg.fn}`);
      let result=null;
      if(typeof localCallHandler == 'function') result=await localCallHandler(ctx, msg);
      else if(typeof localCallHandler == 'object' && localCallHandler["$"]) result=await localCallHandler["$"](ctx, msg);
      ctx.app.returnCall(msg, result);
      ctx.logger.info(`>>-->> ${msg.fn}`);
      return res$();
    }

    let remoteCallHandler=ctx.app.callHandlers.find(x=>x.type=='remote' && x.name==msg.fn);
    if(remoteCallHandler)
    {
      ctx.logger.info(`forwarding call to remote handler client=${remoteCallHandler.client} fn=${msg.fn}`);
      let calledBy=`${ctx.identity.userid}@${ctx.identity.appid}`
      ctx.app.remoteCalls[msg.id]=
      {
        remoteClient: remoteCallHandler.client,
        calledBy: calledBy,
        fn: msg.fn
      }
      msg.calledBy=calledBy;
      ctx.app.routeMsgToRecepient("/zn/call", FROM_MSG, remoteCallHandler.client, msg);
      return res$();
    }

    ctx.app.returnCall(msg, {
      error: "UNIMPLEMENTED-CALL",
      name: msg.fn
    });

    ctx.logger.info(`>>-->> ${msg.fn}`);
    
    res$();
  }

  return new Promise(impl);
}

module.exports=dispatcher;

