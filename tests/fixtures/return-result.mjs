const envelope = JSON.parse(await new Response(process.stdin).text());
const config = envelope.context.config;
process.stdout.write(JSON.stringify(config.append !== undefined
  ? {payload_version:'1.1',ok:true,subject_replacement:(envelope.subject?.assembled_prompt ?? '') + config.append}
  : config));
