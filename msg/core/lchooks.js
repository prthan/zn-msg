const config=require("../config")();
const logger=require("../logger");

let handler={};

handler.onStart=async(app)=>
{
  let impl=(res$, rej$)=>
  {
    res$();
  }
  
  return new Promise(impl);
}

module.exports=handler;