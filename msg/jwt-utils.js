const crypto=require("crypto");

const logger=require("./logger");
const common=require("./common");

let utils={};

utils.createJWT=(sub, iss, aud, kid, privateKeySpec)=>
{
  let now=Math.floor(Date.now() / 1000);
  let exp=3600;

  let header={"alg": "RS256", "typ": "JWT", "kid": kid};
  let payload={sub, iss, aud: [aud], iat: now, exp: now+exp};

  let encodedHeader=Buffer.from(JSON.stringify(header)).toString("base64url");
  let encodedPayload=Buffer.from(JSON.stringify(payload)).toString("base64url");

  let data=encodedHeader+"."+encodedPayload;
  let privateKey=crypto.createPrivateKey(privateKeySpec);
  let signature=crypto.sign("RSA-SHA256", Buffer.from(data), privateKey);

  return data + "." + signature.toString("base64url");
}

utils.getToken=(auth)=>
{
  logger.debug("getting token ...");
  let impl=async(res$, rej$)=>
  {
    let request={};
    if(!auth.clientAssertionType)
    {
      request=
      {
        method: "POST",
        headers:
        {
          "authorization": `Basic ${Buffer.from(`${auth.clientId}:${auth.clientSecret}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded"
        },
        url: `${auth.tokenUrl}`,
        data: `grant_type=${auth.grantType}&scope=${auth.scope}`
      }
    }
    else
    {
      let assertion=utils.createJWT(auth.clientId, auth.clientId, auth.aud, auth.kid, auth.privateKey);
      request=
      {
        method: "POST",
        headers:{"content-type": "application/x-www-form-urlencoded"},
        url: `${auth.tokenUrl}`,
        data: `grant_type=${auth.grantType}&scope=${auth.scope}&client_id=${auth.clientId}&client_assertion_type=${auth.clientAssertionType}&client_assertion=${assertion}`
      }
    }
    console.log(request);
    let outcome=await common.httpRequest(request);
    if(outcome.error)
    {
      logger.error("error occured while getting the token", outcome.error);
      return rej$(outcome.error);
    }
    res$(outcome.data.access_token);
  }

  return new Promise(impl);
}

utils.decodeToken=(token)=>
{
  let [header, payload, signature]=token.split(".");
  return {
    header: JSON.parse(Buffer.from(header, "base64").toString()), 
    payload: JSON.parse(Buffer.from(payload, "base64").toString())
  }
}

utils.verifyToken=(token, keySpec)=>
{
  let [header, payload, signature]=token.split(".");
  if(!header || !payload || !signature) return "INVALID-TOKEN-SEGMENTS";

  // console.log(JSON.parse(Buffer.from(header, "base64").toString()));
  // console.log(JSON.parse(Buffer.from(payload, "base64").toString()));
  
  let payloadDecoded=JSON.parse(Buffer.from(payload, "base64").toString());
  
  
  let exp=payloadDecoded.exp;
  let now=Math.floor(Date.now() / 1000);
  if(now>exp) return "TOKEN-EXPIRED";
  
  let cert=new crypto.X509Certificate(Buffer.from(keySpec, "base64"));
  let isVerified=crypto.verify("RSA-SHA256", Buffer.from(header+"."+payload), cert.publicKey, Buffer.from(signature, "base64"))
  if(isVerified) return "TOKEN-VALID";
  
  return "TOKEN-INVALID";
}

utils.verifyToken1=(token, jwks)=>
{
  let [header, payload, signature]=token.split(".");
  if(!header || !payload || !signature) return "INVALID-TOKEN-SEGMENTS";

  let decodedHeader=JSON.parse(Buffer.from(header, "base64").toString())
  console.log("[kid]", decodedHeader.kid);

  let keySpec=jwks.keys.find(x=>x.kid==decodedHeader.kid)?.x5c[0];
  console.log("[key]", keySpec)
  
  let payloadDecoded=JSON.parse(Buffer.from(payload, "base64").toString());
   
  console.log("[header]", decodedHeader);
  console.log("[payload]", payloadDecoded);
  
  let exp=payloadDecoded.exp;
  let now=Math.floor(Date.now() / 1000);
  if(now>exp) return "TOKEN-EXPIRED";
  
  let cert=new crypto.X509Certificate(Buffer.from(keySpec, "base64"));
  let isVerified=crypto.verify("RSA-SHA256", Buffer.from(header+"."+payload), cert.publicKey, Buffer.from(signature, "base64"))
  if(isVerified) return "TOKEN-VALID";
  
  return "TOKEN-INVALID";
}
module.exports=utils;
