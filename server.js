const config=require("./msg/config");
const APP_HOME=process.env.APP_HOME;
const APP_ENV=process.env.APP_ENV;
const APP_CONFIG=process.env.APP_CONFIG;
const CONFIG_FILE=`${APP_CONFIG}/msg${APP_ENV?"-"+APP_ENV:""}.json`;

let server={};

server.main=async(args)=>
{
  await config.loadFromFile(CONFIG_FILE);

  server.app=require("./msg");
  server.app.start();
}

server.main();