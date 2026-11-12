import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get(AppConfig);
  await app.listen(config.env.API_PORT);
  Logger.log(
    `API SRC Digital à l'écoute sur le port ${config.env.API_PORT}`,
    'Bootstrap',
  );
}

void bootstrap();
