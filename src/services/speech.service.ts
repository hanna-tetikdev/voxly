import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI, { toFile } from 'openai'
import { AudioService } from './audio.service'
import { CalendarEvent, CalendarService } from './calendar.service'

export interface TranscriptionSegment {
	start: number
	end: number
	text: string
}

export interface WordTiming {
	word: string
	start: number
	end: number
}

export interface TranscriptionResult {
	text: string
	segments: TranscriptionSegment[]
	words: WordTiming[]
	audioBuffer: ArrayBuffer
	duration: number
}

export interface VoiceFeatures {
	summary: string
	tasks: string[]
	events: CalendarEvent[]
}

@Injectable()
export class SpeechService {
	private readonly logger = new Logger(SpeechService.name)
	private readonly openai: OpenAI
	private readonly botToken: string

	constructor(
		private readonly configService: ConfigService,
		private readonly calendarService: CalendarService,
		private readonly audioService: AudioService,
	) {
		this.botToken = this.configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN')
		this.openai = new OpenAI({
			apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
			timeout: 60000,
			maxRetries: 2,
		})
	}

	async transcribeVoice(
		filePath: string,
		upload: { fileName: string; mimeType: string } = { fileName: 'voice.ogg', mimeType: 'audio/ogg' },
	): Promise<TranscriptionResult> {
		const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`

		this.logger.log(`Downloading voice file: ${filePath}`)
		const response = await fetch(fileUrl)

		if (!response.ok) {
			throw new Error(`Failed to download file: ${response.statusText}`)
		}

		const arrayBuffer = await response.arrayBuffer()
		this.logger.log(`Downloaded ${arrayBuffer.byteLength} bytes`)

		const extension = upload.fileName.split('.').pop()?.toLowerCase() ?? 'ogg'
		let whisperBytes: Buffer = Buffer.from(arrayBuffer)
		let whisperName = upload.fileName
		let whisperType = upload.mimeType
		if (extension !== 'ogg' && extension !== 'oga') {
			this.logger.log(`Transcoding ${extension} to ogg before Whisper`)
			whisperBytes = await this.audioService.transcodeToOgg(arrayBuffer, extension)
			whisperName = 'audio.ogg'
			whisperType = 'audio/ogg'
		}

		const file = await toFile(whisperBytes, whisperName, { type: whisperType })

		this.logger.log('Sending to Whisper for transcription...')
		try {
			const transcription = await this.openai.audio.transcriptions.create({
				file,
				model: 'whisper-1',
				language: 'ru',
				response_format: 'verbose_json',
				timestamp_granularities: ['word', 'segment'],
			})

			const segments: TranscriptionSegment[] = (transcription.segments ?? []).map((s) => ({
				start: s.start,
				end: s.end,
				text: s.text.trim(),
			}))

			const words: WordTiming[] = (transcription.words ?? []).map((w) => ({
				word: w.word,
				start: w.start,
				end: w.end,
			}))

			this.logger.log(`Transcription complete, segments: ${segments.length}, words: ${words.length}`)

			return {
				text: transcription.text,
				segments,
				words,
				audioBuffer: arrayBuffer,
				duration: transcription.duration ?? 0,
			}
		} catch (error) {
			if (error instanceof Error) {
				this.logger.error(`Whisper error: ${error.message}`)
				this.logger.error(`Stack: ${error.stack}`)
			}
			throw error
		}
	}

	async splitByTopics(text: string, words: WordTiming[]): Promise<TranscriptionSegment[]> {
		this.logger.log('Asking GPT to split by topics...')

		const prompt = `Раздели этот текст на логические части (по темам или мыслям). 
Верни JSON массив с индексами слов, где начинается каждая новая часть.

Текст: "${text}"

Слова с индексами:
${words.map((w, i) => `${i}: ${w.word}`).join(', ')}

Ответь ТОЛЬКО валидным JSON в формате:
{"splits": [{"startWordIndex": 0, "title": "краткое название темы"}, {"startWordIndex": 15, "title": "следующая тема"}, ...]}

Минимум 2 части, максимум 10. Каждая часть минимум 3 слова.`

		const response = await this.openai.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: prompt }],
			response_format: { type: 'json_object' },
			temperature: 0.3,
		})

		const content = response.choices[0]?.message?.content ?? '{}'
		this.logger.log(`GPT response: ${content}`)

		try {
			const parsed = JSON.parse(content) as { splits: Array<{ startWordIndex: number; title: string }> }
			const splits = parsed.splits ?? []

			if (splits.length < 2) {
				return this.fallbackSegments(text, words)
			}

			// Конвертируем в сегменты с таймингами
			const segments: TranscriptionSegment[] = []
			for (let i = 0; i < splits.length; i++) {
				const startIdx = splits[i].startWordIndex
				const endIdx = i < splits.length - 1 ? splits[i + 1].startWordIndex - 1 : words.length - 1

				if (startIdx >= words.length || endIdx < startIdx) continue

				const segmentWords = words.slice(startIdx, endIdx + 1)
				const text = segmentWords.map((w) => w.word).join(' ')

				segments.push({
					start: words[startIdx].start,
					end: words[endIdx].end,
					text: `${splits[i].title}: ${text}`,
				})
			}

			this.logger.log(`Created ${segments.length} topic-based segments`)
			return segments
		} catch {
			this.logger.error('Failed to parse GPT response, using fallback')
			return this.fallbackSegments(text, words)
		}
	}

	private fallbackSegments(text: string, words: WordTiming[]): TranscriptionSegment[] {

		const segments: TranscriptionSegment[] = []
		const chunkDuration = 30

		let currentStart = 0
		let currentWords: WordTiming[] = []

		for (const word of words) {
			currentWords.push(word)
			if (word.end - words[currentStart === 0 ? 0 : currentStart].start >= chunkDuration) {
				segments.push({
					start: words[currentStart === 0 ? 0 : currentStart].start,
					end: word.end,
					text: currentWords.map((w) => w.word).join(' '),
				})
				currentStart = words.indexOf(word) + 1
				currentWords = []
			}
		}

		if (currentWords.length > 0) {
			segments.push({
				start: currentWords[0].start,
				end: currentWords[currentWords.length - 1].end,
				text: currentWords.map((w) => w.word).join(' '),
			})
		}

		return segments.length > 0 ? segments : [{ start: 0, end: words[words.length - 1]?.end ?? 0, text }]
	}

	formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60)
		const secs = Math.floor(seconds % 60)
		return `[${mins}:${secs.toString().padStart(2, '0')}]`
	}

	async generateSummary(text: string): Promise<string> {
		this.logger.log('Generating summary...')
		const response = await this.openai.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [
				{
					role: 'user',
					content: `Сделай короткое резюме этого текста в 2-3 предложения. Только суть, без воды.\n\nТекст: "${text}"`,
				},
			],
			temperature: 0.3,
			max_tokens: 200,
		})
		return response.choices[0]?.message?.content ?? 'Не удалось создать резюме'
	}

	async extractTasks(text: string): Promise<string[]> {
		this.logger.log('Extracting tasks...')
		const response = await this.openai.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [
				{
					role: 'user',
					content: `Найди в тексте ВСЕ задачи, дела и планы. Ищи фразы со словами:
- "нужно", "надо", "необходимо"
- "должен", "должна", "обязательно"
- "не забыть", "напомни", "запомнить"
- "планирую", "собираюсь", "хочу сделать"
- "купить", "позвонить", "написать", "сделать", "отправить"
- любые действия в будущем времени

Каждую задачу сформулируй коротко и чётко как пункт TODO-листа (начинай с глагола).

Текст: "${text}"

Ответь JSON: {"tasks": ["Позвонить маме", "Купить молоко", "Отправить отчёт"]}
Если задач нет — {"tasks": []}`,
				},
			],
			response_format: { type: 'json_object' },
			temperature: 0.2,
		})

		try {
			const content = response.choices[0]?.message?.content ?? '{}'
			const parsed = JSON.parse(content) as { tasks?: string[] }
			return parsed.tasks ?? []
		} catch {
			return []
		}
	}

	async extractEvents(text: string): Promise<CalendarEvent[]> {
		this.logger.log('Extracting calendar events...')
		try {
			const response = await this.openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: [
					{
						role: 'user',
						content: `Сейчас: ${this.calendarService.nowLabel()}. Часовой пояс: ${this.calendarService.timeZone}.

Найди события, которые нужно положить в календарь: встреча, созвон, запись, дедлайн, день рождения, вылет, приём. Нужна конкретная дата или время.
Не включай обычные задачи без привязки к дню («купить молоко», «надо позвонить»).

Текст: "${text}"

Ответь JSON:
{"events":[{"title":"коротко","startDate":"YYYY-MM-DD","startTime":"HH:mm или null","endDate":"YYYY-MM-DD или null","endTime":"HH:mm или null"}]}

Правила:
- Относительные даты («завтра», «в пятницу», «10 октября») переведи в абсолютные от сегодняшней даты.
- Год не назван — ближайшая такая дата, не в прошлом. Если день в этом месяце уже прошёл — следующий месяц или год.
- Дата не названа, но есть время — сегодня.
- startTime = null, если время суток не сказано (событие на весь день).
- endDate — последний день включительно. Для одного дня оставь null.
- endTime = null, если конец не сказан.
- «в 3» без «утра/ночи» для встречи — 15:00. «утром» — утро, «вечером» — плюс 12 к часу, если час < 12.
- Максимум 5 событий. Если событий нет — {"events":[]}.`,
					},
				],
				response_format: { type: 'json_object' },
				temperature: 0.1,
			})

			const content = response.choices[0]?.message?.content ?? '{}'
			return this.calendarService.normalize(JSON.parse(content))
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error'
			this.logger.error(`Calendar extract failed: ${message}`)
			return []
		}
	}

	async processAllFeatures(text: string): Promise<VoiceFeatures> {
		const [summary, tasks, events] = await Promise.all([
			this.generateSummary(text),
			this.extractTasks(text),
			this.extractEvents(text),
		])

		return { summary, tasks, events }
	}
}
