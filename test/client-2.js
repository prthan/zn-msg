const config=require("../msg/config");
const common=require("../msg/common");
const msgClient=require("../msg-client");
const logger = require("../msg/logger");

let getToken=async()=>
{
  logger.info("getting token ...");
  let outcome=await common.httpRequest({
    method: "POST",
    headers:
    {
      "authorization": `Basic ${Buffer.from(`afd504ce4e6d4c8d902941c54f6daed3:a21d4a3f-3e0f-46fe-850f-53ff22c7818d`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    url: `https://idcs-1dfddb2792644e5dadf360c3bc381512.identity.oraclecloud.com/oauth2/v1/token`,
    data: "grant_type=client_credentials&scope=urn:opc:idm:__myscopes__"
  });
  if(outcome.error) throw new Error(outcome.error);
  return outcome.data.access_token;
}

let product=(msg)=>
{
  let impl=(res$, rej$)=>
  {
    res$({value: msg.payload.a * msg.payload.b});
  }
  return new Promise(impl);
}

let division=(msg)=>
{
  let impl=(res$, rej$)=>
  {
    res$({value: msg.payload.a / msg.payload.b});
  }
  return new Promise(impl);
}

let main=async()=>
{
  await config.loadFromFile("../config/msg.json");
  
  let token=await getToken();
  logger.info("token=", token);

  msgClient.addCall("client-2::product", product)
  msgClient.addCall("client-2::division", division)
  msgClient.connect({
    endpoint: "http://localhost:7117/zn/msg",
    identity:
    {
      token: token,
      appid: "client-2"
    },
  })
}

main()