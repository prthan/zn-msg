let fs=require('fs');

let config=()=>
{
  return global["@@config"]
};

config.loadFromFile=(file, $)=>
{
  let impl=async(res$, rej$)=>
  {
    fs.readFile(file, null ,(err, data)=>
    {
      if(!err)
      {
        let updatedContant=config.updateVariables(data.toString());
        global["@@config"]=JSON.parse(updatedContant);
        res$();
      }
      else rej$(err);
    })  
  }

  return new Promise(impl);
}

config.updateVariables=(content)=>
{
  let varExp=/\$\{([^}]+)\}/gm;
  let lastIndex=0;
  let match;
  let updatedContent="";
  while(match=varExp.exec(content))
  {
    if(match.index>lastIndex)
    {
      updatedContent += content.substring(lastIndex, match.index);
      let varParts=match[1].split(".");
      let varCtx=varParts[0];
      let varName=varParts[1];
      if(varCtx=="ENV" || varCtx=="env")
      {
        let envValue=process.env[varName];
        if(envValue==null)
        {
          console.log(`ENV ${varName} not set`);
          envValue="";
        }
        let varValue=JSON.stringify(envValue);
        updatedContent += varValue.substr(1,varValue.length-2);
      }
      lastIndex = match.index + match[0].length;
    }
  }
  updatedContent += content.substring(lastIndex, content.length);

  return updatedContent;
}


module.exports=config;