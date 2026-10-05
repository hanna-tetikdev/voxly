import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Like } from 'typeorm'

interface RawStatsResult {
	count: string
	duration: string
	words?: string
}
import { Transcription } from '../entities/transcription.entity'

export interface TranscriptionStats {
	totalMessages: number
	totalDuration: number 
	totalWords: number
	thisWeek: {
		messages: number
		duration: number
	}
	thisMonth: {
		messages: number
		duration: number
	}
}

@Injectable()
export class TranscriptionService {
	private readonly logger = new Logger(TranscriptionService.name)

	constructor(
		@InjectRepository(Transcription)
		private readonly repo: Repository<Transcription>,
	) {}

	async save(data: {
		chatId: number
		userId: number
		text: string
		summary?: string
		tasks?: string[]
		duration: number
	}): Promise<Transcription> {
		const transcription = this.repo.create({
			...data,
			wordCount: data.text.split(/\s+/).length,
		})
		const saved = await this.repo.save(transcription)
		this.logger.log(`Saved transcription ${saved.id} for user ${data.userId}`)
		return saved
	}

	async search(userId: number, query: string): Promise<Transcription[]> {
		return this.repo.find({
			where: [
				{ userId, text: Like(`%${query}%`) },
				{ userId, summary: Like(`%${query}%`) },
			],
			order: { createdAt: 'DESC' },
			take: 10,
		})
	}

	async getStats(userId: number): Promise<TranscriptionStats> {
		const now = new Date()
		const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
		const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

		const allTime = await this.repo
			.createQueryBuilder('t')
			.select('COUNT(*)', 'count')
			.addSelect('SUM(t.duration)', 'duration')
			.addSelect('SUM(t.wordCount)', 'words')
			.where('t.userId = :userId', { userId })
			.getRawOne<RawStatsResult>()

		const weekly = await this.repo
			.createQueryBuilder('t')
			.select('COUNT(*)', 'count')
			.addSelect('SUM(t.duration)', 'duration')
			.where('t.userId = :userId', { userId })
			.andWhere('t.createdAt >= :weekAgo', { weekAgo })
			.getRawOne<RawStatsResult>()

		const monthly = await this.repo
			.createQueryBuilder('t')
			.select('COUNT(*)', 'count')
			.addSelect('SUM(t.duration)', 'duration')
			.where('t.userId = :userId', { userId })
			.andWhere('t.createdAt >= :monthAgo', { monthAgo })
			.getRawOne<RawStatsResult>()

		return {
			totalMessages: parseInt(allTime?.count ?? '0'),
			totalDuration: parseInt(allTime?.duration ?? '0'),
			totalWords: parseInt(allTime?.words ?? '0'),
			thisWeek: {
				messages: parseInt(weekly?.count ?? '0'),
				duration: parseInt(weekly?.duration ?? '0'),
			},
			thisMonth: {
				messages: parseInt(monthly?.count ?? '0'),
				duration: parseInt(monthly?.duration ?? '0'),
			},
		}
	}

	async getRecent(userId: number, limit = 5): Promise<Transcription[]> {
		return this.repo.find({
			where: { userId },
			order: { createdAt: 'DESC' },
			take: limit,
		})
	}
}
