import { blockExternalRequests, serveWorker } from '@tools/image-utils';
import { handle, type Request, type Response } from './process';

// MediaPipe ships a usage-statistics logger; this keeps every request on this site.
blockExternalRequests();
serveWorker<Request, Response>(handle);
