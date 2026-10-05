import { Injectable, Logger } from '@nestjs/common'
import { Context, InputFile } from 'grammy'
import { TranscriptionService } from '../services/transcription.service'
import { ImageService } from '../services/image.service'
import * as fs from 'fs'

@Injectable()
export class TelegramCommandsService {
	private readonly logger = new Logger(TelegramCommandsService.name)

	constructor(
		private readonly transcriptionService: TranscriptionService,
		private readonly imageService: ImageService,
	) {}

	async handleSearch(ctx: Context): Promise<void> {
		const userId = ctx.from?.id
		if (!userId) return

		const text = ctx.message?.text?.replace('/search', '').trim()
		if (!text) {
			await ctx.reply('Напиши что искать: /search ключевое слово')
			return
		}

		const results = await this.transcriptionService.search(userId, text)
		if (results.length === 0) {
			await ctx.reply('🔍 Ничего не найдено')
			return
		}

		let response = `🔍 Найдено ${results.length}:\n\n`
		for (const r of results) {
			const date = r.createdAt.toLocaleDateString('ru-RU')
			const preview = r.summary ?? r.text.slice(0, 100) + '...'
			response += `📅 ${date}\n${preview}\n\n`
		}

		await ctx.reply(response)
	}

	async handleStats(ctx: Context): Promise<void> {
		const userId = ctx.from?.id
		if (!userId) return

		const stats = await this.transcriptionService.getStats(userId)

		const formatDuration = (secs: number) => {
			const mins = Math.floor(secs / 60)
			const hours = Math.floor(mins / 60)
			if (hours > 0) return `${hours}ч ${mins % 60}м`
			return `${mins}м`
		}

		let response = `📊 *Твоя статистика*\n\n`
		response += `*Всего:*\n`
		response += `• ${stats.totalMessages} голосовых\n`
		response += `• ${formatDuration(stats.totalDuration)} наговорено\n`
		response += `• ${stats.totalWords} слов\n\n`

		response += `*За неделю:*\n`
		response += `• ${stats.thisWeek.messages} голосовых\n`
		response += `• ${formatDuration(stats.thisWeek.duration)}\n\n`

		response += `*За месяц:*\n`
		response += `• ${stats.thisMonth.messages} голосовых\n`
		response += `• ${formatDuration(stats.thisMonth.duration)}`

		await ctx.reply(response, { parse_mode: 'Markdown' })
	}

	async handleRecent(ctx: Context): Promise<void> {
		const userId = ctx.from?.id
		if (!userId) return

		const recent = await this.transcriptionService.getRecent(userId, 5)
		if (recent.length === 0) {
			await ctx.reply('📭 Пока нет голосовых')
			return
		}

		let response = `📋 *Последние голосовые:*\n\n`
		for (const r of recent) {
			const date = r.createdAt.toLocaleDateString('ru-RU')
			const preview = r.summary ?? r.text.slice(0, 80) + '...'
			response += `📅 ${date}\n${preview}\n\n`
		}

		await ctx.reply(response, { parse_mode: 'Markdown' })
	}

	async handleCard(ctx: Context): Promise<void> {
		const userId = ctx.from?.id
		if (!userId) return

		const [latest] = await this.transcriptionService.getRecent(userId, 1)
		if (!latest) {
			await ctx.reply('🤷 Сначала отправь голосовое сообщение')
			return
		}

		await ctx.reply('🎨 Генерирую карточку...')

		try {
			const cardPath = this.imageService.generateCard({
				summary: latest.summary || latest.text,
				duration: latest.duration,
				date: new Date(latest.createdAt),
			})

			await ctx.replyWithPhoto(new InputFile(fs.createReadStream(cardPath), 'voxly-card.png'), {
				caption: '✨ Твоя карточка готова! Сохрани и делись в сторис 📱',
			})

			this.imageService.cleanup(cardPath)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.logger.error('Card generation failed:', error)
			await ctx.reply(`❌ Не удалось создать карточку\n${message}`)
		}
	}
}
