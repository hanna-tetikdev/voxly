import { NestFactory } from '@nestjs/core';
import { Bot, GrammyError } from 'grammy';
import { AppModule } from './app.module';

// Original is always invoked with the bot instance via `.call`.
// eslint-disable-next-line @typescript-eslint/unbound-method
const startPolling = Bot.prototype.start;
Bot.prototype.start = async function (options) {
  for (;;) {
    try {
      await startPolling.call(this, options);
      return;
    } catch (error) {
      if (!(error instanceof GrammyError) || error.error_code !== 409) throw error;
      console.error('Another getUpdates is still open. Retrying in 3s.');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
