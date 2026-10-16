#!/usr/bin/env node
import { createInterface } from 'node:readline';
let initialized = false;
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
for await (const line of createInterface({input:process.stdin})) {
  const message = JSON.parse(line);
  if (message.method === 'initialized') { initialized = true; continue; }
  if (process.argv.includes('--stall')) continue;
  if (message.method === 'initialize') {
    if (!message.params.clientInfo.name) throw new Error('missing identity');
    send({id:message.id,result:{userAgent:'fixture'}});
  } else if (!initialized) {
    send({id:message.id,error:{code:-32000,message:'Initialize first'}});
  } else if (message.method === 'account/read') {
    send({id:message.id,result:{account:{type:'chatgpt',email:'private-user@example.test',planType:'plus'}}});
  } else if (message.method === 'account/rateLimits/read') {
    process.stdout.write('diagnostic line to ignore\n');
    send({method:'unrelated/notification',params:{}});
    send({id:message.id,result:{
      accountId:'private-account-id',
      accessToken:'secret-token-must-not-publish',
      ordinaryUsageAllowed:true,
      rateLimits:{planType:'plus',primary:{usedPercent:30,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+7200},secondary:{usedPercent:55,windowDurationMins:10080,resetsAt:Math.floor(Date.now()/1000)+172800}},
    }});
  } else if (message.method) throw new Error('Forbidden method: '+message.method);
}
