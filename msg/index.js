const config=require("./config")();
const logger=require("./logger");
const http = require('http');
const https = require('https');
const io = require('socket.io')(http);
const fs=require('fs');
const { v4: uuidv4 } = require('uuid');
const authorizer=require("./authorizer");
const jwtutils=require("./jwt-utils");
const eventDispatcher = require("./core/event.dispatcher");
const callDispatcher = require("./core/call.dispatcher");

let FROM_MSG=`msg@${config.id}`;

let app={}

let options=
{
  name: config.name
}

if(config.tls.enabled === "true")
{
  options.key = fs.readFileSync(config.tls.key);
  options.cert = fs.readFileSync(config.tls.certificate);
}

app["@sockets"]={};
app["@clients"]={};
global["@resources"]={};
app.eventSubscriptions=[];
app.callHandlers=[];
app.remoteCalls={};
app.lchooks=[];

app.addModule=(module)=>
{
  if(module['event-subscriptions'])
  {
    Object.keys(module['event-subscriptions']).forEach((eventName)=>
    {
      app.addEventSubscription(eventName, module['event-subscriptions'][eventName]);
    })
  }  
  if(module['call-handlers'])
  {
    Object.keys(module['call-handlers']).forEach((callName)=>
    {
      app.addCallHandler(callName, module['call-handlers'][callName]);
    })
  }
  if(module.models)
  {
    let modelLCHooks=
    {
      onStart: (app)=>
      {
        let impl=(res$, rej$)=>
        {
          Object.keys(module.models).forEach(k=>app["@models"][k]=(typeof module.models[k] == 'function' ? module.models[k]({app: app}):module.models[k]));
          res$();
        }
        return new Promise(impl);
      }
    }
    app.addLCHooks(modelLCHooks, `${module.name} models`);
  }  
  if(module.lchooks) app.addLCHooks(module.lchooks);
}

app["@models"]={};
app.addModels=(models)=>
{
  Object.keys(models).forEach(k=>app["@models"][k]=models[k]);
}
app.model=(name)=>
{
  return app["@models"][name];
}

app.addEventSubscription=(event, subscription)=>
{
  logger.info("added event subscription => ", event);
  app.eventSubscriptions.push({event: event, subscription: subscription});
}

app.addCallHandler=(callName, handler)=>
{
  logger.info("added call handler => ", callName);
  app.callHandlers.push({name: callName, handler: handler, type: "local"});
}

app.lchooks={};
app.addLCHooks=(hooks)=>
{
  (hooks instanceof Array ? hooks : [hooks]).forEach((hook)=>
  {
    Object.keys(hook).forEach((evt)=>
    {
      app.lchooks[evt]=app.lchooks[evt] || [];
      app.lchooks[evt].push(hook[evt]);
    })
  });
}

app["@resources"]={};
app.addResource=(name, resobj)=>
{
  app["@resources"][name]=resobj;
}
app.resource=(name)=>
{
  return app["@resources"][name];
}

app.start=()=>
{
  if(app.server)
  {
    io.attach(server, {path: config.context});
    logger.info(`${config.name} connected to context ${config.context}`);
    return;
  }

  let HTTP=config.tls.enabled === "true" ? https : http;
  let server = HTTP.createServer(options);
  io.attach(server, 
  {
    path: config.context,
    cors: 
    {
      origin: config.origins.split(","),
      methods: ["GET", "POST"],
      credentials: true
    }    
  });
  server.listen(config.listener.port, config.listener.address, async()=>
  {
    logger.info(`${config.name} listening on port ${config.listener.port}, context ${config.context}`);
    for(let handler of app.lchooks["onStart"] || []) await handler(app);
  })
}

app.stop=async()=>
{
  let impl=async(res$, rej$)=>
  {
    for(let handler of app.lchooks["onShutdown"] || []) await handler(app);
    res$();
  }

  return new Promise(impl);
}

io.on("connection", (socket)=>
{
  let socid=socket.id;
  let clientType=socket.handshake.headers["zn-msg-client-type"];
  socket.clientType=clientType;

  app["@sockets"][socid]=socket;

  logger.info(`new msg client connected - id=${socid}`);
  socket.on("/zn/announce", (msg)=>app.onAnnounce(socket, msg));
  socket.on("/zn/message", (msg)=>app.onMessage(socket, msg));
  socket.on("/zn/event", (msg)=>app.onEvent(socket, msg));
  socket.on("/zn/call", (msg)=>app.onCall(socket, msg));
  socket.on("/zn/call/result", (msg)=>app.onCallResult(socket, msg));
  socket.on("disconnect",()=>app.onDisconnect(socket))
})


app.onDisconnect=(socket)=>
{
  let socid=socket.id;
  let identity=socket.identity;
  if(identity)
  {
    logger.info(`[${socid}] ${identity.userid}@${identity.appid} disconnected`);
    let mapid=`${identity.userid}@${identity.appid}`;
    let client=app["@clients"][mapid];
    client.socids=client.socids.filter(x=>x!=socid);
    client.index=-1;
    app["@clients"][mapid]=client;
    if(client.socids.length==0) delete app["@clients"][mapid];
  }
  else logger.info(socid+" disconnected");
  delete app["@sockets"][socid];
}

app.onMessage=async(socket, msg)=>
{
  let clientType=socket.clientType;
  if(clientType=='java-msg-client') msg=JSON.parse(msg);

  if(!msg.to) return;

  let identity=socket.identity;
  if(!identity)
  {
    socket.emit("/zn/error", {type: "NOT-YET-ANNOUNCED", from: FROM_MSG, content: "You are not allowed to send messages"});
    return;
  }

  let from=`${identity.userid}@${identity.appid}`;
  let isAuthorized = await authorizer.isAuthorizedAction(identity, "send-message", msg, app);
  if(!isAuthorized)
  {
    socket.emit("/zn/error", {type: "UNAUTHORIZED", from: FROM_MSG, content: "You are not authorized to perform this action"});
    return;
  }
  let a=msg.to instanceof Array ? msg.to : [msg.to];
  a.forEach((recepient)=>app.routeMsgToRecepient("/zn/message", from, recepient, msg));
}

app.routeMsgToRecepient=(type, from, recipient, msg)=>
{
  let mapid=recipient;
  if(mapid.indexOf('@')==-1) mapid+="@"+config.appid;
  
  let client=app["@clients"][mapid];
  if(!client)
  {
    logger.info("recipient "+recipient+" not connected to msg server");
    return;
  }
  msg.from=from;
  let clientGroups=config["msg-client-groups"] || [];
  if(!clientGroups.includes(mapid)) client.socids.forEach((socid)=>app["@sockets"][socid].emit(type, msg));
  else
  {
    client.index=(client.index + 1) % client.socids.length;
    let socid=client.socids[client.index];
    app["@sockets"][socid].emit(type, msg);
  }
}

let reqidTagFn=(reqid)=>
{
  let reqidtag=`[${reqid}]`;
  if(config.logger.colors) reqidtag=`\x1b[35m${reqidtag}\x1b[0m`;
  return reqidtag;
}

let ContextLogger=function(options)
{
  this.options=options;
}

ContextLogger.prototype.dispatch=function(fn, a)
{
  let args=[reqidTagFn(this.options.id)].concat(a);
  fn.apply(logger, args);
}

ContextLogger.prototype.error=function()
{
  this.dispatch(logger.error, Object.values(arguments));
}

ContextLogger.prototype.info=function()
{
  this.dispatch(logger.info, Object.values(arguments));
}

ContextLogger.prototype.warn=function()
{
  this.dispatch(logger.warn, Object.values(arguments));
}

ContextLogger.prototype.debug=function()
{
  this.dispatch(logger.debug, Object.values(arguments));
}

ContextLogger.prototype.trace=function()
{
  this.dispatch(logger.trace, Object.values(arguments));
}

app.onEvent=async(socket, msg)=>
{
  let clientType=socket.clientType;
  if(clientType=='java-msg-client') msg=JSON.parse(msg);

  var identity=socket.identity;
  if(!identity)
  {
    socket.emit("/zn/error", {type: "NOT-YET-ANNOUNCED", from: FROM_MSG, content: "You are not allowed to send messages"});
    return;
  }
  let from=identity.userid+"@"+identity.appid;
  let isAuthorized = await authorizer.isAuthorizedAction(identity, "run-subscritions", msg, app);
  if(!isAuthorized)
  {
    socket.emit("/zn/error", {type: "UNAUTHORIZED", from: FROM_MSG, content: "You are not authorized to perform this action"});
    return;
  }

  msg.from=from;
  let evtid=uuidv4();
  let ctxlogger=new ContextLogger({id: evtid});
  let ctx={app: app, identity: identity, logger: ctxlogger}
  eventDispatcher.dispatch(msg, ctx).then().catch((err)=>
  {
    if(err) logger.error(err);
  });
}

app.onCall=async(socket, msg)=>
{
  let clientType=socket.clientType;
  if(clientType=='java-msg-client') msg=JSON.parse(msg);
  
  let identity=socket.identity;
  if(!identity)
  {
    socket.emit("/zn/error", {type: "NOT-YET-ANNOUNCED", from: FROM_MSG, content: "You are not allowed to send messages"});
    return;
  }
  let from=identity.userid+"@"+identity.appid;
  let isAuthorized = await authorizer.isAuthorizedAction(identity, "exec-calls", msg, app);
  if(!isAuthorized)
  {
    socket.emit("/zn/error", {type: "UNAUTHORIZED", from: FROM_MSG, content: "You are not authorized to perform this action"});
    return;
  }
  
  msg.from=from;
  let ctxlogger=new ContextLogger({id: msg.id});
  let ctx={app: app, identity: identity, logger: ctxlogger, sessionData: socket.sessionData, callId: msg.id}
  callDispatcher.dispatch(msg, ctx).then().catch((err)=>
  {
    logger.error(err);
    app.returnCall(msg, {error: {type: "UNHANDLED-ERROR", e: err}})
  });
}

app.onCallResult=async(socket, msg)=>
{
  let clientType=socket.clientType;
  if(clientType=='java-msg-client') msg=JSON.parse(msg);

  let identity=socket.identity;
  if(!identity)
  {
    socket.emit("/zn/error", {type: "NOT-YET-ANNOUNCED", from: FROM_MSG, content: "You are not allowed to send messages"});
    return;
  }
  let from=identity.userid+"@"+identity.appid;
  let remoteCall=app.remoteCalls[msg.id];
  if(!remoteCall)
  {
    socket.emit("/zn/error", {type: "INVALID-CALL-RESULT", from: FROM_MSG, content: "This is an invalid call result"});
    return;
  }
  if(remoteCall.remoteClient!=from)
  {
    socket.emit("/zn/error", {type: "INVALID-CALL-RESULT", from: FROM_MSG, content: "You are not allowed to respond to this call"});
    return;
  }
  let ctxlogger=new ContextLogger({id: msg.id});
  ctxlogger.info(`call result received from remote handler client=${remoteCall.remoteClient} fn=${remoteCall.fn}, sending the result to ${remoteCall.calledBy}`)
  app.routeMsgToRecepient("/zn/call/result", FROM_MSG, remoteCall.calledBy, msg);
  ctxlogger.info(`>>-->> ${remoteCall.fn}`);
}

app.sendMessage=(msg)=>
{
  if(msg.to)
  {
    let a=msg.to instanceof Array ? msg.to : [msg.to];
    a.forEach((recepient)=>app.routeMsgToRecepient("/zn/message", FROM_MSG, recepient, msg));
  }
}

app.returnCall=(callMsg, result)=>
{
  let msg=
  {
    to: callMsg.from,
    id: callMsg.id,
    result: result
  }
  app.routeMsgToRecepient("/zn/call/result", FROM_MSG, callMsg.from, msg)
}

app.resolveIdentity=(identity, socid)=>
{
  let result=jwtutils.verifyToken(identity.token, config["auth"].signingCert);
  if(result!="TOKEN-VALID") return {result};

  let decodedToken=jwtutils.decodeToken(identity.token);
  identity.decodeToken=decodedToken;
  identity.userid=decodedToken.payload["sub"];
  return {identity};
}

app.onAnnounce=async(socket, msg)=>
{
  let socid=socket.id;

  let clientType=socket.clientType;
  if(clientType=='java-msg-client') msg=JSON.parse(msg);

  socket.sessionData = {};
  let isAuthEnabled=!config.auth || !config.auth.enabled || config.auth.enabled === "true";
  
  let identity=msg.identity;
  if(isAuthEnabled)
  {
    let {identity: resolvedIdentity, result}=app.resolveIdentity(msg.identity);
    if(resolvedIdentity==null)
    {
      socket.emit("/zn/error", {type: "IDENTITY-RESOLUTION-ERROR", from: FROM_MSG, content: "Unable to resolve the identity", reason: result});
      return;
    }
    identity=resolvedIdentity;
  }

  logger.info(`[${socid}] client identity successfully resolved`);
  let mapid=`${identity.userid}@${identity.appid}`;
  app["@clients"][mapid]=app["@clients"][mapid] || {socids: []};
  app["@clients"][mapid].socids.push(socid);
  app["@clients"][mapid].index=-1;

  socket.identity=identity;
  socket.clientType=msg.clientType;

  socket.emit("/zn/announce/ack", {from: FROM_MSG, clientId: socid});
  logger.info(`[${socid}] ${mapid} connected`);
  
  let isAuthorized = await authorizer.isAuthorizedAction(identity, "export-calls", msg, app);
  if(msg.calls && isAuthorized)
  {
    msg.calls.forEach((x)=>
    {
      logger.info(`[${socid}] including remote call ${x} from client ${mapid}`);
      app.callHandlers.push({name: x, type: "remote", client: mapid})
    });
  }
}

app.setupProcess=()=>
{
  process.title=config.name;
  process.on('uncaughtException',(err)=>
  {
    logger.error(`an unexpected error occured in: ${config.name}`);
    logger.error(err.message);
    logger.error(err.stack);
  });
  
  process.on('SIGINT',async()=>
  {
    logger.info("shutdown initiated");
    await app.stop();
    process.exit();
  });
  
  process.on('SIGTERM',async()=>
  {
    logger.info("shutdown initiated");
    await app.stop();
    process.exit();
  });
}

app.setupProcess();
app.addModule(require("./core"));
app.addModule(require("./connectors"));

module.exports=app;