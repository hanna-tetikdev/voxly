import { NestjsGrammyModule } from '@grammyjs/nestjs'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TelegramUpdate } from './telegram.update'
import { TelegramService } from './telegram.service'
import { TelegramVoiceService } from './telegram-voice.service'
import { TelegramTasksService } from './telegram-tasks.service'
import { TelegramCommandsService } from './telegram-commands.service'
import { SpeechService } from '../services/speech.service'
import { AudioService } from '../services/audio.service'
import { TranscriptionService } from '../services/transcription.service'
import { ImageService } from '../services/image.service'
import { TaskService } from '../services/task.service'
import { Transcription } from '../entities/transcription.entity'
import { Task } from '../entities/task.entity'

@Module({
	imports: [
		ConfigModule,
		TypeOrmModule.forFeature([Transcription, Task]),
		NestjsGrammyModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				token: configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN'),
			}),
		}),
	],
	providers: [
		TelegramUpdate,
		TelegramService,
		TelegramVoiceService,
		TelegramTasksService,
		TelegramCommandsService,
		SpeechService,
		AudioService,
		TranscriptionService,
		ImageService,
		TaskService,
	],
})
export class TelegramModule {}
