let authorizer=
{
}

authorizer.isAuthorizedAction=(identity, action, msg, app)=>
{
  return true;
}

module.exports=authorizer;