import { Injectable, Logger } from '@nestjs/common'
import { Context, InlineKeyboard, InputFile } from 'grammy'
import { CalendarEvent, CalendarService } from '../services/calendar.service'
import { SpeechService } from '../services/speech.service'

@Injectable()
export class TelegramCalendarService {
	private readonly logger = new Logger(TelegramCalendarService.name)

	constructor(
		private readonly calendarService: CalendarService,
		private readonly speechService: SpeechService,
	) {}

	async handleText(ctx: Context): Promise<void> {
		const text = ctx.message?.text?.trim()
		if (!text || text.startsWith('/')) return
		if (!this.calendarService.looksLikeEvent(text)) return

		try {
			await ctx.replyWithChatAction('upload_document')
			const events = await this.speechService.extractEvents(text)
			if (events.length === 0) {
				await ctx.reply('Не разобрал событие. Напиши дату и что будет, например: «встреча завтра в 15:00»')
				return
			}
			await this.sendEvents(ctx, events)
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error'
			this.logger.error(`Calendar text failed: ${message}`)
			await ctx.reply('❌ Не смог собрать событие')
		}
	}

	async sendEvents(ctx: Context, events: CalendarEvent[]): Promise<void> {
		if (events.length === 0) return

		try {
			if (events.length > 1) {
				await ctx.reply(
					`📅 Нашёл ${events.length} ${eventsPhrase(events.length)}. Открой каждый файл — календарь предложит добавить.`,
				)
			}

			for (const event of events) {
				const keyboard = new InlineKeyboard().url(
					'Добавить в Google Календарь',
					this.calendarService.googleUrl(event),
				)
				await ctx.replyWithDocument(
					new InputFile(Buffer.from(this.calendarService.toIcs(event)), this.calendarService.fileName(event)),
					{
						caption: `📅 ${this.calendarService.label(event)}\n\nОткрой файл — календарь предложит добавить событие.\n${this.calendarService.reminderText(event)}`,
						reply_markup: keyboard,
					},
				)
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error'
			this.logger.error(`Calendar send failed: ${message}`)
			await ctx.reply('❌ Не смог отправить событие в календарь')
		}
	}
}

function eventsPhrase(count: number): string {
	const n = Math.abs(count) % 100
	const n1 = n % 10
	if (n > 10 && n < 20) return 'событий'
	if (n1 > 1 && n1 < 5) return 'события'
	if (n1 === 1) return 'событие'
	return 'событий'
}
