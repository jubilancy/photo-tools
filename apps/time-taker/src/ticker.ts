// Timers in a dedicated worker are not throttled as hard as timers on a hidden page's main thread.
setInterval(() => postMessage(Date.now()), 100);
