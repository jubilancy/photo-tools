import { serveWorker } from '@tools/image-utils';
import { processWatermark, type WatermarkRequest, type WatermarkResult } from './process';

serveWorker<WatermarkRequest, WatermarkResult>(processWatermark);
