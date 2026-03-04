export function runInNewContext(code, context = {}) {
  const fn = new Function("context", `with (context) { ${code} }`);
  return fn(context);
}

const vmShim = {
  runInNewContext,
};

export default vmShim;
