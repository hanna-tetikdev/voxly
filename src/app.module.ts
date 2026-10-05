import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TelegramModule } from './telegram/telegram.module'
import { Transcription } from './entities/transcription.entity'
import { Task } from './entities/task.entity'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
		TypeOrmModule.forRoot({
			type: 'sqljs',
			location: 'voxly.db',
			autoSave: true,
			entities: [Transcription, Task],
			synchronize: true,
		}),
		TelegramModule,
	],
})
export class AppModule {}
