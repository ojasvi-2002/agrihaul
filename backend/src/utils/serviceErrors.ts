// Thrown by services for a request that's malformed in a business sense
// (e.g. references another organization's record). Express 5 forwards
// rejected promises to the error middleware in app.ts, which translates
// this into the right HTTP status instead of a generic 500.
export class ServiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
