const crypto = require('crypto');
const axios = require('axios');

var common = {}

common.shortid=()=>
{
  let rval=[];
  let a=Array.from(Math.random().toString(36).substr(2));
  let b=Array.from(new Date().getTime().toString(36));
  a.forEach((x,i)=>
  {
    rval.push(x);
    if(i<b.length)
    {
      rval.push(b.shift());
    }
  });
  if(b.length!=0) rval=rval.concat(b);
  return rval.join("");
}

common.httpRequest=async function(options)
{
  let impl=(res$, rej$)=>
  {
    axios(options)
    .then((res)=>res$({data: res.data, response: res}))
    .catch((err)=>
    {
      if(err.response)
      {
        let res=err.response;
        res$({error: res.data, response: res});
      }
      else
      {
        let error=err.toString();
        res$({error: error});
      }
    })  
  }

  return new Promise(impl);
}

module.exports=common;
