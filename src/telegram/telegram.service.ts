import { Injectable } from '@nestjs/common'
import { Context } from 'grammy'
import { TelegramVoiceService } from './telegram-voice.service'
import { TelegramTasksService } from './telegram-tasks.service'
import { TelegramCommandsService } from './telegram-commands.service'

@Injectable()
export class TelegramService {
	constructor(
		private readonly voiceService: TelegramVoiceService,
		private readonly tasksService: TelegramTasksService,
		private readonly commandsService: TelegramCommandsService,
	) {}

	async handleStart(ctx: Context): Promise<void> {
		await ctx.reply(
			`🫡 Готов слушать даже 40 минут твоих мыслей!

📤 Присылай голосовое — сделаю:
• Транскрипцию с тайм-кодами
• Нарезку по темам
• Резюме и перевод
• Список задач из "нужно", "надо"

📋 Команды:
/tasks — активные задачи ✅
/alltasks — все задачи
/search [текст] — поиск
/stats — статистика
/recent — последние голосовые
/card — карточка для сторис 🎨`
		)
	}

	// Voice
	handleVoice(ctx: Context): Promise<void> {
		return this.voiceService.handleVoice(ctx)
	}

	// Tasks
	handleTasks(ctx: Context, editMessageId?: number): Promise<void> {
		return this.tasksService.handleTasks(ctx, editMessageId)
	}

	handleTaskComplete(ctx: Context): Promise<void> {
		return this.tasksService.handleTaskComplete(ctx)
	}

	handleAllTasks(ctx: Context): Promise<void> {
		return this.tasksService.handleAllTasks(ctx)
	}

	handleClearTasks(ctx: Context): Promise<void> {
		return this.tasksService.handleClearTasks(ctx)
	}

	// Commands
	handleSearch(ctx: Context): Promise<void> {
		return this.commandsService.handleSearch(ctx)
	}

	handleStats(ctx: Context): Promise<void> {
		return this.commandsService.handleStats(ctx)
	}

	handleRecent(ctx: Context): Promise<void> {
		return this.commandsService.handleRecent(ctx)
	}

	handleCard(ctx: Context): Promise<void> {
		return this.commandsService.handleCard(ctx)
	}
}
