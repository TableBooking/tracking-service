import { createApplication } from './bootstrap.js';
import { config } from './config/env.js';
const app = await createApplication();
await app.listen(config.PORT, config.HOST);
