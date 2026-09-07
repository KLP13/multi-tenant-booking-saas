import dotenv from 'dotenv';
dotenv.config();

import Redis from 'ioredis';

async function check() {
  const url = process.env.REDIS_URL;
  console.log('Connecting to URL host:', url?.split('@')[1]);

  const client = new Redis(url!);

  const pong = await client.ping();
  console.log('1. PING Response from Cloud:', pong);

  await client.set('verification_test_key', 'VERIFIED_UPSTASH_LIVE');
  const storedVal = await client.get('verification_test_key');
  console.log('2. Stored & Retrieved Key:', storedVal);

  const info = await client.info('server');
  const versionLine = info.split('\n').find((l) => l.startsWith('redis_version:'));
  console.log('3. Upstash Redis Engine:', versionLine?.trim());

  await client.quit();
  process.exit(0);
}

check().catch(console.error);
