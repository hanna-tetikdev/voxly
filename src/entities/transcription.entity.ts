import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity('transcriptions')
export class Transcription {
	@PrimaryGeneratedColumn()
	id!: number

	@Column({ type: 'bigint' })
	chatId!: number

	@Column({ type: 'bigint' })
	userId!: number

	@Column({ type: 'text' })
	text!: string

	@Column({ type: 'text', nullable: true })
	summary!: string

	@Column({ type: 'simple-array', nullable: true })
	tasks!: string[]

	@Column({ type: 'int' })
	duration!: number 

	@Column({ type: 'int', default: 0 })
	wordCount!: number

	@CreateDateColumn()
	createdAt!: Date
}
