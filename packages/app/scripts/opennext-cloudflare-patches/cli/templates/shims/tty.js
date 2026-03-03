export function isatty() {
  return false;
}

export class WriteStream {}
export class ReadStream {}

export default {
  isatty,
  WriteStream,
  ReadStream,
};
