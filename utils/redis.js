/* eslint-disable linebreak-style */
import { createClient } from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    this.client = createClient();
    this.client.on('error', (error) => console.log(error.message));
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    const asyncGet = await promisify(this.client.get).bind(this.client);
    const value = await asyncGet(key);
    return value;
  }

  async set(key, value, duration) {
    await this.client.set(key, value);
    await this.client.expire(key, duration);
  }

  async del(key) {
    await this.client.del(key);
  }
}

const redisClient = new RedisClient();

module.exports = redisClient;
