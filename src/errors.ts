export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {}

export class HostStoreError extends AppError {}

export class HostNotFoundError extends AppError {}

export class SessionError extends AppError {}

export class SessionNotFoundError extends SessionError {}

export class SessionExistsError extends SessionError {}

export class SessionBusyError extends SessionError {}

export class CLIError extends AppError {}
