import { detectAllRuntimes, type RuntimeDoctorReport } from '../core/runtime/detect.js';
import { formatDoctorReportHuman } from '../core/output/human.js';
import { formatDoctorReportJson } from '../core/output/json.js';

export interface DoctorCommandOptions {
  json: boolean;
  detector?: () => Promise<RuntimeDoctorReport[]>;
}

export interface DoctorCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runDoctorCommand(options: DoctorCommandOptions): Promise<DoctorCommandResult> {
  try {
    const detector = options.detector ?? detectAllRuntimes;
    const reports = await detector();
    const stdout = options.json
      ? JSON.stringify(formatDoctorReportJson(reports), null, 2)
      : formatDoctorReportHuman(reports);

    return {
      exitCode: 0,
      stdout,
      stderr: '',
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: error instanceof Error ? error.message : 'doctor command failed',
    };
  }
}
