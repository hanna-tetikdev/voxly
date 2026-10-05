import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Task } from '../entities/task.entity'

@Injectable()
export class TaskService {
	private readonly logger = new Logger(TaskService.name)

	constructor(
		@InjectRepository(Task)
		private readonly repo: Repository<Task>,
	) {}

	async createTasks(userId: number, tasks: string[], transcriptionId?: number): Promise<Task[]> {
		const created: Task[] = []
		
		const existingTasks = await this.repo.find({
			where: { userId, completed: false },
		})
		const existingTexts = new Set(existingTasks.map((t) => t.text.toLowerCase().trim()))

		for (const text of tasks) {
			const normalizedText = text.toLowerCase().trim()

			if (existingTexts.has(normalizedText)) {
				this.logger.log(`Skipping duplicate task: ${text}`)
				continue
			}

			const task = this.repo.create({
				userId,
				text,
				transcriptionId,
				completed: false,
			})
			created.push(await this.repo.save(task))
			existingTexts.add(normalizedText) 
		}
		
		this.logger.log(`Created ${created.length} new tasks for user ${userId}`)
		return created
	}

	async getActiveTasks(userId: number): Promise<Task[]> {
		return this.repo.find({
			where: { userId, completed: false },
			order: { createdAt: 'DESC' },
		})
	}

	async getAllTasks(userId: number, limit = 20): Promise<Task[]> {
		return this.repo.find({
			where: { userId },
			order: { createdAt: 'DESC' },
			take: limit,
		})
	}

	async completeTask(userId: number, taskId: number): Promise<Task | null> {
		const task = await this.repo.findOne({
			where: { id: taskId, userId },
		})

		if (!task) return null

		task.completed = true
		task.completedAt = new Date()
		return this.repo.save(task)
	}

	async uncompleteTask(userId: number, taskId: number): Promise<Task | null> {
		const task = await this.repo.findOne({
			where: { id: taskId, userId },
		})

		if (!task) return null

		task.completed = false
		task.completedAt = null
		return this.repo.save(task)
	}

	async deleteTask(userId: number, taskId: number): Promise<boolean> {
		const result = await this.repo.delete({ id: taskId, userId })
		return (result.affected ?? 0) > 0
	}

	async getStats(userId: number): Promise<{ total: number; completed: number; pending: number }> {
		const total = await this.repo.count({ where: { userId } })
		const completed = await this.repo.count({ where: { userId, completed: true } })
		return {
			total,
			completed,
			pending: total - completed,
		}
	}

	async clearCompleted(userId: number): Promise<number> {
		const result = await this.repo.delete({ userId, completed: true })
		return result.affected ?? 0
	}

	async clearAll(userId: number): Promise<number> {
		const result = await this.repo.delete({ userId })
		return result.affected ?? 0
	}
}
