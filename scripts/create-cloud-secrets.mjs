import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const file=new URL('../.env.cloud',import.meta.url);
// Exclusive creation preserves previously configured deployment credentials.
writeFileSync(file,'# Server secrets. Never commit or paste into chat.\nPERPL_BACKEND_TOKEN='+randomBytes(32).toString('hex')+'\nPERPL_JOB_TOKEN='+randomBytes(32).toString('hex')+'\n',{flag:'wx',mode:0o600});
console.log('Created .env.cloud. Copy these values into server-side hosting settings; no secrets were printed.');
