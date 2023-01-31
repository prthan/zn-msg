const logger = require('../msg/logger');
const io = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

const client=
{
  handlers: {},
  calls: {},
  localCalls:
  {

  }
};

client.connect=(options)=>
{
  client.options=options;
  let ep=new URL(options.endpoint);
  client.socket = io(ep.protocol+"//"+ep.host, {path: ep.pathname, autoConnect: true});
  client.socket.on('connect', ()=>
  {
    logger.info("connected to msg service at", options.endpoint);
    logger.info("announcing to server ...");
    client.socket.emit("/zn/announce",
    {
      identity: options.identity,
      clientType: "node-msg-client",
      calls: Object.keys(client.localCalls)
    })
  });

  client.socket.on("/zn/message", (msg)=>
  {
    let handlers=client.handlers['message'];
    if(handlers) handlers.forEach((h)=>h(msg));
  })

  client.socket.on("/zn/announce/ack", (msg)=>
  {
    logger.info("accounce ack received, client-id=", msg.clientId);
    let handlers=client.handlers['announce-ack'];
    if(handlers) handlers.forEach((h)=>h(msg));
  })

  client.socket.on("/zn/event", (msg)=>
  {
    let handlers=client.handlers['event.'+msg.event];
    if(handlers) handlers.forEach((h)=>h(msg));
  })

  client.socket.on("/zn/call/result", (msg)=>
  {
    let p=client.calls[msg.id];
    if(p)
    {
      if(!msg.result.error) p.res$(msg.result);
      else p.rej$(msg.result.error);
    }
  })

  client.socket.on("/zn/error", (msg)=>
  {
    let handlers=client.handlers['error'];
    if(handlers) handlers.forEach((h)=>h(msg));
  })

  client.socket.on("disconnect", (msg)=>
  {
    logger.info("disconnected from msg server");
  })

  client.socket.on("/zn/call", async(msg)=>
  {
    let impl=client.localCalls[msg.fn];
    if(!impl)
    {
      logger.error(`${msg.fn} not supported by client`);
      return;
    };

    logger.debug(`[${msg.id}] executing ${msg.fn}, calledBy=${msg.calledBy}`, msg);
    let result=null;
    try
    {
      result=await impl(msg);
    }
    catch(err)
    {
      result={error: err}
    }
    logger.debug(`[${msg.id}] result=${JSON.stringify(result)}`);
    client.socket.emit("/zn/call/result", {id: msg.id, result: result});
  })


}

client.on=(type, fn)=>
{
  client.handlers[type]=client.handlers[type]||[];
  client.handlers[type].push(fn);
}

client.sendMessage=(msg)=>
{
  client.socket.emit("/zn/message", msg);
}

client.publishEvent=(evt)=>
{
  client.socket.emit("/zn/event", evt);
}

client.call=(callName, payload)=>
{
  let impl=(res$, rej$)=>
  {
    let id=uuidv4();
    let msg=
    {
      payload: payload,
      id: id,
      fn: callName,
    }
    client.calls[id]={res$, rej$};
    client.socket.emit("/zn/call", msg);
  }
  return new Promise(impl);
}

client.addCall=(callName, impl)=>
{
  client.localCalls[callName]=impl;
}

module.exports=client;