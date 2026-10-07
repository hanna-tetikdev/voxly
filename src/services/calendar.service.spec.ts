import { describe, expect, it } from '@jest/globals'
import { CalendarService } from './calendar.service'

describe('CalendarService', () => {
	const calendar = new CalendarService()

	it('defaults a timed event to one hour and keeps the spoken start', () => {
		const [event] = calendar.normalize({
			events: [
				{
					title: 'Встреча',
					startDate: '2026-10-10',
					startTime: '15:00',
					endDate: null,
					endTime: null,
				},
			],
		})

		expect(event).toMatchObject({
			title: 'Встреча',
			allDay: false,
			startDate: '2026-10-10',
			startTime: '15:00',
			endDate: '2026-10-10',
			endTime: '16:00',
			timedEnd: false,
		})
		expect(calendar.label(event)).toBe('Встреча\n10 октября, 15:00')
	})

	it('rolls a late start into the next day', () => {
		const [event] = calendar.normalize({
			events: [{ title: 'Вылет', startDate: '2026-10-10', startTime: '23:30', endDate: null, endTime: null }],
		})

		expect(event).toMatchObject({
			endDate: '2026-10-11',
			endTime: '00:30',
			timedEnd: false,
		})
	})

	it('keeps an explicit end and escapes commas in the ics summary', () => {
		const [event] = calendar.normalize({
			events: [
				{
					title: 'Созвон, клиент',
					startDate: '2026-10-10',
					startTime: '15:00',
					endDate: '2026-10-10',
					endTime: '15:30',
				},
			],
		})

		const ics = calendar.toIcs(event, new Date('2026-10-06T12:00:00Z'))
		expect(ics).toContain('DTSTART:20261010T150000\r\n')
		expect(ics).toContain('DTEND:20261010T153000\r\n')
		expect(ics).toContain('SUMMARY:Созвон\\, клиент\r\n')
		expect(ics).toContain('BEGIN:VALARM\r\n')
		expect(ics).toContain('TRIGGER:-PT1H\r\n')
		expect(ics).toContain('DESCRIPTION:Созвон\\, клиент\r\n')
		expect(calendar.reminderText(event)).toBe('Напоминание за час до начала.')
		expect(ics).toContain('DTSTAMP:20261006T120000Z\r\n')
		expect(calendar.googleUrl(event)).toContain('dates=20261010T150000%2F20261010T153000')
		expect(calendar.googleUrl(event)).toContain('ctz=Europe%2FKyiv')
	})

	it('treats a date without time as an inclusive all-day range', () => {
		const [event] = calendar.normalize({
			events: [{ title: 'Конференция', startDate: '2026-10-10', startTime: null, endDate: '2026-10-12', endTime: null }],
		})

		expect(event).toEqual({
			title: 'Конференция',
			allDay: true,
			startDate: '2026-10-10',
			endDate: '2026-10-13',
		})
		expect(calendar.toIcs(event)).toContain('DTSTART;VALUE=DATE:20261010')
		expect(calendar.toIcs(event)).toContain('DTEND;VALUE=DATE:20261013')
		expect(calendar.toIcs(event)).toContain('TRIGGER:PT9H')
		expect(calendar.reminderText(event)).toBe('Напоминание в 9:00 в день события.')
		expect(calendar.label(event)).toBe('Конференция\n10 октября – 12 октября')
	})

	it('drops impossible dates and caps the list', () => {
		const events = calendar.normalize({
			events: [
				{ title: 'Битая', startDate: '2026-02-31', startTime: '10:00' },
				{ title: '1', startDate: '2026-10-01', startTime: null },
				{ title: '2', startDate: '2026-10-02', startTime: null },
				{ title: '3', startDate: '2026-10-03', startTime: null },
				{ title: '4', startDate: '2026-10-04', startTime: null },
				{ title: '5', startDate: '2026-10-05', startTime: null },
				{ title: '6', startDate: '2026-10-06', startTime: null },
			],
		})

		expect(events.map(event => event.title)).toEqual(['1', '2', '3', '4', '5'])
	})

	it('ignores an end that is not after the start', () => {
		const [event] = calendar.normalize({
			events: [
				{
					title: 'Стендап',
					startDate: '2026-10-10',
					startTime: '15:00',
					endDate: '2026-10-10',
					endTime: '14:00',
				},
			],
		})

		expect(event).toMatchObject({ endTime: '16:00', timedEnd: false })
	})

	it('notices a calendar phrase and ignores chatter', () => {
		expect(calendar.looksLikeEvent('созвон завтра в 15:00')).toBe(true)
		expect(calendar.looksLikeEvent('10.10 стоматолог')).toBe(true)
		expect(calendar.looksLikeEvent('привет')).toBe(false)
		expect(calendar.looksLikeEvent('купить молоко')).toBe(false)
	})
})
