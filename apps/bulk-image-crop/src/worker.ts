import { serveWorker } from '@tools/image-utils';
import { processCrop, type CropRequest, type CropResult } from './process';

serveWorker<CropRequest, CropResult>(processCrop);
