import { serveWorker } from '@tools/image-utils';
import { processResize, type ResizeRequest, type ResizeResult } from './process';

serveWorker<ResizeRequest, ResizeResult>(processResize);
