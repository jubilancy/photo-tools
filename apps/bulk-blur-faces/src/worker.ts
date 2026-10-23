import { serveWorker } from '@tools/image-utils';
import { handle, type Request, type Response } from './process';

serveWorker<Request, Response>(handle);
