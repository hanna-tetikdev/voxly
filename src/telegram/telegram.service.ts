import { Injectable, OnModuleInit } from '@nestjs/common'
import { InjectBot } from '@grammyjs/nestjs'
import { Bot, Context } from 'grammy'
import { TelegramVoiceService } from './telegram-voice.service'
import { TelegramTasksService } from './telegram-tasks.service'
import { TelegramCommandsService } from './telegram-commands.service'
import { TelegramCalendarService } from './telegram-calendar.service'

@Injectable()
export class TelegramService implements OnModuleInit {
	constructor(
		@InjectBot() private readonly bot: Bot,
		private readonly voiceService: TelegramVoiceService,
		private readonly tasksService: TelegramTasksService,
		private readonly commandsService: TelegramCommandsService,
		private readonly calendarMessages: TelegramCalendarService,
	) {}

	async onModuleInit(): Promise<void> {
		await this.bot.api.setMyCommands([
			{ command: 'card', description: 'Карточка для сторис' },
			{ command: 'tasks', description: 'Активные задачи' },
			{ command: 'alltasks', description: 'Все задачи' },
			{ command: 'search', description: 'Поиск по голосовым' },
			{ command: 'stats', description: 'Статистика' },
			{ command: 'recent', description: 'Последние голосовые' },
		])
	}

	async handleStart(ctx: Context): Promise<void> {
		await ctx.reply(
			`🫡 Готов слушать даже 40 минут твоих мыслей!

📤 Присылай голосовое или файл .m4a — сделаю:
• Транскрипцию с тайм-кодами
• Нарезку по темам
• Резюме и перевод
• Список задач из "нужно", "надо"
• Файл календаря, если в речи есть дата и событие

📅 Или напиши текстом: «встреча завтра в 15:00» — пришлю файл, календарь предложит добавить.

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

	handleM4a(ctx: Context): Promise<void> {
		return this.voiceService.handleM4a(ctx)
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

	handleText(ctx: Context): Promise<void> {
		return this.calendarMessages.handleText(ctx)
	}
}
