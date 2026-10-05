import { Injectable, Logger } from '@nestjs/common'
import { Context, InputFile } from 'grammy'
import { SpeechService } from '../services/speech.service'
import { AudioService } from '../services/audio.service'
import { TranscriptionService } from '../services/transcription.service'
import { TaskService } from '../services/task.service'
import * as fs from 'fs'

@Injectable()
export class TelegramVoiceService {
	private readonly logger = new Logger(TelegramVoiceService.name)

	constructor(
		private readonly speechService: SpeechService,
		private readonly audioService: AudioService,
		private readonly transcriptionService: TranscriptionService,
		private readonly taskService: TaskService,
	) {}

	async handleVoice(ctx: Context): Promise<void> {
		const voice = ctx.msg?.voice
		if (!voice) {
			return
		}

		const chatId = ctx.chat?.id
		const userId = ctx.from?.id

		let progressMessageId: number | undefined
		let interval: NodeJS.Timeout | undefined
		let percent = 10

		try {
			const file = await ctx.getFile()
			await ctx.reply(`⏱ Длина: ${voice.duration} сек. Обрабатываю...`)

			const progressMessage = await ctx.reply(this.renderProgress(percent))
			progressMessageId = progressMessage.message_id

			interval = setInterval(() => {
				if (percent < 90 && ctx.chat?.id && progressMessageId) {
					percent += 5
					void ctx.api.editMessageText(ctx.chat.id, progressMessageId, this.renderProgress(percent))
				}
			}, voice.duration > 300 ? 3000 : 2000)

			const result = await this.speechService.transcribeVoice(file.file_path!)

			await ctx.reply('🧠 Анализирую темы...')
			const topicSegments = await this.speechService.splitByTopics(result.text, result.words)

			clearInterval(interval)
			percent = 100
			if (ctx.chat?.id && progressMessageId) {
				await ctx.api.editMessageText(ctx.chat.id, progressMessageId, this.renderProgress(percent))
			}

			const textWithTimestamps = topicSegments
				.map((seg) => `${this.speechService.formatTime(seg.start)} ${seg.text}`)
				.join('\n\n')

			this.logger.log(`Topic segments: ${topicSegments.length}`)
			await ctx.reply(`📝 Транскрипция (${topicSegments.length} тем):\n\n${textWithTimestamps}`)

			if (topicSegments.length > 1) {
				await this.sendAudioSegments(ctx, result.audioBuffer, topicSegments)
			}

			await ctx.reply('🔮 Анализирую...')
			const features = await this.speechService.processAllFeatures(result.text)

			await this.sendFeatures(ctx, features, userId)

			if (chatId && userId) {
				await this.saveTranscription(chatId, userId, result.text, features, voice.duration)
			}

			this.logger.log(`Processing complete: ${file.file_path}`)
		} catch (error) {
			clearInterval(interval)
			const errorMessage = error instanceof Error ? error.message : 'Unknown error'
			console.error('Ошибка при обработке голосового:', errorMessage)
			await ctx.reply('❌ Ошибка при обработке голосового сообщения')
		}

		this.logger.log(`voice: ${voice.duration}, progressMessageId: ${progressMessageId}`)
	}

	private async sendAudioSegments(
		ctx: Context,
		audioBuffer: ArrayBuffer,
		topicSegments: { start: number; end: number; text: string }[],
	): Promise<void> {
		await ctx.reply('✂️ Нарезаю на части...')
		const audioSegments = await this.audioService.splitAudio(audioBuffer, topicSegments)

		for (const seg of audioSegments) {
			const timestamp = this.speechService.formatTime(seg.start)
			const caption = `${timestamp} ${seg.text}`

			await ctx.replyWithVoice(new InputFile(fs.createReadStream(seg.filePath)), {
				caption: caption.slice(0, 1024),
			})
		}

		this.audioService.cleanupSegments(audioSegments)
		await ctx.reply('✅ Нарезка готова!')
	}

	private async sendFeatures(
		ctx: Context,
		features: { summary: string; tasks: string[] },
		userId?: number,
	): Promise<void> {
		await ctx.reply(`📋 *Резюме:*\n${features.summary}`, { parse_mode: 'Markdown' })

		if (features.tasks.length > 0 && userId) {
			const savedTasks = await this.taskService.createTasks(userId, features.tasks)

			let taskMessage = '✅ *Найдены задачи:*\n\n'
			for (const task of savedTasks) {
				taskMessage += `☐ ${task.text}\n`
			}
			taskMessage += '\n📋 Смотри все задачи: /tasks'

			await ctx.reply(taskMessage, { parse_mode: 'Markdown' })
		}
	}

	private async saveTranscription(
		chatId: number,
		userId: number,
		text: string,
		features: { summary: string; tasks: string[] },
		duration: number,
	): Promise<void> {
		await this.transcriptionService.save({
			chatId,
			userId,
			text,
			summary: features.summary,
			tasks: features.tasks,
			duration,
		})
	}

	private renderProgress(percent: number): string {
		const stages = ['🫠', '😴', '🥱', '😐', '🙂', '😊', '😄', '🤩', '🔥', '🎉']
		const filledCount = Math.max(1, Math.round((percent / 100) * stages.length))
		const emptyChar = '·'

		const filled = stages.slice(0, filledCount).join('')
		const empty = emptyChar.repeat(stages.length - filledCount)

		return `${filled}${empty} ${percent}%`
	}
}
