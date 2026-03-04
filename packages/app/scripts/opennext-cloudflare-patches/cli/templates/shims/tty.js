export function isatty() {
  return false;
}

export class WriteStream {}
export class ReadStream {}

const ttyShim = {
  isatty,
  WriteStream,
  ReadStream,
};

export default ttyShim;
