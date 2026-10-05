import { Command, On, Start, Update } from '@grammyjs/nestjs'
import { Injectable } from '@nestjs/common'
import { Context } from 'grammy'
import { TelegramService } from './telegram.service'

@Update()
@Injectable()
export class TelegramUpdate {
	constructor(private readonly telegramService: TelegramService) {}

	@Start()
	onStart(ctx: Context): Promise<void> {
		return this.telegramService.handleStart(ctx)
	}

	@On('message:voice')
	onVoiceMessage(ctx: Context): Promise<void> {
		return this.telegramService.handleVoice(ctx)
	}

	@Command('search')
	onSearch(ctx: Context): Promise<void> {
		return this.telegramService.handleSearch(ctx)
	}

	@Command('stats')
	onStats(ctx: Context): Promise<void> {
		return this.telegramService.handleStats(ctx)
	}

	@Command('recent')
	onRecent(ctx: Context): Promise<void> {
		return this.telegramService.handleRecent(ctx)
	}

	@Command('card')
	onCard(ctx: Context): Promise<void> {
		return this.telegramService.handleCard(ctx)
	}

	@Command('tasks')
	onTasks(ctx: Context): Promise<void> {
		return this.telegramService.handleTasks(ctx)
	}

	@Command('alltasks')
	onAllTasks(ctx: Context): Promise<void> {
		return this.telegramService.handleAllTasks(ctx)
	}

	@Command('cleartasks')
	onClearTasks(ctx: Context): Promise<void> {
		return this.telegramService.handleClearTasks(ctx)
	}

	@On('callback_query:data')
	onCallbackQuery(ctx: Context): Promise<void> {
		const data = ctx.callbackQuery?.data
		if (data?.startsWith('complete_')) {
			return this.telegramService.handleTaskComplete(ctx)
		}
		return Promise.resolve()
	}
}
