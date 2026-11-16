import { createApplication } from './bootstrap.js';
import { config } from './config.js';
const app = await createApplication();
await app.listen(config.PORT, config.HOST);
