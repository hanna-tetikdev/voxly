import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity('tasks')
export class Task {
	@PrimaryGeneratedColumn()
	id!: number

	@Column({ type: 'bigint' })
	userId!: number

	@Column({ type: 'text' })
	text!: string

	@Column({ type: 'boolean', default: false })
	completed!: boolean

	@Column({ type: 'int', nullable: true })
	transcriptionId!: number 

	@CreateDateColumn()
	createdAt!: Date

	@Column({ type: 'datetime', nullable: true })
	completedAt!: Date | null
}
