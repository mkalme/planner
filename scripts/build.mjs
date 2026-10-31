import fs from 'node:fs/promises';
await fs.mkdir('dist',{recursive:true});await fs.cp('public','dist',{recursive:true});
const clientId=process.env.GOOGLE_CLIENT_ID||'';
if(process.env.CI&&!clientId)throw new Error('Set the public GOOGLE_CLIENT_ID repository variable before deploying.');
if(clientId&&!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId))throw new Error('Invalid Google OAuth client ID');
await fs.writeFile('dist/config.js',`window.PLANNER_CONFIG=${JSON.stringify({googleClientId:clientId})};\n`);
console.log('Static app built in dist/');
