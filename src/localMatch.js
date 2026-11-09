export class LocalMatch extends EventTarget {
  readyState = 0;

  constructor() {
    super();
    this.worker = new Worker(
      new URL("./localMatchWorker.js", import.meta.url),
      {
        type: "module",
      },
    );
    this.worker.onmessage = (event) =>
      this.dispatchEvent(new MessageEvent("message", { data: event.data }));
    this.worker.onerror = () => this.dispatchEvent(new Event("error"));
    queueMicrotask(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    });
  }

  send(message) {
    this.worker.postMessage(message);
  }

  close() {
    this.readyState = 3;
    this.worker.terminate();
  }
}
