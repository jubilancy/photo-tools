import { serveWorker } from '@tools/image-utils';
import { processCompress, type CompressRequest, type CompressResult } from './compress';

serveWorker<CompressRequest, CompressResult>(processCompress);
