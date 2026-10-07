import { Injectable, Logger } from '@nestjs/common'
import ffmpeg from 'fluent-ffmpeg'
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

export interface AudioSegment {
	start: number
	end: number
	text: string
	filePath: string
}

@Injectable()
export class AudioService {
	private readonly logger = new Logger(AudioService.name)

	async splitAudio(
		inputBuffer: ArrayBuffer,
		segments: Array<{ start: number; end: number; text: string }>,
		extension = 'ogg',
	): Promise<AudioSegment[]> {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxly-'))
		const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : 'ogg'
		const inputPath = path.join(tempDir, `input.${safeExtension}`)

		fs.writeFileSync(inputPath, Buffer.from(inputBuffer))

		const results: AudioSegment[] = []

		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i]
			const outputPath = path.join(tempDir, `segment_${i}.ogg`)

			try {
				await this.extractSegment(inputPath, outputPath, seg.start, seg.end)
				results.push({
					...seg,
					filePath: outputPath,
				})
				this.logger.log(`Extracted segment ${i}: ${seg.start}s - ${seg.end}s`)
			} catch (error) {
				this.logger.error(`Failed to extract segment ${i}: ${error}`)
			}
		}

		fs.unlinkSync(inputPath)

		return results
	}

	private extractSegment(
		inputPath: string,
		outputPath: string,
		start: number,
		end: number,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			ffmpeg(inputPath)
				.setStartTime(start)
				.setDuration(end - start)
				.output(outputPath)
				.audioCodec('libopus')
				.on('end', () => resolve())
				.on('error', (err) => reject(err))
				.run()
		})
	}

	async transcodeToOgg(inputBuffer: ArrayBuffer, extension: string): Promise<Buffer> {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxly-'))
		const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : 'bin'
		const inputPath = path.join(tempDir, `input.${safeExtension}`)
		const outputPath = path.join(tempDir, 'audio.ogg')
		fs.writeFileSync(inputPath, Buffer.from(inputBuffer))

		try {
			await new Promise<void>((resolve, reject) => {
				ffmpeg(inputPath)
					.noVideo()
					.audioCodec('libopus')
					.audioFrequency(16000)
					.audioChannels(1)
					.format('ogg')
					.output(outputPath)
					.on('end', () => resolve())
					.on('error', (error: Error) => reject(error))
					.run()
			})
			return fs.readFileSync(outputPath)
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	}

	cleanupSegments(segments: AudioSegment[]): void {
		for (const seg of segments) {
			try {
				if (fs.existsSync(seg.filePath)) {
					fs.unlinkSync(seg.filePath)
				}
			} catch {
				// ignore cleanup errors
			}
		}
	
		if (segments.length > 0) {
			const dir = path.dirname(segments[0].filePath)
			try {
				fs.rmdirSync(dir)
			} catch {
				// ignore
			}
		}
	}
}
