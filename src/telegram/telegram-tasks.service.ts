import { Injectable } from '@nestjs/common'
import { Context, GrammyError, InlineKeyboard } from 'grammy'
import { TaskService } from '../services/task.service'

@Injectable()
export class TelegramTasksService {
	constructor(private readonly taskService: TaskService) {}

	async handleTasks(ctx: Context, editMessageId?: number): Promise<void> {
		const userId = ctx.from?.id
		if (!userId) return

		const tasks = await this.taskService.getActiveTasks(userId)
		const stats = await this.taskService.getStats(userId)

		if (tasks.length === 0) {
			const emptyMsg = '📭 Все задачи выполнены! 🎉\n\nОтправь голосовое со словами "нужно", "надо" — появятся новые.'
			if (editMessageId && ctx.chat?.id) {
				try {
					await ctx.api.editMessageText(ctx.chat.id, editMessageId, emptyMsg)
				} catch {
					// Игнорируем ошибки редактирования
				}
			} else {
				await ctx.reply(emptyMsg)
			}
			return
		}

		let message = `📋 *Задачи* (${stats.pending} осталось)\n\n`

		const keyboard = new InlineKeyboard()

		for (let i = 0; i < Math.min(tasks.length, 10); i++) {
			const task = tasks[i]
			message += `${i + 1}. ☐ ${task.text}\n`
			const btnText = `✓ ${i + 1}. ${task.text.slice(0, 25)}${task.text.length > 25 ? '…' : ''}`
			keyboard.text(btnText, `complete_${task.id}`).row()
		}

		if (tasks.length > 10) {
			message += `\n_... и ещё ${tasks.length - 10}_`
		}

		if (editMessageId && ctx.chat?.id) {
			try {
				await ctx.api.editMessageText(ctx.chat.id, editMessageId, message, {
					parse_mode: 'Markdown',
					reply_markup: keyboard,
				})
			} catch (error) {
				if (!(error instanceof GrammyError && error.description.includes('message is not modified'))) {
					throw error
				}
			}
		} else {
			await ctx.reply(message, {
				parse_mode: 'Markdown',
				reply_markup: keyboard,
			})
		}
	}

	async handleTaskComplete(ctx: Context): Promise<void> {
		const userId = ctx.from?.id
		if (!userId) return

		const data = ctx.callbackQuery?.data
		if (!data?.startsWith('complete_')) return


		try {
			await ctx.answerCallbackQuery({ text: '✅ Выполнено!' })
		} catch {
			// Ignore if callback already expired
		}

		const taskId = parseInt(data.replace('complete_', ''))
		const task = await this.taskService.completeTask(userId, taskId)

		if (task) {
		
			const messageId = ctx.callbackQuery?.message?.message_id
			try {
				await this.handleTasks(ctx, messageId)
			} catch {
				// Ignore stale callbacks or network errors
			}
		}
	}

	async handleAllTasks(ctx: Context): Promise<void> {
		const userId = ctx.from?.id
		if (!userId) return

		const tasks = await this.taskService.getAllTasks(userId, 20)

		if (tasks.length === 0) {
			await ctx.reply('📭 История задач пуста')
			return
		}

		let message = '📋 *Все задачи:*\n\n'

		for (const task of tasks) {
			const icon = task.completed ? '✅' : '☐'
			const date = task.createdAt.toLocaleDateString('ru-RU')
			message += `${icon} ${task.text} _(${date})_\n`
		}

		message += '\n/cleartasks — удалить все задачи'

		await ctx.reply(message, { parse_mode: 'Markdown' })
	}

	async handleClearTasks(ctx: Context): Promise<void> {
		const userId = ctx.from?.id
		if (!userId) return

		const deleted = await this.taskService.clearAll(userId)
		await ctx.reply(`🗑 Удалено ${deleted} задач. Список очищен!`)
	}
}
