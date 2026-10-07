import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { CALENDAR_TIMEZONE } from '../../constants'

export type CalendarEvent =
	| {
			title: string
			allDay: true
			startDate: string
			endDate: string
	  }
	| {
			title: string
			allDay: false
			startDate: string
			startTime: string
			endDate: string
			endTime: string
			timedEnd: boolean
	  }

const EVENT_HINT =
	/завтра|послезавтра|сегодня|понедельник|вторник|сред[аыу]|четверг|пятниц|суббот|воскресень|январ|феврал|март|апрел|(?:^|[^а-яё])ма[йя](?:[^а-яё]|$)|июн|июл|август|сентябр|октябр|ноябр|декабр|календар|числ|\d{1,2}[:.]\d{2}|\d{1,2}[./]\d{1,2}|через\s+\d+|в\s+\d{1,2}\b/i

@Injectable()
export class CalendarService {
	readonly timeZone = CALENDAR_TIMEZONE

	nowLabel(now = new Date()): string {
		return new Intl.DateTimeFormat('ru-RU', {
			timeZone: this.timeZone,
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
		}).format(now)
	}

	looksLikeEvent(text: string): boolean {
		return EVENT_HINT.test(text.toLowerCase())
	}

	normalize(raw: unknown): CalendarEvent[] {
		if (!raw || typeof raw !== 'object') return []
		const events = (raw as { events?: unknown }).events
		if (!Array.isArray(events)) return []

		const result: CalendarEvent[] = []
		for (const item of events) {
			const event = this.normalizeOne(item)
			if (!event) continue
			result.push(event)
			if (result.length === 5) break
		}
		return result
	}

	label(event: CalendarEvent): string {
		return `${event.title}\n${this.whenLabel(event)}`
	}

	reminderText(event: CalendarEvent): string {
		return event.allDay ? 'Напоминание в 9:00 в день события.' : 'Напоминание за час до начала.'
	}

	fileName(event: CalendarEvent): string {
		const safe = event.title
			.replace(/[\\/:*?"<>|\r\n]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 40)
		return `${safe || 'event'}.ics`
	}

	googleUrl(event: CalendarEvent): string {
		const dates = event.allDay
			? `${compactDate(event.startDate)}/${compactDate(event.endDate)}`
			: `${compactDateTime(event.startDate, event.startTime)}/${compactDateTime(event.endDate, event.endTime)}`

		const params = new URLSearchParams({
			action: 'TEMPLATE',
			text: event.title,
			dates,
			ctz: this.timeZone,
		})
		return `https://calendar.google.com/calendar/render?${params.toString()}`
	}

	toIcs(event: CalendarEvent, now = new Date()): string {
		const stamp = formatUtcStamp(now)
		const start = event.allDay
			? `DTSTART;VALUE=DATE:${compactDate(event.startDate)}`
			: `DTSTART:${compactDateTime(event.startDate, event.startTime)}`
		const end = event.allDay
			? `DTEND;VALUE=DATE:${compactDate(event.endDate)}`
			: `DTEND:${compactDateTime(event.endDate, event.endTime)}`

		const lines = [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Voxly//Calendar//RU',
			'CALSCALE:GREGORIAN',
			'METHOD:PUBLISH',
			'BEGIN:VEVENT',
			`UID:${randomUUID()}@voxly`,
			`DTSTAMP:${stamp}`,
			start,
			end,
			`SUMMARY:${escapeIcsText(event.title)}`,
			'STATUS:CONFIRMED',
			...alarmLines(event),
			'END:VEVENT',
			'END:VCALENDAR',
		]

		return lines.map(foldIcsLine).join('\r\n') + '\r\n'
	}

	private whenLabel(event: CalendarEvent): string {
		if (event.allDay) {
			const lastDay = addDays(event.endDate, -1)
			if (lastDay === event.startDate) return formatDay(event.startDate)
			return `${formatDay(event.startDate)} – ${formatDay(lastDay)}`
		}

		const start = `${formatDay(event.startDate)}, ${event.startTime}`
		if (!event.timedEnd) return start
		if (event.endDate === event.startDate) return `${start}–${event.endTime}`
		return `${start} – ${formatDay(event.endDate)}, ${event.endTime}`
	}

	private normalizeOne(raw: unknown): CalendarEvent | null {
		if (!raw || typeof raw !== 'object') return null
		const item = raw as Record<string, unknown>
		const title = normalizeTitle(item.title)
		const startDate = normalizeDate(item.startDate)
		if (!startDate) return null

		const startTime = normalizeTime(item.startTime)
		if (!startTime) {
			const inclusiveEnd = normalizeDate(item.endDate)
			const last = inclusiveEnd && inclusiveEnd >= startDate ? inclusiveEnd : startDate
			return {
				title,
				allDay: true,
				startDate,
				endDate: addDays(last, 1),
			}
		}

		let endDate = normalizeDate(item.endDate) ?? startDate
		let endTime = normalizeTime(item.endTime)
		let timedEnd = endTime !== null
		if (!endTime || `${endDate}T${endTime}` <= `${startDate}T${startTime}`) {
			const end = addMinutes(startDate, startTime, 60)
			endDate = end.date
			endTime = end.time
			timedEnd = false
		}

		return {
			title,
			allDay: false,
			startDate,
			startTime,
			endDate,
			endTime,
			timedEnd,
		}
	}
}

function normalizeTitle(value: unknown): string {
	if (typeof value !== 'string') return 'Событие'
	const title = value.replace(/\s+/g, ' ').trim()
	if (!title) return 'Событие'
	return title.slice(0, 200)
}

function normalizeDate(value: unknown): string | null {
	if (typeof value !== 'string') return null
	const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
	if (!match) return null

	const year = Number(match[1])
	const month = Number(match[2])
	const day = Number(match[3])
	const date = new Date(Date.UTC(year, month - 1, day))
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
		return null
	}
	return `${match[1]}-${match[2]}-${match[3]}`
}

function normalizeTime(value: unknown): string | null {
	if (typeof value !== 'string') return null
	const trimmed = value.trim()
	if (!trimmed || trimmed.toLowerCase() === 'null') return null

	const match = trimmed.match(/^(\d{1,2})[:.](\d{2})/)
	if (!match) return null

	const hour = Number(match[1])
	const minute = Number(match[2])
	if (hour > 23 || minute > 59) return null
	return `${String(hour).padStart(2, '0')}:${match[2]}`
}

function addDays(isoDate: string, days: number): string {
	const [year, month, day] = isoDate.split('-').map(Number)
	const date = new Date(Date.UTC(year, month - 1, day + days))
	const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
	const dd = String(date.getUTCDate()).padStart(2, '0')
	return `${date.getUTCFullYear()}-${mm}-${dd}`
}

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
	const [hour, minute] = time.split(':').map(Number)
	const total = hour * 60 + minute + minutes
	const dayDelta = Math.floor(total / 1440)
	const rest = ((total % 1440) + 1440) % 1440
	return {
		date: addDays(date, dayDelta),
		time: `${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}`,
	}
}

function formatDay(isoDate: string): string {
	const [year, month, day] = isoDate.split('-').map(Number)
	const date = new Date(Date.UTC(year, month - 1, day, 12))
	return new Intl.DateTimeFormat('ru-RU', {
		timeZone: 'UTC',
		day: 'numeric',
		month: 'long',
	}).format(date)
}

function compactDate(isoDate: string): string {
	return isoDate.replace(/-/g, '')
}

function compactDateTime(isoDate: string, time: string): string {
	return `${compactDate(isoDate)}T${time.replace(':', '')}00`
}

function formatUtcStamp(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, '0')
	return (
		`${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
		`T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
	)
}

function alarmLines(event: CalendarEvent): string[] {
	return [
		'BEGIN:VALARM',
		'ACTION:DISPLAY',
		`DESCRIPTION:${escapeIcsText(event.title)}`,
		event.allDay ? 'TRIGGER:PT9H' : 'TRIGGER:-PT1H',
		'END:VALARM',
	]
}

function escapeIcsText(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/\r\n|\n|\r/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

function foldIcsLine(line: string): string {
	const bytes = Buffer.from(line, 'utf8')
	if (bytes.length <= 75) return line

	const parts: string[] = []
	let start = 0
	let limit = 75
	while (start < bytes.length) {
		let end = Math.min(start + limit, bytes.length)
		while (end > start && (bytes[end] & 0xc0) === 0x80) end--
		if (end === start) end = Math.min(start + limit, bytes.length)
		parts.push(bytes.subarray(start, end).toString('utf8'))
		start = end
		limit = 74
	}
	return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join('\r\n')
}
