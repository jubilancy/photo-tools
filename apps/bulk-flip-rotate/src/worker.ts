import { serveWorker } from '@tools/image-utils';
import { processFlipRotate, type FlipRotateRequest, type FlipRotateResult } from './process';

serveWorker<FlipRotateRequest, FlipRotateResult>(processFlipRotate);
