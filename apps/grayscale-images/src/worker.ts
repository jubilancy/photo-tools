import { serveWorker } from '@tools/image-utils';
import { processGrayscale, type GrayscaleRequest, type GrayscaleResult } from './process';

serveWorker<GrayscaleRequest, GrayscaleResult>(processGrayscale);
