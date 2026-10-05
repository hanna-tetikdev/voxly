import { Injectable, Logger } from '@nestjs/common'
import { createCanvas } from 'canvas'
import type { CanvasRenderingContext2D } from 'canvas'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface CardData {
	summary: string
	duration: number
	date: Date
}

@Injectable()
export class ImageService {
	private readonly logger = new Logger(ImageService.name)

	generateCard(data: CardData): string {
		const width = 1080
		const height = 1350 

		const canvas = createCanvas(width, height)
		const ctx = canvas.getContext('2d')

		const gradient = ctx.createLinearGradient(0, 0, width, height)
		gradient.addColorStop(0, '#667eea')
		gradient.addColorStop(0.5, '#764ba2')
		gradient.addColorStop(1, '#f093fb')
		ctx.fillStyle = gradient
		ctx.fillRect(0, 0, width, height)

		ctx.globalAlpha = 0.1
		ctx.fillStyle = '#ffffff'
		ctx.beginPath()
		ctx.arc(100, 200, 300, 0, Math.PI * 2)
		ctx.fill()
		ctx.beginPath()
		ctx.arc(900, 1100, 400, 0, Math.PI * 2)
		ctx.fill()
		ctx.globalAlpha = 1

		const cardX = 60
		const cardY = 200
		const cardWidth = width - 120
		const cardHeight = height - 400
		const radius = 30

		ctx.fillStyle = '#ffffff'
		ctx.beginPath()
		ctx.roundRect(cardX, cardY, cardWidth, cardHeight, radius)
		ctx.fill()

		ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
		ctx.shadowBlur = 40
		ctx.shadowOffsetY = 20

		ctx.fillStyle = '#667eea'
		ctx.font = 'bold 80px Arial'
		ctx.textAlign = 'center'
		ctx.fillText('🎙️', width / 2, cardY + 100)

		ctx.shadowBlur = 0
		ctx.shadowOffsetY = 0
		ctx.fillStyle = '#1a1a2e'
		ctx.font = 'bold 42px Arial'
		ctx.textAlign = 'center'
		ctx.fillText('Голосовая заметка', width / 2, cardY + 170)

		const dateStr = data.date.toLocaleDateString('ru-RU', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
		})
		const durationStr = this.formatDuration(data.duration)

		ctx.fillStyle = '#666666'
		ctx.font = '28px Arial'
		ctx.fillText(`${dateStr} • ${durationStr}`, width / 2, cardY + 220)

		ctx.strokeStyle = '#eeeeee'
		ctx.lineWidth = 2
		ctx.beginPath()
		ctx.moveTo(cardX + 60, cardY + 260)
		ctx.lineTo(cardX + cardWidth - 60, cardY + 260)
		ctx.stroke()

		ctx.fillStyle = '#333333'
		ctx.font = '32px Arial'
		ctx.textAlign = 'left'
		const lines = this.wrapText(ctx, data.summary, cardWidth - 120)
		let y = cardY + 320
		for (const line of lines.slice(0, 12)) {
			ctx.fillText(line, cardX + 60, y)
			y += 45
		}

		ctx.fillStyle = '#ffffff'
		ctx.font = 'bold 36px Arial'
		ctx.textAlign = 'center'
		ctx.fillText('voxly', width / 2, height - 80)

		ctx.fillStyle = 'rgba(255,255,255,0.7)'
		ctx.font = '24px Arial'
		ctx.fillText('голос → текст → смысл', width / 2, height - 40)

		const tempPath = path.join(os.tmpdir(), `voxly-card-${Date.now()}.png`)
		const buffer = canvas.toBuffer('image/png')
		fs.writeFileSync(tempPath, buffer)

		this.logger.log(`Generated card: ${tempPath}`)
		return tempPath
	}

	private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
		const words = text.split(' ')
		const lines: string[] = []
		let currentLine = ''

		for (const word of words) {
			const testLine = currentLine ? `${currentLine} ${word}` : word
			const metrics = ctx.measureText(testLine)

			if (metrics.width > maxWidth && currentLine) {
				lines.push(currentLine)
				currentLine = word
			} else {
				currentLine = testLine
			}
		}

		if (currentLine) {
			lines.push(currentLine)
		}

		return lines
	}

	private formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60)
		const secs = seconds % 60
		if (mins > 0) {
			return `${mins} мин ${secs} сек`
		}
		return `${secs} сек`
	}

	cleanup(filePath: string): void {
		try {
			if (fs.existsSync(filePath)) {
				fs.unlinkSync(filePath)
			}
		} catch {
			// ignore
		}
	}
}
