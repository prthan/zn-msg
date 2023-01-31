const config_ = require('./config');

const moment = require('moment');

let logger = {}

logger.levels=
{
  "TRACE" : 1,
  "DEBUG" : 2,
  "INFO"  : 3,
  "WARN"  : 4,
  "ERROR" : 5
}

logger.COLORED_ERROR_TEXT="\x1b[31m[Error]\x1b[0m";
logger.COLORED_WARN_TEXT ="\x1b[33m[ Warn]\x1b[0m";
logger.COLORED_INFO_TEXT ="\x1b[36m[ Info]\x1b[0m";
logger.COLORED_DEBUG_TEXT="\x1b[32m[Debug]\x1b[0m";
logger.COLORED_TRACE_TEXT="\x1b[32m[Trace]\x1b[0m";

logger.PLAIN_ERROR_TEXT="[Error]";
logger.PLAIN_WARN_TEXT ="[ Warn]";
logger.PLAIN_INFO_TEXT ="[ Info]";
logger.PLAIN_DEBUG_TEXT="[Debug]";
logger.PLAIN_TRACE_TEXT="[Trace]";

logger.level=()=>
{

}
logger.error = function()
{
  let config=config_();
  if(logger.levels[config.logger.level]>logger.levels["ERROR"]) return;
  let now = new Date();
  let ts = moment(now).format("MM/DD/YYYY hh:mm:ss.SSS");
  let args=[`[${ts}] ${config.logger.colors ? logger.COLORED_ERROR_TEXT : logger.PLAIN_ERROR_TEXT}`].concat(Object.values(arguments));
  console.error.apply(console, args);
};
  
logger.warn = function()
{
  let config=config_();
  if(logger.levels[config.logger.level]>logger.levels["WARN"]) return;
  let now = new Date();
  let ts = moment(now).format("MM/DD/YYYY hh:mm:ss.SSS");
  let args=[`[${ts}] ${config.logger.colors ? logger.COLORED_WARN_TEXT : logger.PLAIN_WARN_TEXT}`].concat(Object.values(arguments));
  console.warn.apply(console, args);
};
  
logger.info = function()
{
  let config=config_();
  if(logger.levels[config.logger.level]>logger.levels["INFO"]) return;
  let now = new Date();
  let ts = moment(now).format("MM/DD/YYYY hh:mm:ss.SSS");
  let args=[`[${ts}] ${config.logger.colors ? logger.COLORED_INFO_TEXT : logger.PLAIN_INFO_TEXT}`].concat(Object.values(arguments));
  console.info.apply(console, args);
};
  
logger.debug = function()
{
  let config=config_();
  if(logger.levels[config.logger.level]>logger.levels["DEBUG"]) return;
  let now = new Date();
  let ts = moment(now).format("MM/DD/YYYY hh:mm:ss.SSS");
  let args=[`[${ts}] ${config.logger.colors ? logger.COLORED_DEBUG_TEXT : logger.PLAIN_DEBUG_TEXT}`].concat(Object.values(arguments));
  console.debug.apply(console, args);
};

logger.trace = function()
{
  let config=config_();
  if(logger.levels[config.logger.level]>logger.levels["TRACE"]) return;
  let now = new Date();
  let ts = moment(now).format("MM/DD/YYYY hh:mm:ss.SSS");
  let args=[`[${ts}] ${config.logger.colors ? logger.COLORED_TRACE_TEXT : logger.PLAIN_TRACE_TEXT}`].concat(Object.values(arguments));
  console.debug.apply(console, args);
};

logger.canLog = function(level)
{
  let config=config_();
  return logger.levels[config.logger.level]<logger.levels[level];
}

module.exports=logger;
