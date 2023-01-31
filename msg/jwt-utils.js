const crypto=require("crypto");

let utils={};

utils.createToken=(header, payload, privateKeySpec)=>
{
  let now=Math.floor(Date.now() / 1000);
  let exp=3600;

  payload["iat"]=now;
  payload["exp"]=now+3600;

  let encodedHeader=Buffer.from(JSON.stringify(header)).toString("base64url");
  let encodedPayload=Buffer.from(JSON.stringify(payload)).toString("base64url");

  let data=encodedHeader+"."+encodedPayload;
  let privateKey=crypto.createPrivateKey(privateKeySpec);
  let signature=crypto.sign("RSA-SHA256", Buffer.from(data), privateKey);

  return data + "." + signature.toString("base64url");
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
